/** Flagship leases use real stream readers with only fleet I/O and persistence replaced. */
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';

import { FLEET_ID, OTHER_FLEET_ID, SHIP_ID, fakeManagementFleet, memoryManagementStore } from '../../../test/support/management-fakes.js';
import type { FleetId } from '@aeolus-fleet/common';
import type { ReceivedMessage } from '../../core/management/ports.js';
import { ok } from '../../core/shared/result.js';
import { createShipWakeups } from '../fleet/ship-wakeups.js';
import { watchFlagships } from './flagship-watch.js';
import { createFleetTurns } from './fleet-turns.js';
import { memoryKeyOutages } from '../../../test/support/memory-key-outages.js';
import type { Squadron } from '../../core/squadron/squadron.js';
const AT = new Date(0);
const FLAGSHIP = SHIP_ID;
const forming: Squadron = {
  id: 'team-a1b2c3',
  fleetId: FLEET_ID,
  state: 'forming',
  blueprint: { repository: 'example.com/templates', name: 'team', version: 1, file: 'squadrons/fixture.yaml', commit: 'b1', committedAt: AT, description: 'A team.', roles: [], handoffs: [], memberNames: 'plain' },
  templates: [],
  flagship: { shipId: FLAGSHIP, name: 'team-a1b2c3', crewToken: 'aeolus_ct_v1_flagship' },
  members: [],
  formedAt: AT,
  sailedAt: null,
  formingShip: null,
};

const log = Fastify({ logger: false }).log;
const delivery: ReceivedMessage = { deliveryId: 'dlv_01m3tbfspe96yf1rnr4ank0001', messageId: 'msg_01m3tbfspe96yf1rnr4ank0001', senderShipId: SHIP_ID, senderName: 'lead', contentType: 'text/plain', payload: 'stored while down', inReplyTo: null };

async function aWatcher(receive?: (token: string, signal?: AbortSignal) => Promise<ReceivedMessage[]>, options: { refusal?: number; list?: (fleetId: FleetId, squadrons: Squadron[]) => Promise<Squadron[]> } = {}) {
  vi.useFakeTimers();
  const management = memoryManagementStore();
  for (const fleetId of [FLEET_ID, OTHER_FLEET_ID]) {
    await management.save({ fleetId, shipId: SHIP_ID, name: 'squadrons', crewToken: fleetId, crewedAt: new Date(0) });
  }
  const squadrons = new Map<FleetId, Squadron[]>([FLEET_ID, OTHER_FLEET_ID].map((fleetId) => [fleetId, [{ ...forming, fleetId, flagship: { ...forming.flagship, crewToken: fleetId } }]]));
  let openings = 0;
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const signals: AbortSignal[] = [];
  const received: string[] = [];
  const handled: ReceivedMessage[] = [];
  const served = new Set<FleetId>([FLEET_ID, OTHER_FLEET_ID]);
  const make = () => watchFlagships({
    management, squadrons: { exists: () => Promise.resolve(true), create: () => Promise.resolve(), update: () => Promise.resolve(), list: (fleetId) => options.list?.(fleetId, squadrons.get(fleetId) ?? []) ?? Promise.resolve(squadrons.get(fleetId) ?? []) },
    advanceStandDowns: () => Promise.resolve(), recoverFormations: () => Promise.resolve(), deleteUnusedBuiltTemplates: () => Promise.resolve(0), operator: { tell: () => Promise.resolve() }, reach: { keep: () => Promise.resolve(), withdraw: () => Promise.resolve() }, turns: createFleetTurns(), outages: memoryKeyOutages(), clock: { now: () => AT },
    isServed: (fleetId) => Promise.resolve(served.has(fleetId)), log, rescanMs: 10_000,
    door: { ...fakeManagementFleet().door, receive: async (token, until) => { received.push(token); if (received.length > 10) { throw new Error("unexpected continuous receiving"); } return ok(await receive?.(token, until?.signal) ?? []); } },
    handle: (_crew, message) => { handled.push(message); return Promise.resolve(ok('kept')); },
    start: (token: string, events: { look: () => Promise<void>; ended: () => Promise<void> }) => createShipWakeups({
      fleetUrl: 'https://fleet.example', ...events, failed: () => undefined, random: () => 0,
      fetch: (_url, init) => {
        openings += 1;
        if (options.refusal !== undefined && openings === 1) { return Promise.resolve(new Response(JSON.stringify({ code: options.refusal === 401 ? 'UNAUTHORIZED' : 'FLEET_BUSY', message: 'retry' }), { status: options.refusal })); }
        if (init?.signal) { signals.push(init.signal); }
        return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.set(token, controller); } })));
      },
    })(token),
  });
  const wake = (token = FLEET_ID) => streams.get(token)?.enqueue(new TextEncoder().encode('event: wake\ndata: {"reason":"open"}\n\n'));
  return { make, management, received, handled, served, streams, signals, wake, squadrons };
}

afterEach(() => vi.useRealTimers());

it('does not receive before the open wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    await vi.advanceTimersByTimeAsync(0);
    expect(running.received).toEqual([]);
  } finally { await watcher.stop(); }
});

it('receives once on the open wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(running.received).toEqual([FLEET_ID]);
  } finally { await watcher.stop(); }
});

it('waits for another wake after an empty receive', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.wake();
    await vi.advanceTimersByTimeAsync(0);
    running.received.length = 0;
    await vi.advanceTimersByTimeAsync(100);
    expect(running.received).toEqual([]);
  } finally { await watcher.stop(); }
});

it('one slow flagship does not block another flagship', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>();
  const running = await aWatcher((token) => token === FLEET_ID ? slow.promise : Promise.resolve([delivery]));
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.wake();
    running.wake(OTHER_FLEET_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(running.handled).toEqual([delivery]);
  } finally { slow.resolve([]); await watcher.stop(); }
});

it('restart reconciles then the open wake receives what was stored while the stream was down', async () => {
  const stored: ReceivedMessage[] = [];
  const running = await aWatcher(() => Promise.resolve(stored.splice(0)));
  const before = running.make();
  await before.rescan();
  await before.stop();
  stored.push(delivery);
  const restarted = running.make();
  try {
    await restarted.rescan();
    expect(running.handled).toEqual([]);
    running.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(running.handled).toEqual([delivery]);
  } finally { await restarted.stop(); }
});

it('shutdown aborts every stream and nothing reopens', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  await watcher.rescan();
  await vi.advanceTimersByTimeAsync(0);
  await watcher.stop();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(running.signals.map((signal) => signal.aborted)).toEqual([true, true]);
});

it('switching a fleet off aborts its stream at reconciliation', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.served.delete(FLEET_ID);
    await watcher.rescan();
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false]);
  } finally { await watcher.stop(); }
});

it('overlapping reconciliations open just one stream per lease', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await Promise.all([watcher.rescan(), watcher.rescan(), watcher.rescan()]);
    expect(running.signals).toHaveLength(2);
  } finally { await watcher.stop(); }
});

it('reconciling after shutdown opens nothing', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  await watcher.stop();
  await watcher.rescan();
  expect(running.signals).toEqual([]);
});

it('one wake receives all eleven stored deliveries across full pages', async () => {
  const stored = Array.from({ length: 11 }, () => delivery);
  const running = await aWatcher(() => Promise.resolve(stored.splice(0, 10)));
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(running.handled).toHaveLength(11);
  } finally { await watcher.stop(); }
});

it('a wake during a flagship look causes exactly one more look', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>();
  const running = await aWatcher(() => slow.promise);
  const watcher = running.make();
  try { await watcher.rescan(); running.wake(); await vi.advanceTimersByTimeAsync(0); running.wake(); running.wake(); await vi.advanceTimersByTimeAsync(0); slow.resolve([]); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([FLEET_ID, FLEET_ID]); } finally { slow.resolve([]); await watcher.stop(); }
});
it('flagship looks remain serialized while receive waits', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>();
  const running = await aWatcher(() => slow.promise);
  const watcher = running.make();
  try { await watcher.rescan(); running.wake(); await vi.advanceTimersByTimeAsync(0); running.wake(); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([FLEET_ID]); } finally { slow.resolve([]); await watcher.stop(); }
});


it('replacing a flagship lease aborts the old stream and opens its new lease', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.squadrons.set(FLEET_ID, [{ ...forming, flagship: { ...forming.flagship, crewToken: 'replacement' } }]);
    await watcher.rescan();
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false, false]);
  } finally { await watcher.stop(); }
});
it('disbanding a squadron aborts its flagship stream', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan(); running.squadrons.set(FLEET_ID, [{ ...forming, state: 'disbanded' }]); await watcher.rescan();
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false]);
  } finally { await watcher.stop(); }
});
it('a released flagship stream is never reopened by reconciliation', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.streams.get(FLEET_ID)?.enqueue(new TextEncoder().encode('event: end\ndata: {"code":"LEASE_ENDED","message":"released"}\n\n'));
    await vi.advanceTimersByTimeAsync(0);
    running.served.delete(FLEET_ID); await watcher.rescan(); running.served.add(FLEET_ID); await watcher.rescan();
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false]);
  } finally { await watcher.stop(); }
});
it('one slow flagship does not block another in the same fleet', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>();
  const running = await aWatcher((token) => token === 'second' ? Promise.resolve([delivery]) : slow.promise);
  const watcher = running.make();
  running.squadrons.set(FLEET_ID, [ { ...forming, flagship: { ...forming.flagship, crewToken: FLEET_ID } }, { ...forming, id: 'second', flagship: { ...forming.flagship, crewToken: 'second' } } ]);
  try { await watcher.rescan(); running.wake(); running.streams.get('second')?.enqueue(new TextEncoder().encode('event: wake\ndata: {}\n\n')); await vi.advanceTimersByTimeAsync(0); expect(running.handled).toEqual([delivery]); } finally { slow.resolve([]); await watcher.stop(); }
});
it('reopens a flagship stream after a network error and receives its open wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan(); running.streams.get(FLEET_ID)?.error(new Error('network failed')); await vi.advanceTimersByTimeAsync(1_000); running.wake(); await vi.advanceTimersByTimeAsync(0);
    expect(running.received).toEqual([FLEET_ID]);
  } finally { await watcher.stop(); }
});
it('reopens a flagship stream after a non-LEASE_ENDED 401', async () => {
  const running = await aWatcher(undefined, { refusal: 401 });
  const watcher = running.make();
  try { await watcher.rescan(); await vi.advanceTimersByTimeAsync(1_000); running.wake(); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([FLEET_ID]); } finally { await watcher.stop(); }
});
it('FLEET_BUSY refuses an opening until the flagship stream backoff expires', async () => {
  const running = await aWatcher(undefined, { refusal: 429 });
  const watcher = running.make();
  try { await watcher.rescan(); await vi.advanceTimersByTimeAsync(999); expect(running.streams.has(FLEET_ID)).toBe(false); } finally { await watcher.stop(); }
});
it('FLEET_BUSY reopens the flagship stream after backoff', async () => {
  const running = await aWatcher(undefined, { refusal: 429 });
  const watcher = running.make();
  try { await watcher.rescan(); await vi.advanceTimersByTimeAsync(1_000); expect(running.streams.has(FLEET_ID)).toBe(true); } finally { await watcher.stop(); }
});
it('sixty seconds of silence aborts a flagship stream', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try { await watcher.rescan(); await vi.advanceTimersByTimeAsync(60_000); expect(running.signals.slice(0, 2).map((signal) => signal.aborted)).toEqual([true, true]); } finally { await watcher.stop(); }
});
it('a flagship safety look receives after five minutes without a wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    for (let interval = 0; interval < 6; interval += 1) {
      for (const stream of running.streams.values()) { stream.enqueue(new TextEncoder().encode(': alive\n\n')); }
      await vi.advanceTimersByTimeAsync(50_000);
    }
    expect(running.received).toEqual([FLEET_ID, OTHER_FLEET_ID]);
  } finally { await watcher.stop(); }
});

it('shutdown aborts a flagship receive already waiting in core', async () => {
  let signal: AbortSignal | undefined;
  const running = await aWatcher((_token, until) => { signal = until; return new Promise((resolve) => { until?.addEventListener('abort', () => { resolve([]); }, { once: true }); }); });
  const watcher = running.make(); await watcher.rescan(); running.wake(); await vi.advanceTimersByTimeAsync(0); await watcher.stop();
  expect(signal?.aborted).toBe(true);
});
it('shutdown ignores a late flagship receive answer', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>(); const running = await aWatcher(() => slow.promise);
  const watcher = running.make();
  await watcher.rescan(); running.wake(); await vi.advanceTimersByTimeAsync(0); const stopped = watcher.stop(); slow.resolve([delivery]); await stopped;
  expect(running.handled).toEqual([]);
});
it('shutdown during reconciliation opens no flagship streams', async () => {
  const running = await aWatcher();
  const watcher = running.make(); const scan = watcher.rescan(); await watcher.stop(); await scan;
  expect(running.signals).toEqual([]);
});
it('shutdown discards pending flagship wakes', async () => {
  const slow = Promise.withResolvers<ReceivedMessage[]>(); const running = await aWatcher(() => slow.promise);
  const watcher = running.make();
  await watcher.rescan(); running.wake(); await vi.advanceTimersByTimeAsync(0); running.wake(); await vi.advanceTimersByTimeAsync(0); const stopped = watcher.stop(); slow.resolve([]); await stopped;
  expect(running.received).toEqual([FLEET_ID]);
});

it('a replaced flagship lease cannot receive from an old wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan(); running.squadrons.set(FLEET_ID, [{ ...forming, flagship: { ...forming.flagship, crewToken: 'replacement' } }]);
    running.wake(); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([]);
  } finally { await watcher.stop(); }
});
it('a switched off flagship cannot receive from a late wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try { await watcher.rescan(); running.served.delete(FLEET_ID); running.wake(); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([]); } finally { await watcher.stop(); }
});
it('a disbanded flagship cannot receive from a late wake', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try { await watcher.rescan(); running.squadrons.set(FLEET_ID, [{ ...forming, state: 'disbanded' }]); running.wake(); await vi.advanceTimersByTimeAsync(0); expect(running.received).toEqual([]); } finally { await watcher.stop(); }
});
it('forgetting a fleet closes its flagship streams', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try { await watcher.rescan(); await running.management.drop(FLEET_ID); await watcher.rescan(); expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false]); } finally { await watcher.stop(); }
});

it('a wake resets the flagship safety timer', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    await vi.advanceTimersByTimeAsync(1_000);
    running.wake();
    await vi.advanceTimersByTimeAsync(0);
    for (let interval = 0; interval < 6; interval += 1) {
      for (const stream of running.streams.values()) { stream.enqueue(new TextEncoder().encode(': alive\n\n')); }
      await vi.advanceTimersByTimeAsync(50_000);
    }
    expect(running.received.filter((token) => token === FLEET_ID)).toHaveLength(2);
  } finally { await watcher.stop(); }
});

it('an older rescan finishing last leaves the new lease stream open', async () => {
  const olderSnapshot = Promise.withResolvers<Squadron[]>();
  const snapshotTaken = Promise.withResolvers<undefined>();
  let isOlderScan = false;
  const running = await aWatcher(undefined, { list: (fleetId, squadrons) => {
    if (fleetId === FLEET_ID && isOlderScan) {
      isOlderScan = false;
      snapshotTaken.resolve(undefined);
      return olderSnapshot.promise;
    }
    return Promise.resolve(squadrons);
  } });
  const watcher = running.make();
  try {
    await watcher.rescan();
    const oldSquadrons = running.squadrons.get(FLEET_ID) ?? [];
    isOlderScan = true;
    const older = watcher.rescan();
    await snapshotTaken.promise;
    running.squadrons.set(FLEET_ID, [{ ...forming, flagship: { ...forming.flagship, crewToken: 'replacement' } }]);
    await watcher.rescan();
    olderSnapshot.resolve(oldSquadrons);
    await older;
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false, false]);
    running.streams.get('replacement')?.enqueue(new TextEncoder().encode('event: wake\ndata: {}\n\n'));
    await vi.advanceTimersByTimeAsync(0);
    expect(running.received).toEqual(['replacement']);
  } finally { olderSnapshot.resolve([]); await watcher.stop(); }
});
