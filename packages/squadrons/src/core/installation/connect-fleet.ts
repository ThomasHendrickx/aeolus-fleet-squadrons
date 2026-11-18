/** Installation hand-over: check service before replay and keep receipts only for successful existing connects. */
import type { FleetId, ShipId } from '@aeolus-fleet/common';

import type { Connect, ConnectRefusal } from '../management/connect.js';
import type { Clock } from '../shared/clock.js';
import { refuse, type DomainError } from '../shared/errors.js';
import { ok, type Result } from '../shared/result.js';
import type { InstallationRequests, RequestHasher } from './ports.js';
import { earlierAnswer } from './request-id.js';
import type { IsServed } from './served.js';

export type ConnectFleet = (input: { requestId: string; fleetId: FleetId; shipId: ShipId; secret: string }) => Promise<Result<{ isEnabled: true; isConnected: true }, ConnectRefusal | DomainError<'REQUEST_ID_USED' | 'OFF'>>>;

export function createConnectFleet(deps: { requests: InstallationRequests; hasher: RequestHasher; clock: Clock; isServed: IsServed; connect: Connect }): ConnectFleet {
  return async ({ requestId, fleetId, shipId, secret }) => {
    if (!(await deps.isServed(fleetId))) {
      return refuse('OFF', 'squadrons is off for this fleet');
    }
    const requestHash = deps.hasher.hash(`connect ${fleetId} ${shipId}`);
    const earlier = await earlierAnswer(deps.requests, { requestId, requestHash });
    if (earlier !== undefined) {
      return 'isOk' in earlier ? earlier : ok({ isEnabled: true, isConnected: true });
    }
    const connected = await deps.connect({ operatorFleetId: fleetId, shipId, secret });
    if (!connected.isOk) {
      return connected;
    }
    await deps.requests.record({ requestId, kind: 'connect', requestHash, fleetId, isEnabled: true, at: deps.clock.now() });
    return ok({ isEnabled: true, isConnected: true });
  };
}
