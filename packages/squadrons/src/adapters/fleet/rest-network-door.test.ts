import { describe, expect, it } from 'vitest';

import { aFleetAnswering } from '../../../test/support/fake-fleet.js';
import { aListedShip } from '../../../test/support/listed-ships.js';
import { createRestNetworkDoor } from './rest-network-door.js';

describe('the network door over REST within read reach (decision 0034)', () => {
  it('lists the labels of the ships it reads whole, leaving out those outside its read reach', async () => {
    const whole = aListedShip({
      id: 'shp_01m3tbfspe96yf1rnr4ank9h2a',
      name: 'scout',
      labels: [{ labelId: 'lbl_01m3tbfspe96yf1rnr4ank9h2c', key: 'team', valueId: 'lbv_01m3tbfspe96yf1rnr4ank9h2d', value: 'a' }],
    });
    const outside = { id: 'shp_01m3tbfspe96yf1rnr4ank9h2b', name: 'vault', type: 'keeper', status: 'crewed', isInReadReach: false };
    await aFleetAnswering([{ status: 200, body: { items: [whole, outside], nextCursor: null } }], async (fleetUrl) => {
      const listed = await createRestNetworkDoor(fleetUrl).listLabelledShips('aeolus_ct_v1_x');

      expect(listed).toEqual({ isOk: true, value: [{ shipId: whole.id, labels: [{ labelId: 'lbl_01m3tbfspe96yf1rnr4ank9h2c', valueId: 'lbv_01m3tbfspe96yf1rnr4ank9h2d' }] }] });
    });
  });
});

describe('the network door reads every page of fleet.list (aeolus-fleet#1143)', () => {
  const first = aListedShip({ id: 'shp_01m3tbfspe96yf1rnr4ank9h3a', name: 'scout', labels: [{ labelId: 'lbl_01m3tbfspe96yf1rnr4ank9h3c', key: 'team', valueId: 'lbv_01m3tbfspe96yf1rnr4ank9h3d', value: 'a' }] });
  const second = aListedShip({ id: 'shp_01m3tbfspe96yf1rnr4ank9h3b', name: 'keeper' });
  const firstPage = { status: 200, body: { items: [first], nextCursor: 'after-scout' } };
  const pages = [firstPage, { status: 200, body: { items: [second], nextCursor: null } }];

  it('lists the labelled ships of every page, reading on until the fleet answers no next cursor', async () => {
    await aFleetAnswering(pages, async (fleetUrl) => {
      const listed = await createRestNetworkDoor(fleetUrl).listLabelledShips('aeolus_ct_v1_x');

      expect(listed).toEqual({
        isOk: true,
        value: [
          { shipId: first.id, labels: [{ labelId: 'lbl_01m3tbfspe96yf1rnr4ank9h3c', valueId: 'lbv_01m3tbfspe96yf1rnr4ank9h3d' }] },
          { shipId: second.id, labels: [] },
        ],
      });
    });
  });

  it('asks each next page after the cursor the last page answered, at the most ships a page may hold', async () => {
    await aFleetAnswering(pages, async (fleetUrl, asked) => {
      await createRestNetworkDoor(fleetUrl).listLabelledShips('aeolus_ct_v1_x');

      expect(asked.map(({ body }): unknown => JSON.parse(body))).toEqual([{ limit: 500 }, { limit: 500, cursor: 'after-scout' }]);
    });
  });

  it("answers the fleet's refusal of a later page, not the ships of the pages before it", async () => {
    const refused = { status: 403, body: { code: 'FORBIDDEN', message: 'fleet:read is not granted' } };
    await aFleetAnswering([firstPage, refused], async (fleetUrl) => {
      const listed = await createRestNetworkDoor(fleetUrl).listLabelledShips('aeolus_ct_v1_x');

      expect(listed).toEqual({ isOk: false, error: { code: 'FORBIDDEN', message: 'fleet:read is not granted' } });
    });
  });
});
