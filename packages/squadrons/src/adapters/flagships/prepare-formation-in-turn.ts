/** Formation declarations share the rescan/withdrawal turn and recheck the fleet switch. */
import type { IsServed } from '../../core/installation/served.js';
import type { PrepareFormation } from '../../core/network/prepare-formation.js';
import { err } from '../../core/shared/result.js';
import type { FleetTurns } from './fleet-turns.js';

export function createPrepareFormationInTurn(deps: { turns: FleetTurns; isServed: IsServed; prepare: PrepareFormation }): PrepareFormation {
  return (fleetId) => deps.turns.take(fleetId, async () => {
    if (!(await deps.isServed(fleetId))) {
      return err({ code: 'NOT_SERVED', message: 'squadrons is switched off for this fleet' });
    }
    return deps.prepare(fleetId);
  });
}
