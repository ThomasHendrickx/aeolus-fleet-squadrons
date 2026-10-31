import type { KeyOutages } from '../../core/squadron/ports.js';
import type { Db } from './client.js';

/** Each fleet's stretches without its key, at most one going on (until null). */
export function createPrismaKeyOutages(db: Db): KeyOutages {
  return {
    list: async (fleetId) => (await db.keyOutage.findMany({ where: { fleetId }, orderBy: { since: 'asc' } })).map(({ since, until }) => ({ since, until })),
    // The unique index lets one going on only: a second begin, even a racing one, changes nothing.
    begin: async (fleetId, at) => {
      await db.$executeRaw`INSERT INTO key_outages (fleet_id, since) VALUES (${fleetId}, ${at}) ON CONFLICT DO NOTHING`;
    },
    end: async (fleetId, at) => {
      await db.keyOutage.updateMany({ where: { fleetId, until: null }, data: { until: at } });
    },
  };
}
