import type { FleetId } from '@aeolus-fleet/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaBuiltTemplateStore } from '../src/adapters/prisma/built-template-store.js';
import { createPrismaClient, type PrismaClient } from '../src/adapters/prisma/client.js';
import type { TemplateVersion } from '../src/core/catalogue/catalogue.js';
import { createSquadronsDatabase } from '../src/testing/database.js';

// Built templates in Postgres (docs/squadrons.md, "Built once"): kept per
// fleet and hash, one per hash however many keep it at once, each with when
// it was built and last used, and deleted once unused since a time.

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const OTHER_FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8zz';
const BUILT = new Date('2026-10-27T09:00:00.000Z');
const LATER = new Date('2026-11-10T09:00:00.000Z');
const SKILLS = 'github.com/ThomasHendrickx/skills';

let prisma: PrismaClient;

function aBuiltTemplate(hash: string): TemplateVersion {
  return {
    repository: 'github.com/tidewater-labs/squadron-templates',
    name: 'typescript-implementer',
    version: 1,
    file: 'squadrons/templates/typescript-implementer.yaml',
    commit: 'e77a020',
    committedAt: new Date('2026-10-26T12:00:00.000Z'),
    description: 'Implements a slice in a TypeScript repository',
    checkInMinutes: 30,
    model: 'claude-opus-5-5',
    launchNote: null,
    charter: 'Report to the flagship.\n\nRun npm run typecheck before every commit.',
    handoffs: [{ name: 'report', carries: 'What was done' }],
    crew: { harness: 'claude-code', options: { effort: 'high' } },
    parameters: [],
    scopes: ['notes:read'],
    hash,
    chain: [
      { repository: SKILLS, name: 'implementer', version: 2, commit: '9b0c1de' },
      { repository: 'github.com/tidewater-labs/squadron-templates', name: 'typescript-implementer', version: 1, commit: 'e77a020' },
    ],
    origins: {
      charter: [
        { layer: 0, text: 'Report to the flagship.' },
        { layer: 1, text: 'Run npm run typecheck before every commit.' },
      ],
      fields: { description: 1, checkIn: 0 },
      filled: [{ name: 'language', layer: 1 }],
    },
  };
}

/** When each built template of the fleet was built and last used, by hash. */
async function timesOf(fleetId: FleetId): Promise<Record<string, { builtAt: Date; lastUsedAt: Date }>> {
  const rows = await prisma.builtTemplate.findMany({ where: { fleetId }, select: { hash: true, builtAt: true, lastUsedAt: true } });
  return Object.fromEntries(rows.map(({ hash, builtAt, lastUsedAt }) => [hash, { builtAt, lastUsedAt }]));
}

beforeEach(async () => {
  prisma = createPrismaClient(await createSquadronsDatabase());
});

afterEach(async () => {
  await prisma.$disconnect();
});

describe('the built template store', () => {
  it('keeps a built template by fleet and hash, whole, with its chain, built and last used when first used', async () => {
    const store = createPrismaBuiltTemplateStore(prisma);
    await store.use(FLEET, [aBuiltTemplate('h1')], BUILT);

    await expect(store.find(FLEET, ['h1', 'h2'])).resolves.toEqual([aBuiltTemplate('h1')]);
    await expect(timesOf(FLEET)).resolves.toEqual({ h1: { builtAt: BUILT, lastUsedAt: BUILT } });
  });

  it('sets its last use at each use, and keeps when it was built and what it holds', async () => {
    const store = createPrismaBuiltTemplateStore(prisma);
    await store.use(FLEET, [aBuiltTemplate('h1')], BUILT);

    await store.use(FLEET, [{ ...aBuiltTemplate('h1'), description: 'Built again to the same hash.' }], LATER);

    await expect(timesOf(FLEET)).resolves.toEqual({ h1: { builtAt: BUILT, lastUsedAt: LATER } });
    await expect(store.find(FLEET, ['h1'])).resolves.toEqual([aBuiltTemplate('h1')]);
  });

  it('keeps one built template per hash when two reads keep it at once, and both use it', async () => {
    const store = createPrismaBuiltTemplateStore(prisma);

    await Promise.all([store.use(FLEET, [aBuiltTemplate('h1')], BUILT), store.use(FLEET, [aBuiltTemplate('h1')], BUILT)]);

    await expect(prisma.builtTemplate.count({ where: { fleetId: FLEET } })).resolves.toBe(1);
    await expect(store.find(FLEET, ['h1'])).resolves.toEqual([aBuiltTemplate('h1')]);
  });

  it('finds nothing another fleet built, though of the same hash', async () => {
    const store = createPrismaBuiltTemplateStore(prisma);
    await store.use(FLEET, [aBuiltTemplate('h1')], BUILT);

    await expect(store.find(OTHER_FLEET, ['h1'])).resolves.toEqual([]);
  });

  it('deletes the built templates a fleet last used before a time, and keeps the others and every other fleet\'s', async () => {
    const store = createPrismaBuiltTemplateStore(prisma);
    await store.use(FLEET, [aBuiltTemplate('old'), aBuiltTemplate('recent')], BUILT);
    await store.use(FLEET, [aBuiltTemplate('recent')], LATER);
    await store.use(OTHER_FLEET, [aBuiltTemplate('old')], BUILT);

    await expect(store.deleteUnusedSince(FLEET, LATER)).resolves.toBe(1);

    await expect(store.find(FLEET, ['old', 'recent'])).resolves.toEqual([aBuiltTemplate('recent')]);
    await expect(store.find(OTHER_FLEET, ['old'])).resolves.toEqual([aBuiltTemplate('old')]);
  });
});
