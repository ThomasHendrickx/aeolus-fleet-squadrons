/**
 * Template bases (docs/squadrons.md, "Template bases"): a template names one
 * base template version and states only what differs, and building walks its
 * chain from base-layer-0, the template without a base, up to the version
 * itself, applying each layer over the full template below it. No build
 * language: a layer adds, replaces whole, or fills its base's parameters.
 * A chain holds at most 10 templates and never loops; the full template is
 * then held to every limit a template without a base is.
 */
import { FIRST_PROMPT_MAX_BYTES, SHIP_LABELS_MAX } from '@aeolus-fleet/common';

import { err, ok, type Result } from '../shared/result.js';
import { CHARTER_MAX_BYTES, TEMPLATE_SCOPES_MAX, type ChainLayer, type CrewDraft, type TemplateOrigins, type TemplateReference, type TemplateVersion } from './catalogue.js';
import { fillParameters } from './member-crew.js';
import type { SourceFile } from './ports.js';

/** The most labels a template gives its members: as many as a ship carries, but squadrons' own squadron=<id>. */
const TEMPLATE_LABELS_MAX = SHIP_LABELS_MAX - 1;

/** The most templates a chain holds, the template itself included (decision 5). */
export const CHAIN_MAX_TEMPLATES = 10;

/**
 * The build rules number, which every hash covers: raised whenever a rule
 * of building changes, so each version builds anew under the new rules
 * (decision 11).
 */
export const BUILD_RULES = 1;

const BYTES_PER_KB = 1024;
/** Tenths per whole: a size over a limit is shown to one decimal, rounded up. */
const TENTHS = 10;
/** What one layer's charter is set apart from the one below by. */
const CHARTER_SEPARATOR = '\n\n';

/** What a layer's file sets, whether it has a base or not. */
interface LayerFields {
  file: SourceFile;
  description: string;
  launchNote: string | undefined;
  /** Its `crew.model`, held apart as the pinned model. */
  model: string | undefined;
  handoffs: { name: string; carries: string }[];
  parameters: { name: string; description: string }[];
  crew: CrewDraft;
  scopes: string[];
  labels: { key: string; value: string }[];
}

/** A template's base: the version it names, the values it fills, and whether its charter replaces the base's. */
export interface Base {
  reference: TemplateReference;
  parameters: Readonly<Record<string, string>>;
  isCharterReplaced: boolean;
}

/** A template file as read: without a base it sets its check-in and charter, with one it may leave them to its base. */
export type TemplateLayer = (LayerFields & { base: null; checkInMinutes: number; charter: string }) | (LayerFields & { base: Base; checkInMinutes: number | undefined; charter: string | undefined });

export function referenceKey(reference: TemplateReference): string {
  return `${reference.repository}#${reference.name}@${String(reference.version)}`;
}

function shortKey(reference: Pick<TemplateReference, 'name' | 'version'>): string {
  return `${reference.name}@${String(reference.version)}`;
}

/** Why no file is tagged at a reference in a repository squadrons read: none of its name at any tag, or not that version. */
export function untaggedReason(reference: TemplateReference, tagged: readonly number[]): string {
  const { repository, name, version } = reference;
  if (tagged.length === 0) {
    return `${repository} has no template ${name} at any tag`;
  }
  const tags = tagged.toSorted((one, other) => one - other).map((each) => shortKey({ name, version: each }));
  return `${repository} has no ${shortKey({ name, version })}, only ${tags.join(', ')}`;
}

/** A `{{name}}` placeholder, filled with a parameter's value. */
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** The names a text's placeholders use that are not among the given ones: none when every one is. */
function undeclared(text: string | undefined, declared: ReadonlySet<string>): string[] {
  return [...(text ?? '').matchAll(PLACEHOLDER)].map(([, name = '']) => name).filter((name) => !declared.has(name));
}

function linkOf(file: SourceFile): ChainLayer {
  const { repository, name, version, commit } = file;
  return { repository, name, version, commit };
}

/** The fields a layer sets, by their path, each from the given layer. */
function fieldsSetBy(layer: TemplateLayer, index: number): Record<string, number> {
  const { model, crew } = layer;
  const paths = [
    'description',
    ...(layer.checkInMinutes === undefined ? [] : ['checkIn']),
    ...(layer.launchNote === undefined ? [] : ['launchNote']),
    ...(model === undefined ? [] : ['crew.model']),
    ...(['harness', 'workspace', 'firstPrompt', 'machineLabels'] as const).filter((field) => crew[field] !== undefined).map((field) => `crew.${field}`),
    ...Object.keys(crew.options ?? {}).map((option) => `crew.options.${option}`),
    ...layer.handoffs.map((handoff) => `handoffs.${handoff.name}`),
    ...layer.scopes.map((scope) => `scopes.${scope}`),
    ...layer.labels.map((label) => `labels.${label.key}`),
    ...layer.parameters.map((parameter) => `parameters.${parameter.name}`),
  ];
  return Object.fromEntries(paths.map((path) => [path, index]));
}

/** A template without a base: its own placeholders must be its own parameters, as for any template. */
function rootOf(layer: TemplateLayer & { base: null }): Result<TemplateVersion, string> {
  const declared = new Set(layer.parameters.map((parameter) => parameter.name));
  for (const [field, used] of [
    ['charter', layer.charter],
    ['crew.firstPrompt', layer.crew.firstPrompt],
  ] as const) {
    const [unknown] = undeclared(used, declared);
    if (unknown !== undefined) {
      return err(`${field} uses {{${unknown}}}, a parameter the template does not declare under parameters`);
    }
  }
  const { repository, name, version, file, commit, committedAt } = layer.file;
  return ok({
    repository,
    name,
    version,
    file,
    commit,
    committedAt,
    description: layer.description,
    checkInMinutes: layer.checkInMinutes,
    model: layer.model ?? null,
    launchNote: layer.launchNote ?? null,
    charter: layer.charter,
    handoffs: layer.handoffs,
    crew: layer.crew,
    parameters: layer.parameters,
    scopes: layer.scopes,
    labels: layer.labels,
    hash: null,
    chain: [linkOf(layer.file)],
    origins: { charter: [{ layer: 0, text: layer.charter }], fields: fieldsSetBy(layer, 0), filled: [] },
  });
}

/** Why a layer breaks a rule of building over the template below it; undefined when it keeps them all. */
function ruleBroken(below: TemplateVersion, layer: TemplateLayer & { base: Base }): string | undefined {
  const open = below.parameters.map((parameter) => parameter.name);
  const unopened = Object.keys(layer.base.parameters).find((name) => !open.includes(name));
  if (unopened !== undefined) {
    return `base.parameters.${unopened}: ${unopened} is not a parameter its base leaves open; ${open.length === 0 ? 'it leaves none open' : `it leaves open ${open.join(', ')}`}`;
  }
  const taken = layer.parameters.find(({ name }) => open.includes(name) || below.origins.filled.some((filled) => filled.name === name));
  if (taken !== undefined) {
    return `parameters.${taken.name} is already a parameter of its base`;
  }
  const usable = new Set([...open, ...layer.parameters.map((parameter) => parameter.name)]);
  for (const [field, used] of [
    ['charter', layer.charter],
    ['crew.firstPrompt', layer.crew.firstPrompt],
  ] as const) {
    const [unknown] = undeclared(used, usable);
    if (unknown !== undefined) {
      return `${field} uses {{${unknown}}}, which is neither a parameter the template declares nor one its base leaves open`;
    }
  }
  const relabelled = layer.labels.find((label) => below.labels.some((each) => each.key === label.key && each.value !== label.value));
  const was = below.labels.find((each) => each.key === relabelled?.key);
  if (relabelled !== undefined && was !== undefined) {
    return `labels.${relabelled.key} is ${was.key}=${was.value} in its base: a template adds labels, and never changes one`;
  }
  const declaredBelow = layer.handoffs.find((handoff) => below.handoffs.some((each) => each.name === handoff.name));
  if (declaredBelow !== undefined) {
    return `handoffs.${declaredBelow.name} is already declared by its base`;
  }
  return undefined;
}

/** A layer applied over the full template below it, by the rules of building. */
function buildOn(below: TemplateVersion, layer: TemplateLayer & { base: Base }): Result<TemplateVersion, string> {
  const broken = ruleBroken(below, layer);
  if (broken !== undefined) {
    return err(broken);
  }
  const index = below.chain.length;
  const values = layer.base.parameters;
  const fill = (text: string): string => fillParameters(text, values);
  const own = layer.charter === undefined ? [] : [{ layer: index, text: layer.charter }];
  const charter = [...(layer.base.isCharterReplaced ? [] : below.origins.charter), ...own].map((part) => ({ ...part, text: fill(part.text) }));

  const options = below.crew.options === undefined && layer.crew.options === undefined ? {} : { options: { ...below.crew.options, ...layer.crew.options } };
  const firstPrompt = layer.crew.firstPrompt ?? below.crew.firstPrompt;
  const crew: CrewDraft = { ...below.crew, ...layer.crew, ...options, ...(firstPrompt === undefined ? {} : { firstPrompt: fill(firstPrompt) }) };

  const filled = Object.keys(values).map((name) => ({ name, layer: index }));
  const fields = Object.fromEntries(
    Object.entries({ ...fieldsSetBy(layer, index), ...below.origins.fields, ...fieldsReplacedBy(layer, index) }).filter(([path]) => !filled.some(({ name }) => path === `parameters.${name}`)),
  );
  const origins: TemplateOrigins = { charter, fields, filled: [...below.origins.filled, ...filled] };

  const { repository, name, version, file, commit, committedAt } = layer.file;
  return ok({
    repository,
    name,
    version,
    file,
    commit,
    committedAt,
    description: layer.description,
    checkInMinutes: layer.checkInMinutes ?? below.checkInMinutes,
    model: layer.model ?? below.model,
    launchNote: layer.launchNote ?? below.launchNote,
    charter: charter.map((part) => part.text).join(CHARTER_SEPARATOR),
    handoffs: [...below.handoffs, ...layer.handoffs],
    crew,
    parameters: [...below.parameters.filter((parameter) => !(parameter.name in values)), ...layer.parameters],
    scopes: [...new Set([...below.scopes, ...layer.scopes])],
    labels: [...below.labels, ...layer.labels.filter((label) => !below.labels.some((each) => each.key === label.key))],
    hash: null,
    chain: [...below.chain, linkOf(layer.file)],
    origins,
  });
}

/**
 * The fields a layer sets that replace the one below: every field it sets
 * but a scope or label its base already has, which is kept once, from below.
 */
function fieldsReplacedBy(layer: TemplateLayer, index: number): Record<string, number> {
  return Object.fromEntries(Object.entries(fieldsSetBy(layer, index)).filter(([path]) => !path.startsWith('scopes.') && !path.startsWith('labels.')));
}

/** A size in KB to one decimal, rounded up, so a size over a limit never reads as the limit. */
function kbOf(bytes: number): string {
  return String(Math.ceil((bytes * TENTHS) / BYTES_PER_KB) / TENTHS);
}

/** Which limit a full template breaks once built, with its size; undefined when it keeps them all. */
function overLimit(template: TemplateVersion): string | undefined {
  const utf8 = new TextEncoder();
  const charterBytes = utf8.encode(template.charter).byteLength;
  if (charterBytes > CHARTER_MAX_BYTES) {
    return `charter is ${kbOf(charterBytes)} KB once built, over ${String(CHARTER_MAX_BYTES / BYTES_PER_KB)} KB`;
  }
  const promptBytes = utf8.encode(template.crew.firstPrompt ?? '').byteLength;
  if (promptBytes > FIRST_PROMPT_MAX_BYTES) {
    return `crew.firstPrompt is ${kbOf(promptBytes)} KB once built, over ${String(FIRST_PROMPT_MAX_BYTES / BYTES_PER_KB)} KB`;
  }
  if (template.scopes.length > TEMPLATE_SCOPES_MAX) {
    return `scopes are ${String(template.scopes.length)} once built, over ${String(TEMPLATE_SCOPES_MAX)}`;
  }
  if (template.labels.length > TEMPLATE_LABELS_MAX) {
    return `labels are ${String(template.labels.length)} once built, over ${String(TEMPLATE_LABELS_MAX)}: a member carries at most ${String(SHIP_LABELS_MAX)} labels, squadron among them`;
  }
  return undefined;
}

/** What building every template version of a catalogue needs. */
export interface ToBuild {
  /** Every template file read, by its reference key, each as its layer or why it is not one. */
  layers: ReadonlyMap<string, { file: SourceFile; layer: Result<TemplateLayer, string> }>;
  /** Every version a template file is tagged at, by `<repository>#<name>`. */
  tagged: ReadonlyMap<string, readonly number[]>;
  /** The repositories the fleet added, by name. */
  repositories: ReadonlySet<string>;
  /** Why a repository could not be read at its last fetch, by its name. */
  fetchFailures: ReadonlyMap<string, string>;
  /** A text's SHA-256, in hex. */
  hash: (text: string) => string;
  buildRules: number;
  /** Templates built before, by their hash: taken instead of building them again. */
  kept: ReadonlyMap<string, TemplateVersion>;
}

/** The files of a version's chain, base-layer-0 first: undefined while a layer is missing, is no layer, or the chain loops or runs over 10. */
function chainFilesOf(key: string, layers: ToBuild['layers']): SourceFile[] | undefined {
  const files: SourceFile[] = [];
  let next: string | undefined = key;
  while (next !== undefined) {
    const entry = layers.get(next);
    if (entry === undefined || !entry.layer.isOk || files.length === CHAIN_MAX_TEMPLATES) {
      return undefined;
    }
    files.unshift(entry.file);
    next = baseKeyOf(entry);
  }
  return files;
}

/** The hash of a chain under a build rules number: one chain, one hash, one built template. */
function hashOfChain(files: readonly SourceFile[], input: Pick<ToBuild, 'hash' | 'buildRules'>): string {
  const chain = files.map((file) => ({ ...linkOf(file), file: input.hash(file.text) }));
  return input.hash(JSON.stringify({ buildRules: input.buildRules, chain }));
}

/** The hash of every version whose chain can be walked, by its reference key, so what was built before can be looked up first. */
export function chainHashes(input: Pick<ToBuild, 'layers' | 'hash' | 'buildRules'>): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const key of input.layers.keys()) {
    const files = chainFilesOf(key, input.layers);
    if (files !== undefined) {
      hashes.set(key, hashOfChain(files, input));
    }
  }
  return hashes;
}

/** The base each layer names, by key: none for one without a base or that is no layer. */
function baseKeyOf(entry: { layer: Result<TemplateLayer, string> } | undefined): string | undefined {
  return entry?.layer.isOk === true && entry.layer.value.base !== null ? referenceKey(entry.layer.value.base.reference) : undefined;
}

/** The loop a version is part of, itself first and last; undefined when its chain does not come back to it. */
function loopOf(key: string, layers: ToBuild['layers']): string[] | undefined {
  const path = [key];
  let next = baseKeyOf(layers.get(key));
  while (next !== undefined && layers.has(next) && path.length <= layers.size) {
    path.push(next);
    if (next === key) {
      return path;
    }
    next = baseKeyOf(layers.get(next));
  }
  return undefined;
}

/** Why a base reference finds no layer: its repository not added or not read, or nothing tagged at it. */
function baseMissingReason(layer: { file: SourceFile; reference: TemplateReference }, input: ToBuild): string {
  const { file, reference } = layer;
  const { repository } = reference;
  if (!input.repositories.has(repository)) {
    const named = [...input.repositories].find((each) => each.toLowerCase() === repository.toLowerCase());
    return named === undefined
      ? `${shortKey(file)} cannot be included: its base ${referenceKey(reference)} is in ${repository}, which this fleet has not added. Add it under Settings, Repositories.`
      : `base.template: squadrons knows no repository ${repository}; it knows ${named}, and a reference must match its name exactly, letter case too`;
  }
  const failure = input.fetchFailures.get(repository);
  if (failure !== undefined) {
    return `base.template: ${referenceKey(reference)} is in ${repository}, which could not be read: ${failure}`;
  }
  return `base.template: ${untaggedReason(reference, input.tagged.get(`${repository}#${reference.name}`) ?? [])}`;
}

/**
 * Every template version built, by its reference key, or why it is left
 * out: its own file, its base missing or left out, a loop, a chain over 10,
 * a rule of building broken, or a limit broken once built.
 */
export function buildTemplates(input: ToBuild): Map<string, Result<TemplateVersion, string>> {
  const built = new Map<string, Result<TemplateVersion, string>>();
  const hashes = chainHashes(input);
  const build = (key: string): Result<TemplateVersion, string> => {
    const known = built.get(key);
    if (known !== undefined) {
      return known;
    }
    const hash = hashes.get(key);
    const kept = hash === undefined ? undefined : input.kept.get(hash);
    const result = kept === undefined ? buildOne(key) : ok(kept);
    const hashed = result.isOk && hash !== undefined ? ok({ ...result.value, hash }) : result;
    built.set(key, hashed);
    return hashed;
  };
  const buildOne = (key: string): Result<TemplateVersion, string> => {
    const entry = input.layers.get(key);
    if (entry === undefined) {
      return err(`${key} is no template`);
    }
    const { file, layer } = entry;
    if (!layer.isOk) {
      return layer;
    }
    const top = layer.value;
    if (top.base === null) {
      const root = rootOf({ ...top, base: null });
      const over = root.isOk ? overLimit(root.value) : undefined;
      return over === undefined ? root : err(over);
    }
    const loop = loopOf(key, input.layers);
    if (loop !== undefined) {
      const names = loop.map((each) => {
        const looped = input.layers.get(each)?.file;
        return looped === undefined ? each : shortKey(looped);
      });
      return err(`${names[0] ?? key} builds on ${names.slice(1).join(', which builds on ')}`);
    }
    const baseKey = referenceKey(top.base.reference);
    if (!input.layers.has(baseKey)) {
      return err(baseMissingReason({ file, reference: top.base.reference }, input));
    }
    const below = build(baseKey);
    if (!below.isOk) {
      return err(`base.template: ${baseKey} is left out: ${below.error}`);
    }
    const chain = [...below.value.chain, linkOf(file)];
    if (chain.length > CHAIN_MAX_TEMPLATES) {
      return err(`${shortKey(file)} builds on ${String(chain.length)} templates; a chain holds at most ${String(CHAIN_MAX_TEMPLATES)}: ${chain.map(shortKey).join(', ')}`);
    }
    const result = buildOn(below.value, { ...top, base: top.base });
    const over = result.isOk ? overLimit(result.value) : undefined;
    return over === undefined ? result : err(over);
  };
  for (const key of input.layers.keys()) {
    build(key);
  }
  return built;
}
