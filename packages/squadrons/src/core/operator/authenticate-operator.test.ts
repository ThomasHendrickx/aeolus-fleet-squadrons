import { SCOPES, type FleetId } from '@aeolus-fleet/common';
import { describe, expect, it } from 'vitest';

import { err, ok } from '../shared/result.js';
import { createAuthenticateOperator } from './authenticate-operator.js';
import type { ConsoleSessions } from './ports.js';

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const OTHER_FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sw';
const OPERATOR_SCOPES = [...SCOPES];

const sessions: ConsoleSessions = {
  check: (cookie) =>
    Promise.resolve(
      cookie === 'aeolus_session=ours'
        ? ok({ fleetId: FLEET, kind: 'operator', scopes: OPERATOR_SCOPES })
        : cookie === 'aeolus_session=theirs'
          ? ok({ fleetId: OTHER_FLEET, kind: 'operator', scopes: OPERATOR_SCOPES })
          : cookie === 'aeolus_session=viewer'
            ? ok({ fleetId: FLEET, kind: 'viewer', scopes: ['fleet:read'] })
            : cookie === 'aeolus_session=plugin'
              ? ok({ fleetId: FLEET, kind: 'operator', scopes: ['fleet:read', 'trierarch:join'] })
            : cookie === 'aeolus_session=account'
              ? ok({ fleetId: FLEET, kind: 'account', scopes: OPERATOR_SCOPES })
              : cookie === 'aeolus_session=account-reader'
                ? ok({ fleetId: FLEET, kind: 'account', scopes: ['fleet:read'] })
              : err({ code: 'UNAUTHORIZED', message: 'No signed-in console session' }),
    ),
};

describe('the operator', () => {
  it.each([
    { label: 'our fleet', cookie: 'aeolus_session=ours', fleetId: FLEET },
    { label: 'another fleet on the same server', cookie: 'aeolus_session=theirs', fleetId: OTHER_FLEET },
  ])('is the signed-in console session of $label: squadrons serves every fleet at its FLEET_URL, each as its own', async ({ cookie, fleetId }) => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate(cookie)).resolves.toEqual({ isOk: true, value: { fleetId, scopes: OPERATOR_SCOPES } });
  });

  it("is a viewer session too, with the viewer ship's scopes, so squadrons serves it reads only (decision 0022)", async () => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate('aeolus_session=viewer')).resolves.toEqual({ isOk: true, value: { fleetId: FLEET, scopes: ['fleet:read'] } });
  });

  it('keeps a scope a plugin declared, beside the core ones, so a session holding it is not dropped or refused', async () => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate('aeolus_session=plugin')).resolves.toEqual({
      isOk: true,
      value: { fleetId: FLEET, scopes: ['fleet:read', 'trierarch:join'] },
    });
  });

  it('is an account session too, with the scopes the fleet answers for it, as for an operator session with those scopes', async () => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate('aeolus_session=account')).resolves.toEqual({ isOk: true, value: { fleetId: FLEET, scopes: OPERATOR_SCOPES } });
  });

  it('keeps an account session to the scopes the fleet answers, so a call it lacks a scope for is refused as for a viewer session', async () => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate('aeolus_session=account-reader')).resolves.toEqual({ isOk: true, value: { fleetId: FLEET, scopes: ['fleet:read'] } });
  });

  it.each([
    ['no cookie', undefined],
    ['a cookie of no signed-in session', 'aeolus_session=stale'],
  ])('is refused for %s', async (_label, cookie) => {
    const authenticate = createAuthenticateOperator({ sessions });

    await expect(authenticate(cookie)).resolves.toMatchObject({ isOk: false, error: { kind: 'NOT_THE_OPERATOR' } });
  });
});
