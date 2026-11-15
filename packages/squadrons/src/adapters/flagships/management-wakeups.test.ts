/** Management leases use real stream readers with only fleet I/O and persistence replaced. */
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';

import { FLEET_ID, OTHER_FLEET_ID, SHIP_ID, fakeManagementFleet, memoryManagementStore } from '../../../test/support/management-fakes.js';
import type { FleetId } from '@aeolus-fleet/common';
import type { ReceivedMessage } from '../../core/management/ports.js';
import { ok } from '../../core/shared/result.js';
import { createShipWakeups } from '../fleet/ship-wakeups.js';
import { watchManagementShips } from './management-watch.js';

const log = Fastify({ logger: false }).log;
const delivery: ReceivedMessage = { deliveryId: 'dlv_01m3tbfspe96yf1rnr4ank0001', messageId: 'msg_01m3tbfspe96yf1rnr4ank0001', senderShipId: SHIP_ID, senderName: 'lead', contentType: 'text/plain', payload: 'stored while down', inReplyTo: null };

async function aWatcher(receive?: (token: string) => Promise<ReceivedMessage[]>) {
  vi.useFakeTimers();
  const management = memoryManagementStore();
  for (const fleetId of [FLEET_ID, OTHER_FLEET_ID]) {
    await management.save({ fleetId, shipId: SHIP_ID, name: 'squadrons', crewToken: fleetId, crewedAt: new Date(0) });
  }
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const signals: AbortSignal[] = [];
  const received: string[] = [];
  const handled: ReceivedMessage[] = [];
  const served = new Set<FleetId>([FLEET_ID, OTHER_FLEET_ID]);
  const make = () => watchManagementShips({
    management, isServed: (fleetId) => Promise.resolve(served.has(fleetId)), log, rescanMs: 10_000,
    door: { ...fakeManagementFleet().door, receive: async (token) => { received.push(token); if (received.length > 10) { throw new Error("unexpected continuous receiving"); } return ok(await receive?.(token) ?? []); } },
    handle: (_crew, message) => { handled.push(message); return Promise.resolve(ok('formed')); },
    start: (token, events) => createShipWakeups({
      fleetUrl: 'https://fleet.example', ...events, failed: (error) => { throw error; }, random: () => 0,
      fetch: (_url, init) => {
        if (init?.signal) { signals.push(init.signal); }
        return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.set(token, controller); } })));
      },
    })(token),
  });
  const wake = (token = FLEET_ID) => streams.get(token)?.enqueue(new TextEncoder().encode('event: wake\ndata: {"reason":"open"}\n\n'));
  return { make, management, received, handled, served, streams, signals, wake };
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

it('one slow fleet does not block another fleet', async () => {
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

it('a stream lease end drops only its own fleet connection', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    running.streams.get(FLEET_ID)?.enqueue(new TextEncoder().encode('event: end\ndata: {"code":"LEASE_ENDED","message":"ended"}\n\n'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await running.management.connected()).map((crew) => crew.fleetId)).toEqual([OTHER_FLEET_ID]);
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

it('a replaced crew token aborts its old stream and opens the new lease', async () => {
  const running = await aWatcher();
  const watcher = running.make();
  try {
    await watcher.rescan();
    const crew = await running.management.find(FLEET_ID);
    if (!crew) { throw new Error('missing test crew'); }
    await running.management.save({ ...crew, crewToken: 'replacement' });
    await watcher.rescan();
    expect(running.signals.map((signal) => signal.aborted)).toEqual([true, false, false]);
  } finally { await watcher.stop(); }
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
