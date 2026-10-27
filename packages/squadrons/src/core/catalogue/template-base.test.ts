import { assert, describe, expect, it } from 'vitest';

import { assembleCatalogue } from './assemble-catalogue.js';
import type { TemplateVersion } from './catalogue.js';
import type { SourceFile } from './ports.js';

const OWN = 'github.com/tidewater-labs/squadron-templates';
const SKILLS = 'github.com/ThomasHendrickx/skills';
const AT = new Date('2026-10-27T08:00:00.000Z');
const KB = 1024;

function layer(tagged: { repository?: string; name: string; version: number; commit?: string }, content: unknown): SourceFile {
  const { repository = SKILLS, name, version, commit = `${name}-${String(version)}` } = tagged;
  return { repository, kind: 'template', name, version, file: `squadrons/templates/${name}.yaml`, commit, committedAt: AT, text: JSON.stringify(content), content };
}

/** A hash a reader can follow: what it hashes, in sha(...). */
function sha(text: string): string {
  return `sha(${text})`;
}

function catalogueOf(files: SourceFile[], options: { repositories?: string[]; fetchFailures?: ReadonlyMap<string, string>; buildRules?: number; kept?: readonly TemplateVersion[] } = {}) {
  const { repositories = [OWN, SKILLS], fetchFailures, buildRules, kept } = options;
  return assembleCatalogue({
    repositories,
    files,
    tags: [],
    hash: sha,
    ...(fetchFailures === undefined ? {} : { fetchFailures }),
    ...(buildRules === undefined ? {} : { buildRules }),
    ...(kept === undefined ? {} : { kept }),
  });
}

function reasonOf(files: SourceFile[], name: string): string | undefined {
  return catalogueOf(files).problems.find((problem) => problem.name === name)?.message;
}

const aeolusShip = layer(
  { name: 'aeolus-ship', version: 3 },
  {
    description: 'Any ship of an Aeolus fleet.',
    checkIn: '30m',
    launchNote: 'Crew it from the repository root.',
    charter: 'Report to {{lead}} over the fleet.',
    parameters: { lead: 'the ship you report to' },
    handoffs: { report: 'What was done' },
    scopes: ['notes:read'],
    crew: { harness: 'claude-code', options: { effort: 'high' } },
  },
);
const implementerContent = {
  base: { template: `${SKILLS}#aeolus-ship@3`, parameters: { lead: 'the flagship' } },
  description: 'Implements a slice.',
  charter: 'You implement in {{language}}.',
  parameters: { language: 'the language of the repository' },
  crew: { model: 'claude-sonnet-5-5', options: { verbosity: 'low' } },
};
const implementer = layer({ name: 'implementer', version: 2 }, implementerContent);
const typescriptImplementerContent = {
  base: { template: `${SKILLS}#implementer@2`, parameters: { language: 'TypeScript' } },
  description: 'Implements a slice in a TypeScript repository',
  crew: { model: 'claude-opus-5-5' },
  charter: 'Run npm run typecheck before every commit.',
};
const typescriptImplementer = layer({ repository: OWN, name: 'typescript-implementer', version: 1 }, typescriptImplementerContent);
const chain = [aeolusShip, implementer, typescriptImplementer];

function builtOf(files: SourceFile[], name: string) {
  return catalogueOf(files).templates.find((template) => template.name === name);
}

/** A chain of `length` templates, layer-1@1 to layer-<length>@1, each on the one before. */
function chainOf(length: number, charterOf: (number: number) => string = (number) => `Layer ${String(number)}.`): SourceFile[] {
  return Array.from({ length }, (_, index) => {
    const number = index + 1;
    const own = { description: `Layer ${String(number)}.`, charter: charterOf(number) };
    return layer(
      { name: `layer-${String(number)}`, version: 1 },
      number === 1 ? { ...own, checkIn: '1h' } : { ...own, base: { template: `${SKILLS}#layer-${String(number - 1)}@1` } },
    );
  });
}

describe('a template on a base', () => {
  it('is built from its chain, base-layer-0 first, into one full template', () => {
    expect(builtOf(chain, 'typescript-implementer')).toEqual({
      repository: OWN,
      name: 'typescript-implementer',
      version: 1,
      file: 'squadrons/templates/typescript-implementer.yaml',
      commit: 'typescript-implementer-1',
      committedAt: AT,
      description: 'Implements a slice in a TypeScript repository',
      checkInMinutes: 30,
      model: 'claude-opus-5-5',
      launchNote: 'Crew it from the repository root.',
      charter: 'Report to the flagship over the fleet.\n\nYou implement in TypeScript.\n\nRun npm run typecheck before every commit.',
      handoffs: [{ name: 'report', carries: 'What was done' }],
      crew: { harness: 'claude-code', options: { effort: 'high', verbosity: 'low' } },
      parameters: [],
      scopes: ['notes:read'],
      chain: [
        { repository: SKILLS, name: 'aeolus-ship', version: 3, commit: 'aeolus-ship-3' },
        { repository: SKILLS, name: 'implementer', version: 2, commit: 'implementer-2' },
        { repository: OWN, name: 'typescript-implementer', version: 1, commit: 'typescript-implementer-1' },
      ],
      origins: {
        charter: [
          { layer: 0, text: 'Report to the flagship over the fleet.' },
          { layer: 1, text: 'You implement in TypeScript.' },
          { layer: 2, text: 'Run npm run typecheck before every commit.' },
        ],
        fields: {
          description: 2,
          checkIn: 0,
          launchNote: 0,
          'crew.model': 2,
          'crew.harness': 0,
          'crew.options.effort': 0,
          'crew.options.verbosity': 1,
          'handoffs.report': 0,
          'scopes.notes:read': 0,
        },
        filled: [
          { name: 'lead', layer: 1 },
          { name: 'language', layer: 2 },
        ],
      },
    });
  });

  it("replaces its base's charter whole with base.replaceCharter", () => {
    const replacing = layer({ repository: OWN, name: 'quiet', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3`, replaceCharter: true }, description: 'Quiet.', charter: 'Say nothing.' });

    expect(builtOf([aeolusShip, replacing], 'quiet')?.charter).toBe('Say nothing.');
  });

  it('needs a charter of its own with base.replaceCharter', () => {
    const replacing = layer({ repository: OWN, name: 'quiet', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3`, replaceCharter: true }, description: 'Quiet.' });

    expect(reasonOf([aeolusShip, replacing], 'quiet')).toBe("charter is missing: expected the role's instructions as text, as base.replaceCharter replaces its base's");
  });

  it("takes its base's charter, check-in and launch note when it sets none, and needs only a description", () => {
    const plain = layer({ repository: OWN, name: 'plain', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3`, parameters: { lead: 'argo' } }, description: 'Plain.' });

    expect(builtOf([aeolusShip, plain], 'plain')).toMatchObject({ charter: 'Report to argo over the fleet.', checkInMinutes: 30, launchNote: 'Crew it from the repository root.' });
  });

  it('replaces the check-in and launch note its base sets with its own', () => {
    const own = layer({ repository: OWN, name: 'own', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3` }, description: 'Own.', checkIn: '2h', launchNote: 'Start in docs.' });

    expect(builtOf([aeolusShip, own], 'own')).toMatchObject({ checkInMinutes: 120, launchNote: 'Start in docs.' });
  });

  it('needs a description of its own', () => {
    const nameless = layer({ repository: OWN, name: 'nameless', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3` } });

    expect(reasonOf([aeolusShip, nameless], 'nameless')).toBe('description is missing: expected one line of text');
  });

  it('keeps a parameter its base leaves open, beside its own, and no longer one it fills', () => {
    const open = layer({ repository: OWN, name: 'open', version: 1 }, { base: { template: `${SKILLS}#implementer@2` }, description: 'Open.', charter: 'Work on {{area}}.', parameters: { area: 'the area' } });

    expect(builtOf([aeolusShip, implementer, open], 'open')?.parameters).toEqual([
      { name: 'language', description: 'the language of the repository' },
      { name: 'area', description: 'the area' },
    ]);
  });

  it('fills the values it gives into its own charter and first prompt too', () => {
    const filling = layer(
      { repository: OWN, name: 'filling', version: 1 },
      { base: { template: `${SKILLS}#aeolus-ship@3`, parameters: { lead: 'argo' } }, description: 'Filling.', charter: 'Ask {{lead}} first.', crew: { firstPrompt: 'Greet {{lead}}.' } },
    );

    expect(builtOf([aeolusShip, filling], 'filling')).toMatchObject({ charter: 'Report to argo over the fleet.\n\nAsk argo first.', crew: { firstPrompt: 'Greet argo.' } });
  });

  it("adds its scopes to its base's, one its base has kept once", () => {
    const scoped = layer({ repository: OWN, name: 'scoped', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3` }, description: 'Scoped.', scopes: ['notes:write', 'notes:read'] });

    expect(builtOf([aeolusShip, scoped], 'scoped')?.scopes).toEqual(['notes:read', 'notes:write']);
  });

  it("adds its hand-offs to its base's", () => {
    const handing = layer({ repository: OWN, name: 'handing', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3` }, description: 'Handing.', handoffs: { done: 'The branch' } });

    expect(builtOf([aeolusShip, handing], 'handing')?.handoffs).toEqual([
      { name: 'report', carries: 'What was done' },
      { name: 'done', carries: 'The branch' },
    ]);
  });

  it('is a template version like any other: another template builds on it, and a blueprint runs it', () => {
    const team = {
      repository: OWN,
      kind: 'blueprint' as const,
      name: 'team',
      version: 1,
      file: 'squadrons/blueprints/team.yaml',
      commit: 'team-1',
      committedAt: AT,
      text: 'description: A team.',
      content: { description: 'A team.', roles: { builder: { template: `${OWN}#typescript-implementer@1` } }, handoffs: { 'builder.report': 'flagship' } },
    };

    expect(catalogueOf([...chain, team]).blueprints.map((blueprint) => blueprint.name)).toEqual(['team']);
  });
});

describe('the rules of building', () => {
  it("refuses a value for a parameter its base already filled, naming those it leaves open", () => {
    const refilling = layer({ repository: OWN, name: 'refilling', version: 1 }, { base: { template: `${SKILLS}#implementer@2`, parameters: { lead: 'argo' } }, description: 'Refilling.' });

    expect(reasonOf([aeolusShip, implementer, refilling], 'refilling')).toBe('base.parameters.lead: lead is not a parameter its base leaves open; it leaves open language');
  });

  it('says a base leaves none open', () => {
    const refilling = layer({ repository: OWN, name: 'refilling', version: 1 }, { base: { template: `${OWN}#typescript-implementer@1`, parameters: { language: 'Go' } }, description: 'Refilling.' });

    expect(reasonOf([...chain, refilling], 'refilling')).toBe('base.parameters.language: language is not a parameter its base leaves open; it leaves none open');
  });

  it('refuses a parameter of its own named as one its base leaves open', () => {
    const declaring = layer({ repository: OWN, name: 'declaring', version: 1 }, { base: { template: `${SKILLS}#implementer@2` }, description: 'Declaring.', parameters: { language: 'again' } });

    expect(reasonOf([aeolusShip, implementer, declaring], 'declaring')).toBe('parameters.language is already a parameter of its base');
  });

  it('refuses a parameter of its own named as one filled below', () => {
    const declaring = layer({ repository: OWN, name: 'declaring', version: 1 }, { base: { template: `${SKILLS}#implementer@2` }, description: 'Declaring.', parameters: { lead: 'again' } });

    expect(reasonOf([aeolusShip, implementer, declaring], 'declaring')).toBe('parameters.lead is already a parameter of its base');
  });

  it('refuses a hand-off its base declares', () => {
    const handing = layer({ repository: OWN, name: 'handing', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3` }, description: 'Handing.', handoffs: { report: 'Again' } });

    expect(reasonOf([aeolusShip, handing], 'handing')).toBe('handoffs.report is already declared by its base');
  });

  it('refuses a placeholder that is no parameter of the template at its layer', () => {
    const using = layer({ repository: OWN, name: 'using', version: 1 }, { base: { template: `${SKILLS}#implementer@2` }, description: 'Using.', charter: 'Tell {{lead}}.' });

    expect(reasonOf([aeolusShip, implementer, using], 'using')).toBe('charter uses {{lead}}, which is neither a parameter the template declares nor one its base leaves open');
  });

  it('takes a value for its base of 1 KB, and refuses one byte more', () => {
    const filling = (value: string) => layer({ repository: OWN, name: 'filling', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3`, parameters: { lead: value } }, description: 'Filling.' });

    expect(builtOf([aeolusShip, filling('x'.repeat(KB))], 'filling')).toBeDefined();
    expect(reasonOf([aeolusShip, filling('x'.repeat(KB + 1))], 'filling')).toBe('base.parameters.lead must be at most 1 KB');
  });

  it('refuses a base reference that is not <repository>#<name>@<n>', () => {
    const wrong = layer({ repository: OWN, name: 'wrong', version: 1 }, { base: { template: 'aeolus-ship@latest' }, description: 'Wrong.' });

    expect(reasonOf([aeolusShip, wrong], 'wrong')).toBe('base.template must be <repository>#<name>@<n>');
  });
});

describe('how big', () => {
  it('builds a chain of 10 templates into the catalogue', () => {
    expect(builtOf(chainOf(10), 'layer-10')?.chain).toHaveLength(10);
  });

  it('leaves out the 11th of a chain of 11, saying a chain holds at most 10, and keeps every layer below it', () => {
    const { templates, problems } = catalogueOf(chainOf(11));

    expect(problems).toEqual([
      {
        repository: SKILLS,
        kind: 'template',
        name: 'layer-11',
        version: 1,
        message: 'layer-11@1 builds on 11 templates; a chain holds at most 10: layer-1@1, layer-2@1, layer-3@1, layer-4@1, layer-5@1, layer-6@1, layer-7@1, layer-8@1, layer-9@1, layer-10@1, layer-11@1',
      },
    ]);
    expect(templates).toHaveLength(10);
  });

  it('leaves out the top of three layers of 20 KB charters, 60 KB once built, and keeps the two below', () => {
    const { templates, problems } = catalogueOf(chainOf(3, () => 'x'.repeat(20 * KB)));

    expect(problems.map(({ name, message }) => `${name}: ${message}`)).toEqual(['layer-3: charter is 60.1 KB once built, over 48 KB']);
    expect(templates.map(({ name }) => name)).toEqual(['layer-1', 'layer-2']);
  });

  it('leaves out a template whose first prompt is over 8 KB once its base is filled', () => {
    const prompting = layer({ name: 'prompting', version: 1 }, { description: 'Prompting.', checkIn: '1h', charter: 'Go.', parameters: { long: 'a long value' }, crew: { firstPrompt: `${'x'.repeat(8000)}{{long}}` } });
    const filling = layer({ repository: OWN, name: 'filling', version: 1 }, { base: { template: `${SKILLS}#prompting@1`, parameters: { long: 'y'.repeat(KB) } }, description: 'Filling.' });

    expect(reasonOf([prompting, filling], 'filling')).toBe('crew.firstPrompt is 8.9 KB once built, over 8 KB');
  });

  it('leaves out a template with 21 scopes once built, its base having 15 and it 6 others', () => {
    const scopes = (from: number, count: number) => Array.from({ length: count }, (_, index) => `notes:action-${String(from + index)}`);
    const base = layer({ name: 'base', version: 1 }, { description: 'Base.', checkIn: '1h', charter: 'Go.', scopes: scopes(1, 15) });
    const more = layer({ repository: OWN, name: 'more', version: 1 }, { base: { template: `${SKILLS}#base@1` }, description: 'More.', scopes: scopes(16, 6) });

    expect(reasonOf([base, more], 'more')).toBe('scopes are 21 once built, over 20');
  });
});

describe('who may', () => {
  it("builds a template in the fleet's own repository on a base in another repository the fleet added", () => {
    expect(builtOf(chain, 'typescript-implementer')).toBeDefined();
  });

  it('leaves out a template whose base is in a repository the fleet has not added, saying which, and where to add it', () => {
    expect(catalogueOf([typescriptImplementer], { repositories: [OWN] }).problems[0]?.message).toBe(
      'typescript-implementer@1 cannot be included: its base github.com/ThomasHendrickx/skills#implementer@2 is in github.com/ThomasHendrickx/skills, which this fleet has not added. Add it under Settings, Repositories.',
    );
  });
});

describe('what when it fails', () => {
  it('leaves out a template whose base is not tagged, naming the reference, and every blueprint naming it', () => {
    const onMissing = layer({ name: 'implementer', version: 3 }, { base: { template: `${SKILLS}#aeolus-ship@4` }, description: 'Implements.' });
    const team = { ...layer({ name: 'team', version: 1 }, { description: 'A team.', roles: { builder: { template: `${SKILLS}#implementer@3` } }, handoffs: { 'builder.report': 'flagship' } }), kind: 'blueprint' as const };

    expect(catalogueOf([aeolusShip, onMissing, team]).problems.map(({ name, message }) => `${name}: ${message}`)).toEqual([
      `implementer: base.template: ${SKILLS} has no aeolus-ship@4, only aeolus-ship@3`,
      `team: roles.builder.template: ${SKILLS}#implementer@3 is left out itself, for its own reason`,
    ]);
  });

  it('names the fetch failure of a base repository the fleet added but could not read', () => {
    const fetchFailures = new Map([[SKILLS, 'GitHub answered 404 Not Found: no such repository, or a private one its token cannot read']]);

    expect(catalogueOf([typescriptImplementer], { fetchFailures }).problems[0]?.message).toBe(
      `base.template: ${SKILLS}#implementer@2 is in ${SKILLS}, which could not be read: GitHub answered 404 Not Found: no such repository, or a private one its token cannot read`,
    );
  });

  it('leaves out both templates of a loop, each naming the loop', () => {
    const a = layer({ name: 'a', version: 2 }, { base: { template: `${SKILLS}#b@1` }, description: 'A.' });
    const b = layer({ name: 'b', version: 1 }, { base: { template: `${SKILLS}#a@2` }, description: 'B.' });

    expect(catalogueOf([a, b]).problems.map(({ name, message }) => `${name}: ${message}`)).toEqual(['a: a@2 builds on b@1, which builds on a@2', 'b: b@1 builds on a@2, which builds on b@1']);
  });

  it('leaves out every template on an unreadable version, naming it and its reason', () => {
    const unreadable: SourceFile = { ...aeolusShip, content: undefined, parseError: 'Nested mappings are not allowed in compact mappings at line 2, column 10' };

    expect(catalogueOf([unreadable, implementer, typescriptImplementer]).problems.map(({ name, message }) => `${name}: ${message}`)).toEqual([
      'aeolus-ship: the template is no valid YAML: Nested mappings are not allowed in compact mappings at line 2, column 10',
      `implementer: base.template: ${SKILLS}#aeolus-ship@3 is left out: the template is no valid YAML: Nested mappings are not allowed in compact mappings at line 2, column 10`,
      `typescript-implementer: base.template: ${SKILLS}#implementer@2 is left out: base.template: ${SKILLS}#aeolus-ship@3 is left out: the template is no valid YAML: Nested mappings are not allowed in compact mappings at line 2, column 10`,
    ]);
  });
});

describe('the guarantees', () => {
  it('lets a fix in a base reach only a new version that names it', () => {
    const fixed = layer({ name: 'implementer', version: 3 }, { ...implementerContent, charter: 'You implement in {{language}}, with tests.' });
    const next = layer({ repository: OWN, name: 'typescript-implementer', version: 2 }, { ...typescriptImplementerContent, base: { template: `${SKILLS}#implementer@3`, parameters: { language: 'TypeScript' } } });
    const { templates } = catalogueOf([...chain, fixed, next]);
    const charterOf = (version: number) => templates.find((each) => each.name === 'typescript-implementer' && each.version === version)?.charter;

    expect(charterOf(1)).toBe('Report to the flagship over the fleet.\n\nYou implement in TypeScript.\n\nRun npm run typecheck before every commit.');
    expect(charterOf(2)).toBe('Report to the flagship over the fleet.\n\nYou implement in TypeScript, with tests.\n\nRun npm run typecheck before every commit.');
  });

  it('builds a template without a base as today, as a chain of one', () => {
    expect(builtOf(chain, 'aeolus-ship')?.chain).toEqual([{ repository: SKILLS, name: 'aeolus-ship', version: 3, commit: 'aeolus-ship-3' }]);
  });
});

describe('the hash of a built template', () => {
  const plain = layer({ repository: OWN, name: 'plain', version: 1 }, { base: { template: `${SKILLS}#aeolus-ship@3`, parameters: { lead: 'argo' } }, description: 'Plain.' });
  const hashOf = (files: SourceFile[], options: Parameters<typeof catalogueOf>[1] = {}) => catalogueOf(files, options).templates.find((template) => template.name === 'plain')?.hash;

  it("is the SHA-256 of the build rules number and its chain, base-layer-0 first: each layer's repository, name, version, commit and its file's SHA-256", () => {
    const chainText = [
      `{"repository":"${SKILLS}","name":"aeolus-ship","version":3,"commit":"aeolus-ship-3","file":"sha(${aeolusShip.text})"}`,
      `{"repository":"${OWN}","name":"plain","version":1,"commit":"plain-1","file":"sha(${plain.text})"}`,
    ];

    expect(hashOf([aeolusShip, plain])).toBe(`sha({"buildRules":1,"chain":[${chainText.join(',')}]})`);
  });

  it('builds one chain to the same hash and the same full template whenever it is read', () => {
    expect(catalogueOf([aeolusShip, plain]).templates).toEqual(catalogueOf([aeolusShip, plain]).templates);
  });

  it('builds a version whose tag was moved from its new commit to a new hash, with no warning', () => {
    const moved = { ...aeolusShip, commit: '3a7f210' };

    expect(hashOf([moved, plain])).not.toBe(hashOf([aeolusShip, plain]));
    expect(catalogueOf([moved, plain]).problems).toEqual([]);
  });

  it("builds anew to another hash once a file's text changes at its commit", () => {
    expect(hashOf([{ ...aeolusShip, text: `${aeolusShip.text} ` }, plain])).not.toBe(hashOf([aeolusShip, plain]));
  });

  it('builds anew to another hash under a raised build rules number', () => {
    expect(hashOf([aeolusShip, plain], { buildRules: 2 })).not.toBe(hashOf([aeolusShip, plain]));
  });

  it('keeps the hash of a version on its base when a new version of the base is tagged', () => {
    const next = layer({ name: 'aeolus-ship', version: 4 }, { description: 'Fixed.', checkIn: '30m', charter: 'Report to {{lead}}, briefly.', parameters: { lead: 'the lead' } });

    expect(hashOf([aeolusShip, next, plain])).toBe(hashOf([aeolusShip, plain]));
  });

  it('takes a built template kept by its hash rather than building it again', () => {
    const built = catalogueOf([aeolusShip, plain]).templates.find((template) => template.name === 'plain');
    assert(built !== undefined);
    const kept = { ...built, description: 'As kept.' };

    expect(catalogueOf([aeolusShip, plain], { kept: [kept] }).templates.find((template) => template.name === 'plain')).toEqual(kept);
  });
});
