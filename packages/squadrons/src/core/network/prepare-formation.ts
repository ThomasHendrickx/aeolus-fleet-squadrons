/** Prepare declared manage reach before the first commission assigns the formed value. */
import type { FleetId, LabelValueId } from '@aeolus-fleet/common';

import type { FleetRefusal, ManagementCrewStore } from '../management/ports.js';
import { err, ok, type Result } from '../shared/result.js';
import type { DeclareNetworkRules } from './declare-network-rules.js';
import { FORMED_LABEL, type LabelSquadrons } from './label-squadrons.js';
import type { NetworkDoor } from './ports.js';

export type PrepareFormation = (fleetId: FleetId) => Promise<Result<LabelValueId, FleetRefusal>>;

export function createPrepareFormation(deps: {
  management: Pick<ManagementCrewStore, 'find'>;
  door: Pick<NetworkDoor, 'listLabels'>;
  label: LabelSquadrons;
  declare: DeclareNetworkRules;
}): PrepareFormation {
  return async (fleetId) => {
    const crew = await deps.management.find(fleetId);
    if (!crew) {
      return err({ code: 'NOT_CONNECTED', message: 'squadrons is not connected to this fleet' });
    }
    const labelled = await deps.label(fleetId);
    if (!labelled.isOk) {
      return err({ code: labelled.error.kind, message: labelled.error.message });
    }
    const declared = await deps.declare(fleetId);
    if (!declared.isOk) {
      return err({ code: declared.error.kind, message: declared.error.message });
    }
    const labels = await deps.door.listLabels(crew.crewToken);
    if (!labels.isOk) {
      return labels;
    }
    const formed = labels.value.find((label) => label.key === FORMED_LABEL.key && label.ownerShipId === crew.shipId)?.values.find((value) => value.value === FORMED_LABEL.formed);
    return formed === undefined
      ? err({ code: 'FORMED_LABEL_UNAVAILABLE', message: 'squadrons needs its own squadrons-formed label before commissioning' })
      : ok(formed.valueId);
  };
}
