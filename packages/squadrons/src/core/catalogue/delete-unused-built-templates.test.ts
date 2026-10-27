import type { FleetId } from '@aeolus-fleet/common';
import { describe, expect, it } from 'vitest';

import { memoryBuiltTemplates } from '../../../test/support/memory-catalogue.js';
import { templateOfOne } from '../../../test/support/template-version.js';
import { createDeleteUnusedBuiltTemplates } from './delete-unused-built-templates.js';

const FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8sv';
const OTHER_FLEET: FleetId = 'flt_01m3tb1zgr5h2ffee12xnch8zz';
const NOW = new Date('2026-11-30T12:00:00.000Z');
const THIRTY_DAYS_AGO = new Date('2026-10-31T12:00:00.000Z');
const LONGER_AGO = new Date('2026-10-31T11:59:59.999Z');

function aBuiltTemplate(name: string) {
  return templateOfOne({ repository: 'github.com/acme/templates', name, version: 1, file: `templates/${name}.yaml`, commit: `c-${name}`, committedAt: NOW, description: 'Builds.', checkInMinutes: 30, model: null, launchNote: null, charter: 'You build.', handoffs: [], crew: {}, parameters: [], scopes: [] });
}

describe("deleting a fleet's unused built templates", () => {
  it('deletes those unused for more than 30 days, keeps one last used 30 days ago, and every other fleet\'s', async () => {
    const built = memoryBuiltTemplates();
    await built.use(FLEET, { templates: [aBuiltTemplate('stale')], at: LONGER_AGO });
    await built.use(FLEET, { templates: [aBuiltTemplate('kept')], at: THIRTY_DAYS_AGO });
    await built.use(OTHER_FLEET, { templates: [aBuiltTemplate('stale')], at: LONGER_AGO });

    await expect(createDeleteUnusedBuiltTemplates({ built, clock: { now: () => NOW } })(FLEET)).resolves.toBe(1);

    expect(built.held.map(({ fleetId, template }) => `${fleetId} ${template.name}`)).toEqual([`${FLEET} kept`, `${OTHER_FLEET} stale`]);
  });
});
