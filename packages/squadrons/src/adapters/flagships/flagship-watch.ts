/** Each flagship lease receives on shared wake streams while fleet rescans keep formations and reach. */
import type { FleetId } from '@aeolus-fleet/common';
import type { FastifyBaseLogger } from 'fastify';

import type { FleetDoor, ManagementCrewStore } from '../../core/management/ports.js';
import type { IsServed } from '../../core/installation/served.js';
import type { AdvanceStandDowns } from '../../core/squadron/advance-stand-downs.js';
import type { HandleFlagshipDelivery } from '../../core/squadron/handle-flagship-delivery.js';
import type { Clock } from '../../core/shared/clock.js';
import type { KeyOutages, OperatorNotices, SquadronRepository } from '../../core/squadron/ports.js';
import type { Squadron } from '../../core/squadron/squadron.js';
import type { FleetTurns } from './fleet-turns.js';

import { reconcileLeaseStreams } from './reconcile-lease-streams.js';

const RECEIVE_PAGE_SIZE = 10;

/** How long a flagship waits before it receives again after a failure. */
const RETRY_MS = 1_000;

/** How long a flagship waits for the fleet's key before it receives again: the key is the company's to give back, so there is no hurry (decision 0068). */
const KEY_WAIT_MS = 30_000;

/** The fleet's refusal when it cannot unseal or seal a payload: nothing was claimed or stored, so the delivery waits pending. */
const KEY_UNAVAILABLE = 'KEY_UNAVAILABLE';

/** Whether a squadron's flagship receives: until its squadron is disbanded. */
function isReceiving(squadron: Squadron | undefined): squadron is Squadron {
  return squadron !== undefined && squadron.state !== 'disbanded';
}

/** What a rescan does for a fleet's reach: keep its labels and declared rules while squadrons serves it, withdraw the rules while it is off. Each logs its own refusals. */
export interface FleetReach {
  keep(fleetId: FleetId): Promise<void>;
  withdraw(fleetId: FleetId): Promise<void>;
}

export interface FlagshipWatch {
  /** Starts the receive of every squadron not disbanded and not watched yet, and advances every stand-down. */
  rescan(): Promise<void>;
  /** Stops receiving, and resolves once every receive, delivery and rescan in flight is done: the database may close then. */
  stop(): Promise<void>;
}

export function watchFlagships(deps: {
  door: FleetDoor;
  management: ManagementCrewStore;
  squadrons: SquadronRepository;
  handle: HandleFlagshipDelivery;
  advanceStandDowns: AdvanceStandDowns;
  /** Retires what the fleet's given-up formations commissioned; logs its own refusals. */
  recoverFormations: (fleetId: FleetId) => Promise<void>;
  /** Deletes the fleet's built templates unused for the kept time; answers how many. */
  deleteUnusedBuiltTemplates: (fleetId: FleetId) => Promise<number>;
  isServed: IsServed;
  operator: OperatorNotices;
  reach: FleetReach;
  turns: FleetTurns;
  log: FastifyBaseLogger;
  /** The stretches without the fleet's key, which stop every member's check-in clock. */
  outages: KeyOutages;
  clock: Clock;
  /** How long a flagship waits for the key before it receives again; 30 seconds when left out. */
  keyWaitMs?: number;
  rescanMs: number;
  start: (crewToken: string, events: { look: () => Promise<void>; ended: () => Promise<void> }) => () => void;
}): FlagshipWatch {
  const stopping = new AbortController();
  // Squadrons by `<fleet> <id>`.
  const watched = new Map<string, { crewToken: string; stop: () => void }>();
  // Squadrons whose flagship's lease ended: a rescan does not receive on them again.
  const endedLeases = new Set<string>();
  const keyOf = (fleetId: FleetId, squadronId: string): string => `${fleetId} ${squadronId}`;
  // What runs in the background, so stop can wait for it.
  const running = new Set<Promise<void>>();
  const track = (work: Promise<void>): Promise<void> => {
    running.add(work);
    void work.then(() => running.delete(work), () => running.delete(work));
    return work;
  };
  const start = ({ fleetId, squadronId, crewToken }: { fleetId: FleetId; squadronId: string; crewToken: string }) => {
    const cancellation = new AbortController();
    const isStopping = () => cancellation.signal.aborted;
    const pause = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); cancellation.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, ms);
      cancellation.signal.addEventListener('abort', done, { once: true });
      if (isStopping()) { done(); }
    });
    const waitForKey = async (reason: string) => {
      await deps.outages.begin(fleetId, deps.clock.now());
      deps.log.warn({ squadron: squadronId, reason }, "the fleet's key is out of reach: the flagship waits, its deliveries stay pending");
      await pause(deps.keyWaitMs ?? KEY_WAIT_MS);
    };
    const ended = async () => {
      if (isStopping()) { return; }
      watched.get(keyOf(fleetId, squadronId))?.stop();
      const current = (await deps.squadrons.list(fleetId)).find((each) => each.id === squadronId);
      if (!isReceiving(current) || current.flagship.crewToken !== crewToken) { return; }
      endedLeases.add(crewToken);
      deps.log.warn({ squadron: squadronId }, 'the flagship was released: squadrons no longer receives on it');
      await deps.operator.tell({ fleetId, headline: "A squadron's flagship was released",
        body: `- Squadron: \`${squadronId}\`\n\nsquadrons no longer receives on it, so check-ins to it go unanswered.`, key: `released-${squadronId}` });
    };
    const look = async (): Promise<void> => {
      while (!isStopping()) {
        const squadron = (await deps.squadrons.list(fleetId)).find((each) => each.id === squadronId);
        if (!isReceiving(squadron) || squadron.flagship.crewToken !== crewToken || !(await deps.isServed(fleetId)) || isStopping()) { return; }
        try {
          const received = await deps.door.receive(crewToken, { signal: cancellation.signal });
          if (isStopping()) { return; }
          if (!received.isOk) {
            if (received.error.code === 'LEASE_ENDED') { await ended(); return; }
            if (received.error.code === KEY_UNAVAILABLE) { await waitForKey(received.error.message); continue; }
            deps.log.error({ squadron: squadronId, refusal: received.error }, 'the flagship could not receive');
            await pause(RETRY_MS);
            continue;
          }
          await deps.outages.end(fleetId, deps.clock.now());
          let isKeyUnavailable = false;
          for (const delivery of received.value) {
            const current = (await deps.squadrons.list(fleetId)).find((each) => each.id === squadronId) ?? squadron;
            const handled = await deps.handle(current, delivery);
            if (!handled.isOk && handled.error.code === KEY_UNAVAILABLE) {
              await waitForKey(handled.error.message);
              isKeyUnavailable = true;
              break;
            }
            if (!handled.isOk) { deps.log.error({ squadron: squadronId, refusal: handled.error }, 'the flagship could not handle a delivery'); }
          }
          if (!isKeyUnavailable && received.value.length < RECEIVE_PAGE_SIZE) { return; }
        } catch (error) {
          if (isStopping()) { return; }
          deps.log.error({ err: error, squadron: squadronId }, 'the flagship failed to receive');
          await pause(RETRY_MS);
        }
      }
    };
    const stopStream = deps.start(crewToken, { look: () => track(look()), ended: () => track(ended()) });
    return { crewToken, stop: () => { cancellation.abort(); stopStream(); } };
  };

  const rescanFleet = async (fleetId: FleetId): Promise<void> => {
    try {
      await deps.advanceStandDowns(fleetId);
    } catch (error) {
      deps.log.error({ err: error, fleet: fleetId }, 'the stand-downs could not advance');
    }
    try {
      await deps.recoverFormations(fleetId);
    } catch (error) {
      deps.log.error({ err: error, fleet: fleetId }, 'the formations a forming gave up could not be recovered');
    }
    try {
      await deps.deleteUnusedBuiltTemplates(fleetId);
    } catch (error) {
      deps.log.error({ err: error, fleet: fleetId }, 'the built templates unused for the kept time could not be deleted');
    }
    try {
      await deps.reach.keep(fleetId);
    } catch (error) {
      deps.log.error({ err: error, fleet: fleetId }, 'the squadron labels and network rules could not be kept');
    }
  };

  const restFleet = async (fleetId: FleetId): Promise<void> => {
    try {
      await deps.reach.withdraw(fleetId);
    } catch (error) {
      deps.log.error({ err: error, fleet: fleetId }, 'the network rules could not be withdrawn');
    }
  };

  // Each fleet's rescan waiting for its turn: one asked meanwhile shares it.
  const waiting = new Map<FleetId, Promise<void>>();
  const passFleet = (fleetId: FleetId): Promise<void> => {
    const waited = waiting.get(fleetId);
    if (waited !== undefined) {
      return waited;
    }
    const pass = deps.turns.take(fleetId, async () => {
      waiting.delete(fleetId);
      if (await deps.isServed(fleetId)) {
        await rescanFleet(fleetId);
      } else {
        await restFleet(fleetId);
      }
    });
    waiting.set(fleetId, pass);
    return pass;
  };

  const hasStopped = () => stopping.signal.aborted;
  const rescan = async (): Promise<void> => {
    const connected = await deps.management.connected();
    const leases = (await Promise.all(connected.map(async ({ fleetId }) => {
      if (!(await deps.isServed(fleetId))) { return []; }
      return (await deps.squadrons.list(fleetId)).filter((squadron) => isReceiving(squadron) && !endedLeases.has(squadron.flagship.crewToken)).map((squadron) => ({ key: keyOf(fleetId, squadron.id), crewToken: squadron.flagship.crewToken, fleetId, squadronId: squadron.id }));
    }))).flat();
    if (hasStopped()) { return; }
    reconcileLeaseStreams({ watched, leases, start: (key, crewToken) => {
      const lease = leases.find((each) => each.key === key);
      if (!lease) { throw new Error('missing flagship lease'); }
      return start({ fleetId: lease.fleetId, squadronId: lease.squadronId, crewToken });
    } });
    for (const crew of connected) {
      if (hasStopped()) { return; }
      await passFleet(crew.fleetId);
    }
  };

  const timer = setInterval(() => void track(rescan()), deps.rescanMs);
  return {
    rescan: () => track(rescan()),
    stop: async () => {
      clearInterval(timer);
      stopping.abort();
      for (const stream of watched.values()) { stream.stop(); }
      watched.clear();
      while (running.size > 0) {
        await Promise.allSettled([...running]);
      }
    },
  };
}
