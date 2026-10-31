import { createServer, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createFleetConsoleSessions } from './console-sessions.js';

const FLEET = 'flt_01m3tb1zgr5h2ffee12xnch8sv';

let server: Server | undefined;

async function fleetAnswering(scopes: string[]): Promise<string> {
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ result: { data: { fleetId: FLEET, fleetName: 'acme', expiresAt: '2030-01-01T00:00:00.000Z', kind: 'operator', scopes, featureFlags: [] } } }),
    );
  });
  const listening = server;
  await new Promise<void>((resolve) => {
    listening.listen(0, '127.0.0.1', resolve);
  });
  const address = listening.address();
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
}

afterEach(async () => {
  const closing = server;
  await new Promise<void>((resolve) => {
    if (closing === undefined) {
      resolve();
    } else {
      closing.close(() => {
        resolve();
      });
    }
  });
  server = undefined;
});

describe('the console session at the fleet', () => {
  it('carries a scope a plugin declared beside the core ones', async () => {
    const sessions = createFleetConsoleSessions(await fleetAnswering(['fleet:read', 'trierarch:join']));

    await expect(sessions.check('aeolus_session=ours')).resolves.toEqual({
      isOk: true,
      value: { fleetId: FLEET, kind: 'operator', scopes: ['fleet:read', 'trierarch:join'] },
    });
  });
});
