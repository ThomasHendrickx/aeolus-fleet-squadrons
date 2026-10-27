import type { FleetId } from '@aeolus-fleet/common';

import type { Clock } from '../shared/clock.js';
import type { BuiltTemplateStore } from './ports.js';

/** How long a built template is kept since it was last used (decision 9). */
export const BUILT_TEMPLATE_KEPT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DeleteUnusedBuiltTemplates = (fleetId: FleetId) => Promise<number>;

/**
 * Use case: at a fleet's rescan, squadrons deletes the built templates it
 * has not used for 30 days, and answers how many. A version still in the
 * catalogue is built again at its next use, to the same hash and the same
 * template, so deleting one changes nothing a squadron or the catalogue holds.
 */
export function createDeleteUnusedBuiltTemplates(deps: { built: BuiltTemplateStore; clock: Clock }): DeleteUnusedBuiltTemplates {
  return (fleetId) => deps.built.deleteUnusedSince(fleetId, new Date(deps.clock.now().getTime() - BUILT_TEMPLATE_KEPT_DAYS * MS_PER_DAY));
}
