import type { FleetId } from '@aeolus-fleet/common';

import type { KeyOutage } from '../../src/core/squadron/member-health.js';
import type { KeyOutages } from '../../src/core/squadron/ports.js';

/** The stretches without the key, in memory, per fleet. */
export function memoryKeyOutages(): KeyOutages & { held: Map<FleetId, KeyOutage[]> } {
  const held = new Map<FleetId, KeyOutage[]>();
  return {
    held,
    list: (fleetId) => Promise.resolve([...(held.get(fleetId) ?? [])]),
    begin: (fleetId, at) => {
      const outages = held.get(fleetId) ?? [];
      if (!outages.some((outage) => outage.until === null)) {
        held.set(fleetId, [...outages, { since: at, until: null }]);
      }
      return Promise.resolve();
    },
    end: (fleetId, at) => {
      held.set(
        fleetId,
        (held.get(fleetId) ?? []).map((outage) => (outage.until === null ? { ...outage, until: at } : outage)),
      );
      return Promise.resolve();
    },
  };
}
