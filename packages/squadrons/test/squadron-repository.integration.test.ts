import type { FleetId, ShipId } from '@aeolus-fleet/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from '../src/adapters/prisma/client.js';
import { createPrismaFormationAttempts } from '../src/adapters/prisma/formation-attempts.js';
import { createPrismaSquadronRepository } from '../src/adapters/prisma/squadron-repository.js';
import { beginFormation } from '../src/core/squadron/formation.js';
import type { Member, Squadron } from '../src/core/squadron/squadron.js';
import { createSquadronsDatabase } from '../src/testing/database.js';

// Storing squadrons in Postgres: an update writes only what changed, so two
// updates made from one snapshot, each to another member, keep both.

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const PLANNER: ShipId = 'shp_01m3tbfspe96yf1rnr4ank0001';
const TESTER: ShipId = 'shp_01m3tbfspe96yf1rnr4ank0002';
const ARGO: ShipId = 'shp_01m3tbfspe96yf1rnr4ank0a01';
const AT = new Date('2026-10-03T09:00:00.000Z');
const LATER = new Date('2026-10-03T09:10:00.000Z');
const REPO = 'example.com/templates';
const clock = { now: () => AT };

let prisma: PrismaClient;

const formed: Squadron = {
  id: 'team-a1b2c3',
  fleetId: FLEET,
  state: 'forming',
  blueprint: {
    repository: REPO,
    name: 'team',
    version: 1,
    commit: 'b1',
    committedAt: AT,
    description: 'A team.',
    roles: [
      { name: 'planner', template: { repository: REPO, name: 'planner', version: 1 }, count: 1, model: null, crew: {}, parameters: {} },
      { name: 'tester', template: { repository: REPO, name: 'tester', version: 1 }, count: 1, model: null, crew: {}, parameters: {} },
    ],
    handoffs: [],
    memberNames: 'plain',
    file: 'squadrons/blueprints/team.yaml',
  },
  templates: [],
  flagship: { shipId: 'shp_01m3tbfspe96yf1rnr4ank0000', name: 'team-a1b2c3', crewToken: 'aeolus_ct_v1_flagship' },
  members: [
    { shipId: PLANNER, name: 'planner-k3x9', role: 'planner', type: 'team-a1b2c3:planner', onStationAt: null, checkIn: null, standDownMessageId: null, stoodDownAt: null, retiredAt: null, releasingSince: null, parameters: {} },
    { shipId: TESTER, name: 'tester-m4p7', role: 'tester', type: 'team-a1b2c3:tester', onStationAt: null, checkIn: null, standDownMessageId: null, stoodDownAt: null, retiredAt: null, releasingSince: null, parameters: { area: 'the API' } },
  ],
  formedAt: AT,
  sailedAt: null,
  formingShip: null,
};

beforeEach(async () => {
  prisma = createPrismaClient(await createSquadronsDatabase());
  const attempts = createPrismaFormationAttempts(prisma, clock);
  await attempts.begin({ id: 'team-a1b2c3@1', fleetId: FLEET, squadronId: formed.id, startedAt: AT });
  await createPrismaSquadronRepository(prisma, clock).create(formed, 'team-a1b2c3@1');
});

afterEach(async () => {
  await prisma.$disconnect();
});

const FORMING: ShipId = 'shp_01m3tbfspe96yf1rnr4ank0009';

describe('storing a squadron', () => {
  it('keeps the ship that formed it by message, by id and name, with the key of its form request (decision 0017)', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'lead-team@1', fleetId: FLEET, squadronId: 'lead-team', startedAt: AT });
    const byShip: Squadron = {
      ...formed,
      id: 'lead-team',
      flagship: { shipId: 'shp_01m3tbfspe96yf1rnr4ank0010', name: 'lead-team', crewToken: 'aeolus_ct_v1_lead' },
      members: [],
      formedAt: LATER,
      formingShip: { shipId: FORMING, name: 'tech-lead', formKey: 'form-1' },
    };

    await squadrons.create(byShip, 'lead-team@1');

    const stored = await squadrons.list(FLEET);
    expect(stored.map(({ id, formingShip }) => ({ id, formingShip }))).toEqual([
      { id: 'team-a1b2c3', formingShip: null },
      { id: 'lead-team', formingShip: { shipId: FORMING, name: 'tech-lead', formKey: 'form-1' } },
    ]);
  });
});

describe('updating a squadron', () => {
  it('writes only what changed, so two updates from one snapshot to different members keep both', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }

    await squadrons.update({
      before: snapshot,
      after: { ...snapshot, members: snapshot.members.map((member) => (member.shipId === PLANNER ? { ...member, onStationAt: LATER } : member)) },
    });
    await squadrons.update({
      before: snapshot,
      after: { ...snapshot, members: snapshot.members.map((member) => (member.shipId === TESTER ? { ...member, checkIn: { at: LATER, model: 'claude-opus-5-5' } } : member)) },
    });

    const [stored] = await squadrons.list(FLEET);
    expect(stored?.members.map(({ onStationAt, checkIn }) => ({ onStationAt, checkIn }))).toEqual([
      { onStationAt: LATER, checkIn: null },
      { onStationAt: null, checkIn: { at: LATER, model: 'claude-opus-5-5' } },
    ]);
  });

  it("keeps the sender and key of the add-member request a member was added by, and none for any other, the same key from two senders apart", async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }
    const addedBy = ({ shipId, name, by }: { shipId: ShipId; name: string; by: ShipId }): Member => ({ shipId, name, role: 'tester', type: 'team-a1b2c3:tester', onStationAt: null, checkIn: null, standDownMessageId: null, stoodDownAt: null, retiredAt: null, releasingSince: null, parameters: {}, addRequest: { by, key: 'add-1' } });
    const added = [addedBy({ shipId: 'shp_01m3tbfspe96yf1rnr4ank0003', name: 'tester-q8r2', by: FORMING }), addedBy({ shipId: 'shp_01m3tbfspe96yf1rnr4ank0004', name: 'tester-w5t1', by: ARGO })];

    await squadrons.update({ before: snapshot, after: { ...snapshot, members: [...snapshot.members, ...added] } });

    const [stored] = await squadrons.list(FLEET);
    expect(stored?.members.map(({ name, addRequest }) => ({ name, addRequest }))).toEqual([
      { name: 'planner-k3x9', addRequest: undefined },
      { name: 'tester-m4p7', addRequest: undefined },
      { name: 'tester-q8r2', addRequest: { by: FORMING, key: 'add-1' } },
      { name: 'tester-w5t1', addRequest: { by: ARGO, key: 'add-1' } },
    ]);
  });

  it('writes the squadron state and members it changes', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }

    await squadrons.update({
      before: snapshot,
      after: { ...snapshot, state: 'sailing', sailedAt: LATER, members: snapshot.members.map((member) => ({ ...member, onStationAt: LATER })) },
    });

    const [stored] = await squadrons.list(FLEET);
    expect(stored).toMatchObject({ state: 'sailing', sailedAt: LATER });
    expect(stored?.members.map((member) => member.onStationAt)).toEqual([LATER, LATER]);
  });

  it("writes each member's stand-down message, when it stood down and when it retired", async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }

    await squadrons.update({
      before: snapshot,
      after: {
        ...snapshot,
        state: 'standing-down',
        members: snapshot.members.map((member) =>
          member.shipId === PLANNER ? { ...member, standDownMessageId: 'msg_01m3tbfspe96yf1rnr4ank0100', stoodDownAt: LATER, retiredAt: LATER } : { ...member, standDownMessageId: 'msg_01m3tbfspe96yf1rnr4ank0101', releasingSince: LATER },
        ),
      },
    });

    const [stored] = await squadrons.list(FLEET);
    expect(stored?.state).toBe('standing-down');
    expect(stored?.members.map(({ standDownMessageId, stoodDownAt, retiredAt, releasingSince }) => ({ standDownMessageId, stoodDownAt, retiredAt, releasingSince }))).toEqual([
      { standDownMessageId: 'msg_01m3tbfspe96yf1rnr4ank0100', stoodDownAt: LATER, retiredAt: LATER, releasingSince: null },
      { standDownMessageId: 'msg_01m3tbfspe96yf1rnr4ank0101', stoodDownAt: null, retiredAt: null, releasingSince: LATER },
    ]);
  });
});

describe('adding a member', () => {
  it('stores the new member and finishes its formation attempt together', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-a1b2c3@2', fleetId: FLEET, squadronId: formed.id, startedAt: LATER });
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }
    const added = { shipId: 'shp_01m3tbfspe96yf1rnr4ank0003', name: 'tester-q8r2', role: 'tester', type: 'team-a1b2c3:tester', onStationAt: null, checkIn: null, standDownMessageId: null, stoodDownAt: null, retiredAt: null, releasingSince: null, parameters: { lead: 'planner-k3x9' } } as const;

    await squadrons.update({ before: snapshot, after: { ...snapshot, members: [...snapshot.members, added] }, finishesAttempt: 'team-a1b2c3@2' });

    const [stored] = await squadrons.list(FLEET);
    expect(stored?.members.map((member) => member.name)).toEqual(['planner-k3x9', 'tester-m4p7', 'tester-q8r2']);
    expect(stored?.members.map(({ parameters }) => parameters)).toEqual([{}, { area: 'the API' }, { lead: 'planner-k3x9' }]);
    await expect(attempts.unfinished(FLEET)).resolves.toEqual([]);
  });
});

describe('formation attempts begun in the same instant', () => {
  it('get ids of their own, so adding a member in the instant its squadron formed is no clash', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    let drawn = 0;
    const deps = {
      door: { register: unused, whoami: unused, commission: unused, getShip: unused, release: unused, deregister: unused, getStartingPrompt: unused, listShips: unused, requestCrew: unused, removeCrewRequest: unused, findLabelValue: unused, retire: unused, receive: unused, ack: unused, pong: unused, send: unused },
      attempts,
      random: {
        suffix: (length: number) => {
          drawn += 1;
          return String(drawn).padStart(length, '0');
        },
      },
      clock,
    };
    const crew = { fleetId: FLEET, shipId: 'shp_01m3tbfspe96yf1rnr4ank9h1a', name: 'squadrons', crewToken: 'aeolus_ct_v1_management', crewedAt: AT } as const;

    const forming = await beginFormation(deps, { crew, squadronId: 'team-b2c3d4' });
    const adding = await beginFormation(deps, { crew, squadronId: 'team-b2c3d4' });

    expect(adding.attemptId).not.toBe(forming.attemptId);
    await expect(attempts.unfinished(FLEET)).resolves.toHaveLength(2);
  });
});

describe('a formation attempt the forming gave up (#738)', () => {
  it('is read as given up, and one a forming still holds is not', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: FLEET, squadronId: 'team-b2c3d4', startedAt: AT });
    await attempts.begin({ id: 'team-c3d4e5@1', fleetId: FLEET, squadronId: 'team-c3d4e5', startedAt: LATER });

    await attempts.giveUp(FLEET, 'team-b2c3d4@1');

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([
      expect.objectContaining({ id: 'team-b2c3d4@1', isGivenUp: true }),
      expect.objectContaining({ id: 'team-c3d4e5@1', isGivenUp: false }),
    ]);
  });
});

describe('a formation attempt of one fleet', () => {
  const OTHER_FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sw';

  it('gets no planned ship from another fleet', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: FLEET, squadronId: 'team-b2c3d4', startedAt: AT });

    await expect(attempts.plan(OTHER_FLEET, { attemptId: 'team-b2c3d4@1', name: 'team-b2c3d4' })).rejects.toThrow();

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1', ships: [] })]);
  });

  it('gets no commissioned ship from another fleet', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: FLEET, squadronId: 'team-b2c3d4', startedAt: AT });
    await attempts.plan(FLEET, { attemptId: 'team-b2c3d4@1', name: 'team-b2c3d4' });

    await attempts.commissioned(OTHER_FLEET, { attemptId: 'team-b2c3d4@1', name: 'team-b2c3d4', shipId: PLANNER });

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1', ships: [{ name: 'team-b2c3d4', shipId: null }] })]);
  });

  it('is neither given up nor finished by another fleet', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: FLEET, squadronId: 'team-b2c3d4', startedAt: AT });

    await attempts.giveUp(OTHER_FLEET, 'team-b2c3d4@1');
    await attempts.finish(OTHER_FLEET, 'team-b2c3d4@1');

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1', isGivenUp: false })]);
  });

  it('is not finished by storing a squadron of another fleet', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: OTHER_FLEET, squadronId: 'team-b2c3d4', startedAt: AT });

    await squadrons.create({ ...formed, id: 'team-b2c3d4', flagship: { ...formed.flagship, shipId: 'shp_01m3tbfspe96yf1rnr4ank0010', name: 'team-b2c3d4' }, members: [] }, 'team-b2c3d4@1');

    await expect(attempts.unfinished(OTHER_FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1' })]);
  });

  it('is not finished by updating a squadron of another fleet', async () => {
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: OTHER_FLEET, squadronId: 'team-b2c3d4', startedAt: AT });
    const [snapshot] = await squadrons.list(FLEET);
    if (!snapshot) {
      expect.fail('the squadron was not stored');
    }

    await squadrons.update({ before: snapshot, after: snapshot, finishesAttempt: 'team-b2c3d4@1' });

    await expect(attempts.unfinished(OTHER_FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1' })]);
  });

  it('is planned, commissioned, given up and finished by its own fleet', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'team-b2c3d4@1', fleetId: FLEET, squadronId: 'team-b2c3d4', startedAt: AT });
    await attempts.plan(FLEET, { attemptId: 'team-b2c3d4@1', name: 'team-b2c3d4' });
    await attempts.commissioned(FLEET, { attemptId: 'team-b2c3d4@1', name: 'team-b2c3d4', shipId: PLANNER });
    await attempts.giveUp(FLEET, 'team-b2c3d4@1');

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([expect.objectContaining({ id: 'team-b2c3d4@1', isGivenUp: true, ships: [{ name: 'team-b2c3d4', shipId: PLANNER }] })]);

    await attempts.finish(FLEET, 'team-b2c3d4@1');

    await expect(attempts.unfinished(FLEET)).resolves.toEqual([]);
  });
});

function unused(): never {
  throw new Error('not used: an attempt begins without the fleet');
}

describe('a squadron formed before versions kept their file', () => {
  it('is read with no file for its blueprint', async () => {
    await prisma.$executeRaw`UPDATE squadrons SET blueprint = blueprint - 'file'`;

    const [stored] = await createPrismaSquadronRepository(prisma, clock).list(FLEET);

    expect(stored?.blueprint.file).toBe('');
  });
});

const TYPESCRIPT_IMPLEMENTER = {
  repository: REPO,
  name: 'typescript-implementer',
  version: 1,
  file: 'squadrons/templates/typescript-implementer.yaml',
  commit: 't1',
  committedAt: AT,
  description: 'Implements in TypeScript.',
  checkInMinutes: 30,
  model: null,
  launchNote: null,
  charter: 'Report to the flagship.\n\nRun npm run typecheck.',
  handoffs: [],
  crew: {},
  parameters: [],
  scopes: [],
};

describe('a squadron formed from a template on a base', () => {
  it('keeps the built template with its hash and its chain, base-layer-0 first, and which layer gave each part', async () => {
    const built = {
      ...TYPESCRIPT_IMPLEMENTER,
      hash: '4f2a91c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c',
      labels: [{ key: 'company', value: 'aeolus' }],
      chain: [
        { repository: 'github.com/ThomasHendrickx/skills', name: 'implementer', version: 2, commit: 'i2' },
        { repository: REPO, name: 'typescript-implementer', version: 1, commit: 't1' },
      ],
      origins: {
        charter: [
          { layer: 0, text: 'Report to the flagship.' },
          { layer: 1, text: 'Run npm run typecheck.' },
        ],
        fields: { description: 1, checkIn: 0 },
        filled: [{ name: 'lead', layer: 1 }],
      },
    };
    const squadrons = createPrismaSquadronRepository(prisma, clock);
    await createPrismaFormationAttempts(prisma, clock).begin({ id: 'builders-d4e5f6@1', fleetId: FLEET, squadronId: 'builders-d4e5f6', startedAt: AT });
    await squadrons.create({ ...formed, id: 'builders-d4e5f6', flagship: { ...formed.flagship, name: 'builders-d4e5f6' }, members: [], templates: [built] }, 'builders-d4e5f6@1');

    const stored = (await squadrons.list(FLEET)).find((squadron) => squadron.id === 'builders-d4e5f6');

    expect(stored?.templates).toEqual([built]);
  });
});

describe('a squadron formed before template bases', () => {
  it('reads each template as a chain of one, its own version, giving its whole charter, with no hash and no labels', async () => {
    await prisma.$executeRaw`UPDATE squadrons SET templates = ${JSON.stringify([TYPESCRIPT_IMPLEMENTER])}::jsonb`;

    const [stored] = await createPrismaSquadronRepository(prisma, clock).list(FLEET);

    expect(stored?.templates[0]).toMatchObject({
      labels: [],
      hash: null,
      chain: [{ repository: REPO, name: 'typescript-implementer', version: 1, commit: 't1' }],
      origins: { charter: [{ layer: 0, text: 'Report to the flagship.\n\nRun npm run typecheck.' }], fields: {}, filled: [] },
    });
  });
});

describe('formation recovery refusals', () => {
  it('keeps the refusal count when the adapter restarts, scoped to its fleet', async () => {
    const attempts = createPrismaFormationAttempts(prisma, clock);
    await attempts.begin({ id: 'refused-attempt', fleetId: FLEET, squadronId: formed.id, startedAt: AT });
    await attempts.recordRecoveryRefusal(FLEET, 'refused-attempt');
    await attempts.recordRecoveryRefusal(FLEET, 'refused-attempt');
    await attempts.recordRecoveryRefusal('flt_01m3tb1zgr5h2ffee12xnch8sw', 'refused-attempt');
    const restarted = createPrismaFormationAttempts(prisma, clock);
    await expect(restarted.unfinished(FLEET)).resolves.toEqual([
      expect.objectContaining({ id: 'refused-attempt', recoveryRefusals: 2 }),
    ]);
    await expect(restarted.unfinished('flt_01m3tb1zgr5h2ffee12xnch8sw')).resolves.toEqual([]);
  });
});
