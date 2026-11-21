import type { FleetId, ShipId } from '@aeolus-fleet/common';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp, createMigratedDatabase, createPrismaClient, createUseCases, FLEET_URL, newKey, OPERATOR, operatorCaller, secretOf, unwrap, type PrismaClient } from '@aeolus-fleet/core/testing';

import { createPrismaClient as createSquadronsPrismaClient } from '../src/adapters/prisma/client.js';
import { createSquadronsApp, type SquadronsApp } from '../src/app.js';
import { createSquadronsDatabase } from '../src/testing/database.js';
import { startFakeGithub, tagsAt, type FakeGithub } from '../src/testing/fake-github.js';
import { seedRepository } from '../src/testing/repositories.js';
import { giveOperatorLogin } from './support/operator-login.js';

// The installation API (decision 0021): a hosting service switches squadrons
// on or off per fleet and deletes a fleet's records, with the installation
// token. Without a token squadrons is open: every fleet is served, as
// self-hosted squadrons always was.

const TOKEN = 'an-installation-token-of-at-least-32-characters';
const REPO = 'github.com/acme/templates';

let github: FakeGithub;
let fleetDatabase: PrismaClient;
let fleet: FastifyInstance;
let fleetUrl: string;
let squadronsDatabaseUrl: string;
let app: SquadronsApp;
let address: string;
let fleetId: FleetId;
let management: { shipId: ShipId; secret: string };
let cookie: string;
let caller: ReturnType<typeof operatorCaller>;

async function signIn(): Promise<string> {
  const response = await fetch(`${fleetUrl}/trpc/console.signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(FLEET_URL).origin },
    body: JSON.stringify({ email: OPERATOR.email, password: OPERATOR.password }),
  });
  const set = response.headers.getSetCookie().find((each) => each.startsWith('aeolus_session='));
  return z.string().parse(set).split(';')[0] ?? '';
}

/** squadrons on the test's database, with or without an installation token. */
async function startSquadrons(installationToken?: string): Promise<void> {
  app = createSquadronsApp({ databaseUrl: squadronsDatabaseUrl, fleetUrl, githubApiUrl: github.apiUrl, logger: false, ...(installationToken === undefined ? {} : { installationToken }) });
  address = await app.server.listen({ host: '127.0.0.1', port: 0 });
}

function installation(request: { procedure: string; body: unknown; token?: string | null }): Promise<Response> {
  const token = request.token === undefined ? TOKEN : request.token;
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(token === null ? {} : { 'x-aeolus-installation-token': token }) };
  return request.procedure === 'installation.get'
    ? fetch(`${address}/trpc/installation.get?input=${encodeURIComponent(JSON.stringify(request.body))}`, { headers })
    : fetch(`${address}/trpc/${request.procedure}`, { method: 'POST', headers, body: JSON.stringify(request.body) });
}

async function dataOf(response: Response): Promise<unknown> {
  expect(response.status, await response.clone().text()).toBe(200);
  return z.object({ result: z.object({ data: z.unknown() }) }).parse(await response.json()).result.data;
}

function asOperator(procedure: string, body?: unknown): Promise<Response> {
  return body === undefined
    ? fetch(`${address}/trpc/${procedure}`, { headers: { cookie } })
    : fetch(`${address}/trpc/${procedure}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

const statusSchema = z.object({ enabled: z.boolean(), state: z.string() });
const repositoriesSchema = z.array(z.object({ name: z.string() }));

beforeEach(async () => {
  github = await startFakeGithub();
  github.repositories.set('acme/templates', {
    tags: tagsAt(
      {
        files: {
          '.aeolus/squadrons/templates/tester.yaml': 'description: Tests.\ncheckIn: 30m\ncharter: You test.\n',
          '.aeolus/squadrons/blueprints/team.yaml': `description: A team.\nroles:\n  tester:\n    template: ${REPO}#tester@1\n`,
        },
      },
      'tester@1',
      'team@1',
    ),
  });
  const fleetDatabaseUrl = await createMigratedDatabase();
  fleetDatabase = createPrismaClient(fleetDatabaseUrl);
  const useCases = createUseCases({ prisma: fleetDatabase });
  const founded = unwrap(await useCases.initialiseFleet({ name: 'home fleet' }));
  await giveOperatorLogin(fleetDatabase, founded.fleetId);
  fleetId = founded.fleetId;
  caller = operatorCaller(founded);
  const commissioned = unwrap(
    await useCases.commissionShip(operatorCaller(founded), { idempotencyKey: newKey(), name: 'squadrons', type: 'squadrons', kind: 'plugin', scopes: ['fleet:read', 'fleet:commission', 'fleet:manage', 'fleet:on-behalf'] }),
  );
  management = { shipId: commissioned.shipId, secret: secretOf(commissioned.secret) };
  fleet = createApp({ databaseUrl: fleetDatabaseUrl, publicUrl: FLEET_URL, logger: false });
  fleetUrl = await fleet.listen({ host: '127.0.0.1', port: 0 });
  squadronsDatabaseUrl = await createSquadronsDatabase();
  await seedRepository(squadronsDatabaseUrl, { fleetId, name: REPO, url: 'https://github.com/acme/templates' });
  cookie = await signIn();
});

afterEach(async () => {
  await app.close();
  await fleet.close();
  await fleetDatabase.$disconnect();
  await github.close();
});

describe('an open installation, with no installation token', () => {
  it('serves every fleet as before, and has no installation procedures', async () => {
    await startSquadrons();

    expect(statusSchema.parse(await dataOf(await asOperator('connection.status')))).toEqual({ enabled: true, state: 'not-connected' });
    await expect(installation({ procedure: 'installation.get', body: { fleetId } }).then((response) => response.status)).resolves.toBe(404);
    await expect(installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management } }).then((response) => response.status)).resolves.toBe(404);
    await expect(fetch(`${address}/api/health`).then((response) => response.json())).resolves.toEqual({ status: 'ok' });
  });
});

describe('an enabled installation, with an installation token', () => {
  beforeEach(async () => {
    await startSquadrons(TOKEN);
  });

  it.each([
    ['no token', null],
    ['a wrong token', 'not-the-installation-token-but-just-as-long-xx'],
  ])('refuses the installation procedures with %s', async (_label, token) => {
    await expect(installation({ procedure: 'installation.get', body: { fleetId }, token }).then((response) => response.status)).resolves.toBe(401);
    await expect(installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management }, token }).then((response) => response.status)).resolves.toBe(401);
  });

  it('serves no fleet until it is switched on: the console reads it off, and connecting and every other procedure are refused', async () => {
    expect(statusSchema.parse(await dataOf(await asOperator('connection.status')))).toEqual({ enabled: false, state: 'not-connected' });
    await expect(asOperator('repositories.list').then((response) => response.status)).resolves.toBe(403);
    await expect(asOperator('connection.connect', { shipId: management.shipId, secret: management.secret }).then((response) => response.status)).resolves.toBe(403);
    await expect(dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).resolves.toEqual({ enabled: false, connected: false });
  });

  it('serves a fleet switched on, and keeps everything of it while it is off again', async () => {
    await expect(dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-on', fleetId, enabled: true } }))).resolves.toEqual({ fleetId, enabled: true });
    await dataOf(await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management } }));
    await expect(dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).resolves.toEqual({ enabled: true, connected: true });

    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-off', fleetId, enabled: false } }));
    await expect(asOperator('repositories.list').then((response) => response.status)).resolves.toBe(403);
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-on-again', fleetId, enabled: true } }));

    expect(statusSchema.parse(await dataOf(await asOperator('connection.status')))).toEqual({ enabled: true, state: 'connected' });
    expect(repositoriesSchema.parse(await dataOf(await asOperator('repositories.list'))).map((each) => each.name)).toEqual([REPO]);
  });

  it('forgets everything of a deleted fleet: no record of it stays in squadrons, and it is off and not connected', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-on', fleetId, enabled: true } }));
    await dataOf(await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management } }));
    const formed = await asOperator('squadrons.form', { blueprint: { repository: REPO, name: 'team', version: 1 }, squadronId: 'team-one' });
    expect(formed.status, await formed.clone().text()).toBe(200);

    await expect(dataOf(await installation({ procedure: 'installation.delete', body: { requestId: 'r-delete', fleetId } }))).resolves.toEqual({});

    await expect(dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).resolves.toEqual({ enabled: false, connected: false });
    const squadronsDatabase = createSquadronsPrismaClient(squadronsDatabaseUrl);
    const where = { where: { fleetId } };
    const left = await Promise.all([
      squadronsDatabase.templateRepository.count(where),
      squadronsDatabase.squadron.count(where),
      squadronsDatabase.member.count(where),
      squadronsDatabase.formationAttempt.count(where),
      squadronsDatabase.managementCrew.count(where),
      squadronsDatabase.fleetSwitch.count(where),
      squadronsDatabase.installationRequest.count(where),
      squadronsDatabase.formRefusal.count(where),
      squadronsDatabase.relay.count(where),
      squadronsDatabase.builtTemplate.count(where),
    ]);
    await squadronsDatabase.$disconnect();
    expect(left).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('answers a replayed request id with its first answer, and refuses one used for another request', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-1', fleetId, enabled: true } }));
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-2', fleetId, enabled: false } }));

    await expect(dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-1', fleetId, enabled: true } }))).resolves.toEqual({ fleetId, enabled: true });
    await expect(installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-1', fleetId, enabled: false } }).then((response) => response.status)).resolves.toBe(409);
    await expect(dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).resolves.toEqual({ enabled: false, connected: false });
  });

  it('replays success after restart without registering again, checks off before replay, and retains the connection on again', async () => {
    const body = { requestId: 'connect', fleetId, ...management };
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId, enabled: true } }));
    expect(await dataOf(await installation({ procedure: 'installation.connect', body }))).toEqual({ enabled: true, connected: true });
    await app.close();
    await startSquadrons(TOKEN);
    expect(await dataOf(await installation({ procedure: 'installation.connect', body: { ...body, secret: 'fresh-secret-not-needed' } }))).toEqual({ enabled: true, connected: true });
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'off', fleetId, enabled: false } }));
    expect((await installation({ procedure: 'installation.connect', body })).status).toBe(403);
    expect(await dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).toEqual({ enabled: false, connected: true });
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on-again', fleetId, enabled: true } }));
    expect(await dataOf(await installation({ procedure: 'installation.connect', body }))).toEqual({ enabled: true, connected: true });
  });

  it.each([{ extra: true }, { secret: '' }, { requestId: '' }, { fleetId: 'wrong' }, { shipId: 'wrong' }])('refuses strict connect input %j', async (change) => {
    expect((await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management, ...change } })).status).toBe(400);
  });

  it('keeps a refused request retryable with a fresh secret and preserves already connected', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId, enabled: true } }));
    const body = { requestId: 'connect', fleetId, ...management };
    expect((await installation({ procedure: 'installation.connect', body: { ...body, secret: 'refused' } })).status).toBe(400);
    expect(await dataOf(await installation({ procedure: 'installation.connect', body }))).toEqual({ enabled: true, connected: true });
    expect((await installation({ procedure: 'installation.connect', body: { ...body, requestId: 'another' } })).status).toBe(409);
  });

  it.each(['fleet:read', 'fleet:commission', 'fleet:manage'])('refuses a hand-over missing %s and deregisters the acquired crew', async (missing) => {
    const useCases = createUseCases({ prisma: fleetDatabase });
    const ship = unwrap(await useCases.commissionShip(caller, { idempotencyKey: newKey(), name: 'deficient', type: 'squadrons', kind: 'plugin', scopes: ['fleet:read', 'fleet:commission', 'fleet:manage'].filter((scope) => scope !== missing) }));
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId, enabled: true } }));
    const response = await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, shipId: ship.shipId, secret: secretOf(ship.secret) } });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('fleet:read, fleet:commission and fleet:manage');
    expect(await dataOf(await installation({ procedure: 'installation.get', body: { fleetId } }))).toEqual({ enabled: true, connected: false });
    expect(await fleetDatabase.lease.count({ where: { fleetId, shipId: ship.shipId, endedAt: null } })).toBe(0);
  });

  it('refuses a ship from another fleet and deregisters the acquired crew', async () => {
    const otherFleetId = 'flt_00000000000000000000000000';
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId: otherFleetId, enabled: true } }));
    const response = await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId: otherFleetId, ...management } });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('another fleet');
    expect(await fleetDatabase.lease.count({ where: { fleetId, shipId: management.shipId, endedAt: null } })).toBe(0);
  });

  it('retains one connection under concurrent hand-overs and replays concurrent success', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId, enabled: true } }));
    const body = { requestId: 'connect', fleetId, ...management };
    const answers = await Promise.all([installation({ procedure: 'installation.connect', body }), installation({ procedure: 'installation.connect', body }), installation({ procedure: 'installation.connect', body: { ...body, requestId: 'other' } })]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 409]);
    const database = createSquadronsPrismaClient(squadronsDatabaseUrl);
    try {
      expect(await database.managementCrew.count({ where: { fleetId } })).toBe(1);
    } finally {
      await database.$disconnect();
    }
  });

  it('refuses request ids used for another operation, fleet or ship', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'on', fleetId, enabled: true } }));
    const body = { requestId: 'connect', fleetId, ...management };
    expect((await installation({ procedure: 'installation.connect', body: { ...body, requestId: 'on' } })).status).toBe(409);
    await dataOf(await installation({ procedure: 'installation.connect', body }));
    expect((await installation({ procedure: 'installation.setEnabled', body: { requestId: 'connect', fleetId, enabled: true } })).status).toBe(409);
    expect((await installation({ procedure: 'installation.connect', body: { ...body, shipId: 'shp_00000000000000000000000000' } })).status).toBe(409);
    const otherFleetId = 'flt_00000000000000000000000000';
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'other-on', fleetId: otherFleetId, enabled: true } }));
    expect((await installation({ procedure: 'installation.connect', body: { ...body, fleetId: otherFleetId } })).status).toBe(409);
  });

  it('says in its health and version nothing about its connected fleets or its installation', async () => {
    await dataOf(await installation({ procedure: 'installation.setEnabled', body: { requestId: 'r-on', fleetId, enabled: true } }));
    await dataOf(await installation({ procedure: 'installation.connect', body: { requestId: 'connect', fleetId, ...management } }));

    await expect(fetch(`${address}/api/health`).then((response) => response.json())).resolves.toEqual({ status: 'ok' });
    await expect(fetch(`${address}/api/version`).then(async (response) => Object.keys(z.record(z.string(), z.string()).parse(await response.json())))).resolves.toEqual(['squadrons']);
  });
});
