import type { ListedShip } from '@aeolus-fleet/common';

/** A ship as fleet.list answers it to a caller that reads it whole: crewed, unlabelled, unless `ship` says otherwise. */
export function aListedShip(ship: Partial<ListedShip> & Pick<ListedShip, 'id' | 'name'>): ListedShip {
  return {
    type: 'reviewer',
    kind: 'agent',
    status: 'crewed',
    startingPrompt: null,
    location: null,
    lastSeenAt: null,
    ping: null,
    scopes: ['messages:send', 'messages:receive'],
    report: null,
    crewRequest: null,
    labels: [],
    model: null,
    harness: null,
    awaitingCrewSince: null,
    retiredAt: null,
    ownerShipId: null,
    ...ship,
  };
}
