import type { LabelValueId } from '@aeolus-fleet/common';
import { describe, expect, it } from 'vitest';

import { FLEET_ID, SHIP_ID, memoryManagementStore } from '../../../test/support/management-fakes.js';
import { fakeNetworkFleet, OTHER_OWNER } from '../../../test/support/network-fakes.js';
import { ok } from '../shared/result.js';
import { createPrepareFormation } from './prepare-formation.js';

const VALUE: LabelValueId = 'lbv_01m3tbfspe96yf1rnr4ank9f02';

async function aPreparation(owner = SHIP_ID) {
  const management = memoryManagementStore();
  await management.save({ fleetId: FLEET_ID, shipId: SHIP_ID, name: 'squadrons', crewToken: 'test-crew', crewedAt: new Date('2026-11-21T00:00:00Z') });
  const fleet = fakeNetworkFleet(new Set(['test-crew']));
  fleet.state.labels.push({ labelId: 'lbl_01m3tbfspe96yf1rnr4ank9f00', key: 'squadrons-formed', ownerShipId: owner, values: [{ valueId: VALUE, value: 'formed' }] });
  const steps: string[] = [];
  const prepare = createPrepareFormation({ management, door: fleet.door,
    label: () => { steps.push('label'); return Promise.resolve(ok({ defined: 0, valuesChanged: 0, assigned: 0, unassigned: 0, unlabelled: [] })); },
    declare: () => { steps.push('declare'); return Promise.resolve(ok({ isDeclared: true })); },
  });
  return { prepare, steps, fleet };
}

describe('preparing manage reach before commissioning', () => {
  it('labels and declares before returning the owned formed value for commission', async () => {
    const { prepare, steps } = await aPreparation();
    await expect(prepare(FLEET_ID)).resolves.toEqual(ok(VALUE));
    expect(steps).toEqual(['label', 'declare']);
  });

  it('refuses a formed label another ship owns', async () => {
    const { prepare } = await aPreparation(OTHER_OWNER);
    await expect(prepare(FLEET_ID)).resolves.toMatchObject({ isOk: false, error: { code: 'FORMED_LABEL_UNAVAILABLE' } });
  });

  it('refuses unavailable label reads', async () => {
    const { prepare, fleet } = await aPreparation();
    fleet.state.isAnswering = false;
    await expect(prepare(FLEET_ID)).resolves.toMatchObject({ isOk: false, error: { code: 'UNAVAILABLE' } });
  });
});
