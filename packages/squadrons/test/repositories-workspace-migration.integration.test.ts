import { readFile } from 'node:fs/promises';

import type { FleetId } from '@aeolus-fleet/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from '../src/adapters/prisma/client.js';
import { createSquadronsDatabase } from '../src/testing/database.js';

// The repositories workspace migration (#46; aeolus-fleet-trierarch's
// docs/design/ship-folder.md, point 2): a template or blueprint role stored
// with a worktree workspace is rewritten in the same release as repositories,
// that repository (and its ref) as main and no sub-repositories, so no stored
// squadron or built template holds a workspace common no longer reads.

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const AT = new Date('2026-11-12T09:00:00.000Z');
const MIGRATION = new URL('../src/adapters/prisma/migrations/20261112120000_repositories_workspace/migration.sql', import.meta.url);

let prisma: PrismaClient;

/** JSON as a row holds it. */
type Stored = { [key: string]: Stored } | Stored[] | string | number | boolean | null;
type StoredObject = Record<string, Stored>;

/** A template as a squadron's snapshot or a built template keeps it, with the given crew settings. */
function aStoredTemplate(name: string, crew: StoredObject): StoredObject {
  return { repository: 'example.com/templates', name, version: 1, commit: 'c1', committedAt: AT.toISOString(), description: 'A role.', checkInMinutes: 30, model: null, launchNote: null, charter: 'You work.', handoffs: [], crew };
}

/** A blueprint as a squadron's snapshot keeps it, one role per given crew settings. */
function aStoredBlueprint(crews: StoredObject[]): StoredObject {
  const roles = crews.map((crew, index) => ({ name: `role-${String(index)}`, template: { repository: 'example.com/templates', name: 'builder', version: 1 }, count: 1, model: null, crew, parameters: {} }));
  return { repository: 'example.com/templates', name: 'team', version: 1, commit: 'b1', committedAt: AT.toISOString(), description: 'A team.', roles, handoffs: [], memberNames: 'plain' };
}

async function aSquadron(id: string, stored: { blueprint: StoredObject; templates: StoredObject[] }): Promise<void> {
  await prisma.squadron.create({
    data: { fleetId: FLEET, id, state: 'sailing', ...stored, flagshipShipId: 'shp_01m3tbfspe96yf1rnr4ank0000', flagshipName: id, flagshipCrewToken: 'aeolus_ct_v1_flagship', formedAt: AT },
  });
}

/** Runs the migration on rows written after the database was migrated: the whole file, as Prisma Migrate does. */
async function migrate(): Promise<void> {
  await prisma.$executeRawUnsafe(await readFile(MIGRATION, 'utf8'));
}

beforeEach(async () => {
  prisma = createPrismaClient(await createSquadronsDatabase());
});

afterEach(async () => {
  await prisma.$disconnect();
});

describe('the repositories workspace migration (#46)', () => {
  it("rewrites each worktree workspace of a squadron's templates as repositories, that repository and its ref as main and no sub-repositories", async () => {
    await aSquadron('team-a1b2c3', {
      blueprint: aStoredBlueprint([{}]),
      templates: [aStoredTemplate('builder', { harness: 'codex', workspace: { kind: 'worktree', repository: 'hemma', ref: 'next' }, options: { effort: 'high' } }), aStoredTemplate('tester', { workspace: { kind: 'worktree', repository: 'tidewater' } })],
    });

    await migrate();

    const stored = await prisma.squadron.findUniqueOrThrow({ where: { fleetId_id: { fleetId: FLEET, id: 'team-a1b2c3' } } });
    expect(stored.templates).toEqual([
      aStoredTemplate('builder', { harness: 'codex', workspace: { kind: 'repositories', main: { repository: 'hemma', ref: 'next' }, subRepositories: [] }, options: { effort: 'high' } }),
      aStoredTemplate('tester', { workspace: { kind: 'repositories', main: { repository: 'tidewater' }, subRepositories: [] } }),
    ]);
  });

  it("rewrites each worktree workspace of a squadron's blueprint roles the same way", async () => {
    await aSquadron('team-a1b2c3', { blueprint: aStoredBlueprint([{ workspace: { kind: 'worktree', repository: 'hemma', ref: 'main' } }, { machineLabels: [{ key: 'os', value: 'linux' }] }]), templates: [] });

    await migrate();

    const stored = await prisma.squadron.findUniqueOrThrow({ where: { fleetId_id: { fleetId: FLEET, id: 'team-a1b2c3' } } });
    expect(stored.blueprint).toEqual(aStoredBlueprint([{ workspace: { kind: 'repositories', main: { repository: 'hemma', ref: 'main' }, subRepositories: [] } }, { machineLabels: [{ key: 'os', value: 'linux' }] }]));
  });

  it('rewrites the worktree workspace of a built template the same way', async () => {
    await prisma.builtTemplate.create({ data: { fleetId: FLEET, hash: 'h1', chain: [], template: aStoredTemplate('builder', { workspace: { kind: 'worktree', repository: 'hemma' } }), builtAt: AT, lastUsedAt: AT } });

    await migrate();

    const stored = await prisma.builtTemplate.findUniqueOrThrow({ where: { fleetId_hash: { fleetId: FLEET, hash: 'h1' } } });
    expect(stored.template).toEqual(aStoredTemplate('builder', { workspace: { kind: 'repositories', main: { repository: 'hemma' }, subRepositories: [] } }));
  });

  it('leaves a folder workspace, a repositories workspace and crew settings without a workspace as they are', async () => {
    const templates = [
      aStoredTemplate('notes', { workspace: { kind: 'folder', name: 'notes' } }),
      aStoredTemplate('builder', { workspace: { kind: 'repositories', main: { repository: 'hemma' }, subRepositories: [{ repository: 'skills' }] } }),
      aStoredTemplate('planner', {}),
    ];
    await aSquadron('team-a1b2c3', { blueprint: aStoredBlueprint([{ workspace: { kind: 'folder', name: 'notes' } }, {}]), templates });

    await migrate();

    const stored = await prisma.squadron.findUniqueOrThrow({ where: { fleetId_id: { fleetId: FLEET, id: 'team-a1b2c3' } } });
    expect({ blueprint: stored.blueprint, templates: stored.templates }).toEqual({ blueprint: aStoredBlueprint([{ workspace: { kind: 'folder', name: 'notes' } }, {}]), templates });
  });
});
