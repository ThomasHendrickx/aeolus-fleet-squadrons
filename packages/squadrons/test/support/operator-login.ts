import { argon2idPasswordHasher, OPERATOR, type PrismaClient } from '@aeolus-fleet/core/testing';

/**
 * Gives argo of the fleet the test operator's email and password, so a test
 * can sign in to its console. Core 0.29 founds a fleet with no login: argo
 * sets one in Settings, signed in by a link, which a test cannot follow.
 */
export async function giveOperatorLogin(fleetDatabase: PrismaClient, fleetId: string): Promise<void> {
  await fleetDatabase.operator.update({ where: { fleetId }, data: { email: OPERATOR.email, passwordHash: await argon2idPasswordHasher.hash(OPERATOR.password) } });
}
