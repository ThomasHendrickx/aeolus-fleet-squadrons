import type { FleetId } from '@aeolus-fleet/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from '../src/adapters/prisma/client.js';
import { createPrismaFleetForgetter } from '../src/adapters/prisma/fleet-forgetter.js';
import { createPrismaKeyOutages } from '../src/adapters/prisma/key-outages.js';
import { createSquadronsDatabase } from '../src/testing/database.js';

// The stretches without a fleet's company key, kept in Postgres so a restart forgets none (decision 0068).

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const OTHER_FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8zz';
const T0 = new Date('2026-10-31T10:00:00.000Z');
const T1 = new Date('2026-10-31T10:30:00.000Z');
const T2 = new Date('2026-10-31T11:00:00.000Z');

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createPrismaClient(await createSquadronsDatabase());
});

afterEach(async () => {
  await prisma.$disconnect();
});

describe('the stretches without a fleet’s key', () => {
  it('lists an outage that goes on, and one that ended, oldest first, after a restart', async () => {
    const outages = createPrismaKeyOutages(prisma);
    await outages.begin(FLEET, T0);
    await outages.end(FLEET, T1);
    await outages.begin(FLEET, T2);

    await expect(createPrismaKeyOutages(prisma).list(FLEET)).resolves.toEqual([
      { since: T0, until: T1 },
      { since: T2, until: null },
    ]);
  });

  it('keeps one outage going when it begins again', async () => {
    const outages = createPrismaKeyOutages(prisma);
    await outages.begin(FLEET, T0);
    await outages.begin(FLEET, T1);

    await expect(outages.list(FLEET)).resolves.toEqual([{ since: T0, until: null }]);
  });

  it('ends nothing when none goes on', async () => {
    const outages = createPrismaKeyOutages(prisma);
    await outages.begin(FLEET, T0);
    await outages.end(FLEET, T1);
    await outages.end(FLEET, T2);

    await expect(outages.list(FLEET)).resolves.toEqual([{ since: T0, until: T1 }]);
  });

  it('keeps the outages of two fleets apart', async () => {
    const outages = createPrismaKeyOutages(prisma);
    await outages.begin(FLEET, T0);
    await outages.begin(OTHER_FLEET, T1);
    await outages.end(FLEET, T2);

    await expect(outages.list(OTHER_FLEET)).resolves.toEqual([{ since: T1, until: null }]);
  });

  it('goes with the fleet when squadrons forgets it', async () => {
    const outages = createPrismaKeyOutages(prisma);
    await outages.begin(FLEET, T0);
    await outages.begin(OTHER_FLEET, T0);

    await createPrismaFleetForgetter(prisma).forget(FLEET);

    await expect(outages.list(FLEET)).resolves.toEqual([]);
    await expect(outages.list(OTHER_FLEET)).resolves.toEqual([{ since: T0, until: null }]);
  });
});
