import { expect, it } from 'vitest';

import { FLEET_ID, SHIP_ID, fakeManagementFleet, memoryManagementStore } from '../../../test/support/management-fakes.js';
import { memoryInstallationRequests, plainHasher } from '../../../test/support/memory-installation.js';
import { createConnect } from '../management/connect.js';
import { createConnectFleet } from './connect-fleet.js';

it('records only successful hand-overs and replays their receipt without checking connection health', async () => {
  const fleet = fakeManagementFleet();
  const store = memoryManagementStore();
  const requests = memoryInstallationRequests();
  const clock = { now: () => new Date('2026-11-18T12:00:00Z') };
  const deps = { requests, hasher: plainHasher, clock, isServed: () => Promise.resolve(true), connect: createConnect({ door: fleet.door, store, clock }) };
  const input = { requestId: 'connect', fleetId: FLEET_ID, shipId: SHIP_ID, secret: 'refused' };
  expect(await createConnectFleet(deps)(input)).toMatchObject({ isOk: false, error: { kind: 'SECRET_REFUSED' } });
  expect(requests.held).toEqual([]);
  expect(await createConnectFleet(deps)({ ...input, secret: 'aeolus_sk_v1_good' })).toEqual({ isOk: true, value: { isEnabled: true, isConnected: true } });
  await store.drop(FLEET_ID);
  expect(await createConnectFleet(deps)(input)).toEqual({ isOk: true, value: { isEnabled: true, isConnected: true } });
  expect(requests.held).toHaveLength(1);
  expect(JSON.stringify(requests.held)).not.toContain('aeolus_sk');
});
