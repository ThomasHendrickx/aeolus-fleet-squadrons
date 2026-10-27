import { z } from 'zod';

import type { BuiltTemplateStore } from '../../core/catalogue/ports.js';
import type { Db } from './client.js';
import { templateSchema } from './template-json.js';

/** A built template as JSON: its times as ISO strings, which reading parses back. */
function jsonOf(value: unknown): z.infer<ReturnType<typeof z.json>> {
  return z.json().parse(JSON.parse(JSON.stringify(value)));
}

export function createPrismaBuiltTemplateStore(db: Db): BuiltTemplateStore {
  return {
    find: async (fleetId, hashes) => {
      const rows = await db.builtTemplate.findMany({ where: { fleetId, hash: { in: [...hashes] } }, select: { template: true } });
      return rows.map((row) => templateSchema.parse(row.template));
    },
    use: async (fleetId, { templates, at }) => {
      const hashed = templates.flatMap((template) => (template.hash === null ? [] : [{ hash: template.hash, template }]));
      // A hash kept already, or kept by another use at once, stays as it is: the same chain builds the same template.
      await db.builtTemplate.createMany({
        data: hashed.map(({ hash, template }) => ({ fleetId, hash, chain: jsonOf(template.chain) ?? [], template: jsonOf(template) ?? {}, builtAt: at, lastUsedAt: at })),
        skipDuplicates: true,
      });
      await db.builtTemplate.updateMany({ where: { fleetId, hash: { in: hashed.map(({ hash }) => hash) } }, data: { lastUsedAt: at } });
    },
    deleteUnusedSince: async (fleetId, before) => (await db.builtTemplate.deleteMany({ where: { fleetId, lastUsedAt: { lt: before } } })).count,
  };
}
