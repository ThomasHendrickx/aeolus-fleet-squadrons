/** Each served fleet's management lease has a wake stream and serialized receive turns. */
import type { FleetId } from '@aeolus-fleet/common';
import type { FastifyBaseLogger } from 'fastify';

import type { IsServed } from '../../core/installation/served.js';
import type { FleetDoor, ManagementCrewStore } from '../../core/management/ports.js';
import type { HandleManagementDelivery } from '../../core/squadron/handle-management-delivery.js';

import { reconcileLeaseStreams } from './reconcile-lease-streams.js';

const RETRY_MS = 1_000;
const RECEIVE_PAGE_SIZE = 10;

export interface ManagementWatch {
  /** Reconciles streams with the connected fleets squadrons serves. */
  rescan(): Promise<void>;
  /** Aborts streams and receives, then waits for delivery handling before the database closes. */
  stop(): Promise<void>;
}

export function watchManagementShips(deps: {
  door: FleetDoor;
  management: ManagementCrewStore;
  handle: HandleManagementDelivery;
  isServed: IsServed;
  log: FastifyBaseLogger;
  rescanMs: number;
  start: (crewToken: string, events: { look: () => Promise<void>; ended: () => Promise<void> }) => () => void;
}): ManagementWatch {
  let isStopped = false;
  const hasStopped = () => isStopped;
  const watched = new Map<FleetId, { crewToken: string; stop: () => void }>();
  const running = new Set<Promise<void>>();
  const track = (work: Promise<void>): Promise<void> => {
    running.add(work);
    void work.then(() => running.delete(work), () => running.delete(work));
    return work;
  };
  const start = (fleetId: FleetId, crewToken: string) => {
    const stopping = new AbortController();
    const isStopping = () => stopping.signal.aborted;
    const pause = () => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); stopping.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, RETRY_MS);
      stopping.signal.addEventListener('abort', done, { once: true });
      if (isStopping()) { done(); }
    });
    const ended = async () => {
      watched.get(fleetId)?.stop();
      if ((await deps.management.find(fleetId))?.crewToken === crewToken) {
        await deps.management.drop(fleetId);
      }
    };
    const look = async (): Promise<void> => {
      while (!isStopping()) {
        const crew = await deps.management.find(fleetId);
        if (crew?.crewToken !== crewToken || !(await deps.isServed(fleetId))) { return; }
        if (isStopping()) { return; }
        try {
          const received = await deps.door.receive(crewToken, { signal: stopping.signal });
          if (!received.isOk) {
            if (received.error.code === 'LEASE_ENDED') { await ended(); return; }
            deps.log.error({ fleet: fleetId, refusal: received.error }, "squadrons' ship could not receive");
            await pause();
            continue;
          }
          for (const delivery of received.value) {
            const handled = await deps.handle(crew, delivery);
            if (!handled.isOk) {
              deps.log.error({ fleet: fleetId, refusal: handled.error }, "squadrons' ship could not handle a delivery");
            }
          }
          if (received.value.length < RECEIVE_PAGE_SIZE) { return; }
        } catch (error) {
          if (isStopping()) { return; }
          deps.log.error({ err: error, fleet: fleetId }, "squadrons' ship failed to receive");
          await pause();
        }
      }
    };
    const stopStream = deps.start(crewToken, { look: () => track(look()), ended: () => track(ended()) });
    return { crewToken, stop: () => { stopping.abort(); stopStream(); } };
  };

  const reconcile = async (): Promise<void> => {
    const connected = await deps.management.connected();
    if (hasStopped()) { return; }
    const served = await Promise.all(connected.map(async (crew) => ({ crew, isServed: await deps.isServed(crew.fleetId) })));
    if (hasStopped()) { return; }
    reconcileLeaseStreams({ watched, leases: served.filter((each) => each.isServed).map(({ crew }) => ({ key: crew.fleetId, crewToken: crew.crewToken })), start });
  };
  let scanning: Promise<void> | undefined;
  const rescan = (): Promise<void> => {
    scanning ??= track(reconcile().catch((error: unknown) => {
      deps.log.error({ err: error }, 'management streams could not be reconciled');
    }).finally(() => { scanning = undefined; }));
    return scanning;
  };
  const timer = setInterval(() => { void rescan(); }, deps.rescanMs);
  return {
    rescan,
    stop: async () => {
      isStopped = true;
      clearInterval(timer);
      for (const stream of watched.values()) { stream.stop(); }
      watched.clear();
      while (running.size > 0) { await Promise.allSettled([...running]); }
    },
  };
}
