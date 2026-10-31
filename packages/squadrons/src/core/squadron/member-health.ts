import type { FleetShip } from '../management/ports.js';
import type { Member } from './squadron.js';

/**
 * How a member stands (#86, B4): not on station yet, on time, late or silent
 * by its last report, or standing down while its crew is released (#343).
 */
export type MemberHealth = 'not-on-station' | 'on-time' | 'late' | 'silent' | 'standing-down';

/** A stretch in which the fleet's company key could not be had, and its payloads could not be read: `until` is null while it goes on. */
export interface KeyOutage {
  since: Date;
  until: Date | null;
}

const MINUTE_MS = 60_000;
/** A member is silent after this many check-in intervals without a report (docs/squadrons.md, "Check-in"). */
const SILENT_AFTER_INTERVALS = 3;

/**
 * A member's health, from its ship as the fleet shows it. It is on station
 * only while its ship is crewed and it came on station with that crew: a
 * released or newly crewed member is not on station until it checks in again.
 * A member whose crew request squadrons removed stands down until its ship
 * is retired. Its clock runs from its last report, or from coming on station when it has
 * reported nothing since: late after one check-in interval, silent after three.
 * Time in which the fleet's key could not be had does not count (decision 0068):
 * the flagship could not read a check-in then, nor the member send one.
 * Observation only: nothing acts on it.
 */
export function memberHealth(
  member: Member,
  reading: { ship: Pick<FleetShip, 'status' | 'crewedSince' | 'reportedAt'>; checkInMinutes: number; now: Date; outages?: KeyOutage[] },
): MemberHealth {
  const { ship, checkInMinutes, now } = reading;
  const { onStationAt } = member;
  if (member.releasingSince !== null && ship.status !== 'retired') {
    return 'standing-down';
  }
  if (ship.status !== 'crewed' || onStationAt === null || ship.crewedSince === null || onStationAt < ship.crewedSince) {
    return 'not-on-station';
  }
  const since = ship.reportedAt !== null && ship.reportedAt > onStationAt ? ship.reportedAt : onStationAt;
  const elapsed = now.getTime() - since.getTime() - outageMs(reading.outages ?? [], { from: since, to: now });
  const interval = checkInMinutes * MINUTE_MS;
  if (elapsed > SILENT_AFTER_INTERVALS * interval) {
    return 'silent';
  }
  return elapsed > interval ? 'late' : 'on-time';
}

/** How much of the stretch the outages cover, each moment once. */
function outageMs(outages: KeyOutage[], stretch: { from: Date; to: Date }): number {
  let covered = 0;
  let reached = stretch.from.getTime();
  const clipped = outages
    .map((outage) => ({ from: Math.max(outage.since.getTime(), stretch.from.getTime()), to: Math.min((outage.until ?? stretch.to).getTime(), stretch.to.getTime()) }))
    .filter((outage) => outage.to > outage.from)
    .sort((a, b) => a.from - b.from);
  for (const outage of clipped) {
    const from = Math.max(outage.from, reached);
    if (outage.to > from) {
      covered += outage.to - from;
      reached = outage.to;
    }
  }
  return covered;
}
