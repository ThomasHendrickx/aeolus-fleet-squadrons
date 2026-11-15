import { afterEach, describe, expect, it, vi } from 'vitest';

import { createShipWakeups } from './ship-wakeups.js';

const encoder = new TextEncoder();

function aStream() {
  let writer: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; } });
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    write: (text: string) => { writer?.enqueue(encoder.encode(text)); },
    close: () => { writer?.close(); },
  };
}

async function started(responses: (Response | Error)[] = [], options: { look?: () => Promise<void>; random?: () => number } = {}) {
  vi.useFakeTimers();
  const streams = [aStream(), aStream()];
  let opened = 0;
  let looks = 0;
  const signals: (AbortSignal | null | undefined)[] = [];
  const wakeups = createShipWakeups({
    fleetUrl: 'https://fleet.example',
    fetch: (_input, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-crew');
      const response = responses.shift() ?? streams[Math.min(opened, 1)]?.response;
      opened += 1;
      signals.push(init?.signal);
      if (response instanceof Error) { return Promise.reject(response); }
      return Promise.resolve(response ?? new Response(null, { status: 503 }));
    },
    random: options.random ?? (() => 0),
    look: () => { looks += 1; return options.look?.() ?? Promise.resolve(); },
    ended: () => Promise.resolve(),
    failed: () => undefined,
  });
  const stop = wakeups('test-crew');
  await vi.advanceTimersByTimeAsync(0);
  return { streams, stop, signals, looks: () => looks, opened: () => opened };
}

afterEach(() => vi.useRealTimers());

describe('ship wake stream', () => {
  it('looks on a fragmented wake event', async () => {
    const running = await started();
    running.streams[0]?.write('event: wa');
    running.streams[0]?.write('ke\r\ndata: {"reason":"open"}\r\n\r\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(running.looks()).toBe(1);
    running.stop();
  });

  it('looks on another wake while the stream remains open', async () => {
    const running = await started();
    try {
      running.streams[0]?.write('event: wake\n\n');
      await vi.advanceTimersByTimeAsync(0);
      running.streams[0]?.write('event: wake\n\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(running.looks()).toBe(2);
    } finally { running.stop(); }
  });

  it('reopens a dropped stream after the spread', async () => {
    const running = await started();
    running.streams[0]?.close();
    await vi.advanceTimersByTimeAsync(999);
    expect(running.opened()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(running.opened()).toBe(2);
    running.stop();
  });

  it('looks on the open wake of a reopened stream', async () => {
    const running = await started();
    try {
      running.streams[0]?.close();
      await vi.advanceTimersByTimeAsync(1000);
    } finally { running.stop(); }
  });

  it('reopens after exactly sixty seconds without bytes', async () => {
    const running = await started();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(running.opened()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(running.opened()).toBe(2);
    running.stop();
  });

  it('looks after five minutes without a wake while keep-alives keep the stream open', async () => {
    const running = await started();
    for (let round = 0; round < 12; round += 1) {
      running.streams[0]?.write(': keep-alive\n\n');
      await vi.advanceTimersByTimeAsync(25_000);
    }
    expect(running.looks()).toBe(1);
    expect(running.opened()).toBe(1);
    running.stop();
  });

  it('stops after an end event without reopening or looking again', async () => {
    const running = await started();
    running.streams[0]?.write('event: end\ndata: {"code":"LEASE_ENDED","message":"ended"}\n\n');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(running.opened()).toBe(1);
    expect(running.looks()).toBe(0);
    running.stop();
  });

  it('stops when opening is refused with LEASE_ENDED', async () => {
    const running = await started([Response.json({ code: 'LEASE_ENDED', message: 'ended' }, { status: 401 })]);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(running.opened()).toBe(1);
    expect(running.looks()).toBe(0);
    running.stop();
  });

  it('doubles reopening delays while core is down up to sixty seconds', async () => {
    const running = await started(Array.from({ length: 10 }, () => new Response(null, { status: 503 })));
    for (const delay of [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000]) {
      const before = running.opened();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(running.opened()).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(running.opened()).toBe(before + 1);
    }
    running.stop();
  });
});


describe('wake delivery guarantees', () => {
  it('a wake during an in-flight look causes exactly one more look', async () => {
    const first = Promise.withResolvers<undefined>();
    const second = Promise.withResolvers<undefined>();
    let calls = 0;
    const running = await started([], { look: async () => {
      calls += 1;
      await (calls === 1 ? first.promise : second.promise);
    } });
    try {
      running.streams[0]?.write('event: wake\ndata: {}\n\n');
      await vi.advanceTimersByTimeAsync(0);
      running.streams[0]?.write('event: wake\ndata: {}\n\nevent: wake\ndata: {}\n\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);
      first.resolve(undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(2);
      second.resolve(undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(2);
    } finally { first.resolve(undefined); second.resolve(undefined); running.stop(); }
  });

  it('aborts the stream on stop and never reopens or looks again', async () => {
    const running = await started();
    expect(running.signals[0]?.aborted).toBe(false);
    running.stop();
    expect(running.signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect({ opened: running.opened(), looks: running.looks() }).toEqual({ opened: 1, looks: 0 });
  });

  it.each([
    { reason: 'a network error', refusal: new Error('network unavailable') },
    { reason: 'a 401 other than LEASE_ENDED', refusal: Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 }) },
  ])('reopens after $reason following the spread', async ({ refusal }) => {
    const running = await started([refusal]);
    try {
      await vi.advanceTimersByTimeAsync(999);
      expect(running.opened()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(running.opened()).toBe(2);
      running.streams[1]?.write('event: wake\ndata: {"reason":"open"}\n\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(running.looks()).toBe(1);
    } finally { running.stop(); }
  });

  it.each([
    { reason: 'a network error', refusal: new Error('network unavailable') },
    { reason: 'a 401 other than LEASE_ENDED', refusal: Response.json({ code: 'UNAUTHENTICATED', message: 'unauthenticated' }, { status: 401 }) },
  ])('looks on the reopened stream wake after $reason', async ({ refusal }) => {
    const running = await started([refusal]);
    try {
      await vi.advanceTimersByTimeAsync(1000);
      running.streams[1]?.write('event: wake\ndata: {"reason":"open"}\n\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(running.looks()).toBe(1);
    } finally { running.stop(); }
  });

});



it('spreads a refused FLEET_BUSY opening up to five seconds', async () => {
  const running = await started([Response.json({ code: 'FLEET_BUSY' }, { status: 503 })], { random: () => 1 });
  try {
    await vi.advanceTimersByTimeAsync(4999);
    expect(running.opened()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(running.opened()).toBe(2);
  } finally { running.stop(); }
});

it('keep-alive bytes reset the sixty second silence deadline', async () => {
  const running = await started();
  try {
    await vi.advanceTimersByTimeAsync(59_999);
    running.streams[0]?.write(': keep-alive\n\n');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(running.opened()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(running.opened()).toBe(2);
  } finally { running.stop(); }
});

it('stopping during a look discards the pending wake', async () => {
  const held = Promise.withResolvers<undefined>();
  const running = await started([], { look: () => held.promise });
  running.streams[0]?.write('event: wake\n\nevent: wake\n\n');
  await vi.advanceTimersByTimeAsync(0);
  running.stop();
  held.resolve(undefined);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(running.looks()).toBe(1);
});

it('looks remain serialized while the first receive waits', async () => {
  const held = Promise.withResolvers<undefined>();
  let active = 0;
  let maximum = 0;
  const running = await started([], { look: async () => { active += 1; maximum = Math.max(active, maximum); await held.promise; active -= 1; } });
  try {
    running.streams[0]?.write('event: wake\n\nevent: wake\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(maximum).toBe(1);
  } finally { held.resolve(undefined); running.stop(); }
});

it('a stopped opening ignores a late lease-ended answer', async () => {
  vi.useFakeTimers();
  const opening = Promise.withResolvers<Response>();
  let endings = 0;
  const stop = createShipWakeups({
    fleetUrl: 'https://fleet.example', fetch: () => opening.promise,
    look: () => Promise.resolve(), ended: () => { endings += 1; return Promise.resolve(); }, failed: () => undefined,
  })('crew');
  stop();
  opening.resolve(Response.json({ code: 'LEASE_ENDED' }, { status: 401 }));
  await vi.advanceTimersByTimeAsync(0);
  expect(endings).toBe(0);
});

it('a stopped reader ignores an end event delivered with its final bytes', async () => {
  vi.useFakeTimers();
  const stream = aStream();
  let endings = 0;
  const stop = createShipWakeups({
    fleetUrl: 'https://fleet.example', fetch: () => Promise.resolve(stream.response),
    look: () => Promise.resolve(), ended: () => { endings += 1; return Promise.resolve(); }, failed: () => undefined,
  })('crew');
  await vi.advanceTimersByTimeAsync(0);
  stream.write('event: end\ndata: {"code":"LEASE_ENDED","message":"ended"}\n\n');
  stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(endings).toBe(0);
});

it('a wake resets the reopening delay after earlier refused openings', async () => {
  const running = await started([new Response(null, { status: 503 }), new Response(null, { status: 503 })]);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    running.streams[1]?.write('event: wake\n\n');
    await vi.advanceTimersByTimeAsync(0);
    running.streams[1]?.close();
    await vi.advanceTimersByTimeAsync(999);
    expect(running.opened()).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(running.opened()).toBe(4);
  } finally { running.stop(); }
});


it('a wake restarts the five minute safety deadline', async () => {
  const running = await started();
  try {
    await vi.advanceTimersByTimeAsync(1000);
    running.streams[0]?.write('event: wake\n\n');
    await vi.advanceTimersByTimeAsync(299_000);
    expect(running.looks()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(running.looks()).toBe(2);
  } finally { running.stop(); }
});

it('a left-behind safety callback cannot look after stopping', async () => {
  const running = await started();
  const timers = vi.spyOn(globalThis, 'setTimeout');
  running.streams[0]?.write('event: wake\n\n');
  await vi.advanceTimersByTimeAsync(0);
  const callback = timers.mock.calls.find((call) => call[1] === 300_000)?.[0];
  running.stop();
  if (typeof callback !== 'function') { throw new Error('missing safety timer'); }
  callback();
  await vi.advanceTimersByTimeAsync(0);
  expect(running.looks()).toBe(1);
  timers.mockRestore();
});

it('an end event with another refusal code keeps accepting wakes', async () => {
  const running = await started();
  try {
    running.streams[0]?.write('event: end\ndata: {"code":"UNAUTHENTICATED","message":"other"}\n\nevent: wake\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(running.looks()).toBe(1);
  } finally { running.stop(); }
});

it('an aborted opening does not report its rejection as a failure', async () => {
  vi.useFakeTimers();
  const opening = Promise.withResolvers<Response>();
  const failures: unknown[] = [];
  const stop = createShipWakeups({
    fleetUrl: 'https://fleet.example', fetch: () => opening.promise,
    look: () => Promise.resolve(), ended: () => Promise.resolve(), failed: (error) => { failures.push(error); },
  })('crew');
  stop();
  opening.reject(new Error('aborted'));
  await vi.advanceTimersByTimeAsync(0);
  expect(failures).toEqual([]);
});

it.each([
  { data: '{"code":"OTHER","message":"LEASE_ENDED"}', reason: 'a message mentioning LEASE_ENDED' },
  { data: '{"code":"LEASE_ENDED"}', reason: 'a refusal missing its message' },
])('ignores an end event with $reason', async ({ data }) => {
  const running = await started();
  try {
    running.streams[0]?.write(`event: end\ndata: ${data}\n\nevent: wake\n\n`);
    await vi.advanceTimersByTimeAsync(0);
    expect(running.looks()).toBe(1);
  } finally { running.stop(); }
});
