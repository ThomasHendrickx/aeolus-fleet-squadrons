import type { LabelValueId } from '@aeolus-fleet/common';
import { describe, expect, it } from 'vitest';

import { FLEET_ID } from '../../../test/support/management-fakes.js';
import { ok } from '../../core/shared/result.js';
import { createFleetTurns } from './fleet-turns.js';
import { createPrepareFormationInTurn } from './prepare-formation-in-turn.js';

const VALUE: LabelValueId = 'lbv_01m3tbfspe96yf1rnr4ank9f02';

describe('formation reach in the fleet turn', () => {
  it('waits for earlier work and refuses a fleet switched off while it waited', async () => {
    const turns = createFleetTurns();
    let finish = (): void => undefined;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    let isServed = true;
    let preparations = 0;
    const earlier = turns.take(FLEET_ID, async () => { await gate; isServed = false; });
    const prepare = createPrepareFormationInTurn({ turns, isServed: () => Promise.resolve(isServed), prepare: () => { preparations += 1; return Promise.resolve(ok(VALUE)); } });
    const pending = prepare(FLEET_ID);
    await Promise.resolve();
    expect(preparations).toBe(0);
    finish();
    await earlier;
    await expect(pending).resolves.toMatchObject({ isOk: false, error: { code: 'NOT_SERVED' } });
    expect(preparations).toBe(0);
  });

  it('prepares an enabled fleet in its turn', async () => {
    const prepare = createPrepareFormationInTurn({ turns: createFleetTurns(), isServed: () => Promise.resolve(true), prepare: () => Promise.resolve(ok(VALUE)) });
    await expect(prepare(FLEET_ID)).resolves.toEqual(ok(VALUE));
  });
});
