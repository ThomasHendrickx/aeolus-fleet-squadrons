import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp, createMigratedDatabase, createPrismaClient, createUseCases, FLEET_URL, newKey, OPERATOR, operatorCaller, secretOf, unwrap, type PrismaClient } from '@aeolus-fleet/core/testing';

import { createSquadronsApp, type SquadronsApp } from '../src/app.js';
import { createSquadronsDatabase } from '../src/testing/database.js';
import { startFakeGithub, tagsAt, type FakeGithub } from '../src/testing/fake-github.js';
import { seedRepository } from '../src/testing/repositories.js';
import { giveOperatorLogin } from './support/operator-login.js';

// A template names any scope, and the forming ship passes on what it holds
// (decision 0046, design on-behalf-scopes): against a real core, which checks
// the scopes against the ship squadrons commissions on behalf of.

const REPO = 'github.com/acme/templates';
const FORM = 'application/vnd.aeolus.squadron.form+json';
const FORMED = 'application/vnd.aeolus.squadron.formed+json';
const FORM_REFUSED = 'application/vnd.aeolus.squadron.form-refused+json';
/** A live change shows within this. */
const LIVE_TIMEOUT_MS = 20_000;

let github: FakeGithub;
let fleetDatabase: PrismaClient;
let fleet: FastifyInstance;
let fleetUrl: string;
let app: SquadronsApp;
let address: string;
let cookie: string;
let fleetUseCases: ReturnType<typeof createUseCases>;
let argo: ReturnType<typeof operatorCaller>;

async function signIn(): Promise<string> {
  const response = await fetch(`${fleetUrl}/trpc/console.signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(FLEET_URL).origin },
    body: JSON.stringify({ email: OPERATOR.email, password: OPERATOR.password }),
  });
  const set = response.headers.getSetCookie().find((each) => each.startsWith('aeolus_session='));
  return z.string().parse(set).split(';')[0] ?? '';
}

beforeEach(async () => {
  github = await startFakeGithub();
  github.repositories.set('acme/templates', {
    tags: tagsAt(
      {
        files: {
          '.aeolus/squadrons/templates/builder.yaml': 'description: Builds.\ncheckIn: 30m\ncharter: You build.\nscopes:\n  - meetings:open\ncrew:\n  workspace:\n    kind: worktree\n    repository: hemma\n',
          '.aeolus/squadrons/blueprints/delivery.yaml': `description: Delivers one outcome.\nroles:\n  builder:\n    template: ${REPO}#builder@1\n`,
        },
      },
      'builder@1', 'delivery@1',
    ),
  });

  const fleetDatabaseUrl = await createMigratedDatabase();
  fleetDatabase = createPrismaClient(fleetDatabaseUrl);
  fleetUseCases = createUseCases({ prisma: fleetDatabase });
  argo = operatorCaller(unwrap(await fleetUseCases.initialiseFleet({ name: 'home fleet' })));
  await giveOperatorLogin(fleetDatabase, argo.fleetId);
  const { shipId, secret } = unwrap(
    await fleetUseCases.commissionShip(argo, {
      idempotencyKey: newKey(),
      name: 'squadrons',
      type: 'squadrons',
      kind: 'plugin',
      scopes: ['fleet:read', 'fleet:commission', 'fleet:manage', 'labels:define', 'labels:assign', 'fleet:on-behalf', 'scopes:declare'],
    }),
  );
  fleet = createApp({ databaseUrl: fleetDatabaseUrl, publicUrl: FLEET_URL, logger: false, receiveWaitMs: 500 });
  fleetUrl = await fleet.listen({ host: '127.0.0.1', port: 0 });

  const squadronsDatabaseUrl = await createSquadronsDatabase();
  await seedRepository(squadronsDatabaseUrl, { fleetId: argo.fleetId, name: REPO, url: 'https://github.com/acme/templates' });
  app = createSquadronsApp({ databaseUrl: squadronsDatabaseUrl, fleetUrl, githubApiUrl: github.apiUrl, logger: false });
  unwrap(await app.connect({ operatorFleetId: argo.fleetId, shipId, secret: secretOf(secret) }));
  await app.refreshCatalogue();
  address = await app.server.listen({ host: '127.0.0.1', port: 0 });
  app.startFlagships(200);
  cookie = await signIn();
});

afterEach(async () => {
  await app.close();
  await fleet.close();
  await fleetDatabase.$disconnect();
  await github.close();
});

const deliveriesSchema = z.object({
  deliveries: z.array(z.object({ deliveryId: z.string(), messageId: z.string(), contentType: z.string(), payload: z.string(), inReplyTo: z.string().nullable() })),
});
type Delivery = z.infer<typeof deliveriesSchema>['deliveries'][number];

/** A ship's session over the fleet's REST API, crewed with its secret. */
async function crewed(ship: { shipId: string; secret: string }) {
  const registered = await fetch(`${fleetUrl}/api/v1/ship/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ship, location: { kind: 'DEVICE' }, harness: 'claude-code' }),
  });
  const { crewToken } = z.object({ crewToken: z.string() }).parse(await registered.json());
  const call = async (operation: 'send' | 'receive' | 'ack', body: Record<string, unknown>): Promise<unknown> => {
    const response = await fetch(`${fleetUrl}/api/v1/ship/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${crewToken}` },
      body: JSON.stringify(operation === 'send' ? { model: 'claude-opus-5-5', ...body } : body),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  };
  /** Receives until a delivery of the content type arrives, acks it and answers it. */
  const awaitDelivery = async (contentType: string): Promise<Delivery> => {
    let found: Delivery | undefined;
    await expect
      .poll(
        async () => {
          const { deliveries } = deliveriesSchema.parse(await call('receive', {}));
          for (const delivery of deliveries) {
            await call('ack', { deliveryId: delivery.deliveryId });
          }
          found = deliveries.find((delivery) => delivery.contentType === contentType) ?? found;
          return found !== undefined;
        },
        { timeout: LIVE_TIMEOUT_MS },
      )
      .toBe(true);
    if (!found) {
      expect.fail(`no ${contentType} arrived`);
    }
    return found;
  };
  return { call, awaitDelivery };
}

/** The forming request of a ship, for the delivery blueprint. */
async function requestForm(techLead: Awaited<ReturnType<typeof crewed>>, key: string): Promise<void> {
  await techLead.call('send', {
    selector: { kind: 'ship', name: 'squadrons' },
    contentType: FORM,
    payload: JSON.stringify({ blueprint: `${REPO}#delivery@1`, squadronId: 'login-flow', members: { 'builder-1': {} }, key }),
    idempotencyKey: key,
  });
}

describe('a template naming a scope', () => {
  it('gives its members the scope when the forming ship holds it, though squadrons does not', async () => {
    const lead = unwrap(await fleetUseCases.commissionShip(argo, { idempotencyKey: newKey(), name: 'tech-lead', type: 'lead', scopes: ['squadrons:form', 'meetings:open'] }));
    const techLead = await crewed({ shipId: lead.shipId, secret: secretOf(lead.secret) });

    await requestForm(techLead, 'form-1');
    await techLead.awaitDelivery(FORMED);

    const members = await fleetDatabase.ship.findMany({ where: { type: 'login-flow:builder' }, select: { scopes: true } });
    expect(members.map(({ scopes }) => scopes.includes('meetings:open'))).toEqual([true]);
  });

  it('refuses a forming ship that lacks the scope, naming it, and commissions nothing', async () => {
    const lead = unwrap(await fleetUseCases.commissionShip(argo, { idempotencyKey: newKey(), name: 'tech-lead', type: 'lead', scopes: ['squadrons:form'] }));
    const techLead = await crewed({ shipId: lead.shipId, secret: secretOf(lead.secret) });

    await requestForm(techLead, 'form-1');
    const refused = await techLead.awaitDelivery(FORM_REFUSED);

    const { key, code, message } = z.object({ key: z.string(), code: z.string(), message: z.string() }).parse(JSON.parse(refused.payload));
    expect({ key, code }).toEqual({ key: 'form-1', code: 'FORMING_FAILED' });
    expect(message).toContain('meetings:open');
    await expect(fleetDatabase.ship.count({ where: { name: 'login-flow' } })).resolves.toBe(0);
  });

  it('gives its members the scope when argo forms in the console', async () => {
    const response = await fetch(`${address}/trpc/squadrons.form`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ blueprint: { repository: REPO, name: 'delivery', version: 1 }, squadronId: 'login-flow', members: { 'builder-1': {} } }),
    });

    expect(response.status, await response.clone().text()).toBe(200);
    const members = await fleetDatabase.ship.findMany({ where: { type: 'login-flow:builder' }, select: { scopes: true } });
    expect(members.map(({ scopes }) => scopes.includes('meetings:open'))).toEqual([true]);
  });
});
