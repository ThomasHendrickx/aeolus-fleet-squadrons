/** A template or blueprint file in git: which one, at which version (its tag `<name>@<n>`), and what it holds. */
export interface SourceFile {
  /** The repository's name, as blueprints reference it: `github.com/<owner>/<repo>`. */
  repository: string;
  kind: 'template' | 'blueprint';
  name: string;
  version: number;
  /** Its path within its repository at that commit: `.aeolus/squadrons/templates/tester.yaml`. */
  file: string;
  /** The commit the tag points at. */
  commit: string;
  committedAt: Date;
  /** The YAML as read, which a built template's hash covers. */
  text: string;
  /** The YAML, parsed; whatever it holds is checked here. */
  content: unknown;
  /** Why the YAML could not be parsed, when it could not. */
  parseError?: string;
}

/**
 * A tag of the form `<name>@<n>` at which no file was read: its name is not
 * lowercase, or its commit holds no file of that name. Other tags, such as
 * `v1.0.0`, are no version tags and never listed.
 */
export interface UnreadTag {
  /** The repository's name, as blueprints reference it. */
  repository: string;
  /** The tag's name: `tester@3`. */
  tag: string;
  /** The folder its files would be in: `.aeolus/squadrons`. */
  path: string;
}

import type { FleetId } from '@aeolus-fleet/common';

import type { Catalogue, TemplateVersion } from './catalogue.js';
import type { TemplateRepository } from './template-repository.js';

/** A repository to read: what reading it needs, and the fleet whose it is. */
export type RepositoryToRead = Pick<TemplateRepository, 'fleetId' | 'name' | 'url' | 'path' | 'token'>;

/**
 * Outbound port: the template and blueprint versions of the given
 * repositories (docs/squadrons.md, "Files in git"), and the version tags at
 * which no file was read. A repository `fetch`
 * picks is fetched first, and answers whether that worked; every other is
 * read from what it last fetched, and holds nothing before its first fetch.
 * What one fleet fetched is never read for another.
 */
export interface RepositoryReader {
  read(
    repositories: readonly RepositoryToRead[],
    options: { fetch: (name: string) => boolean },
  ): Promise<{ files: SourceFile[]; tags: UnreadTag[]; fetched: { name: string; error: string | null }[] }>;
  /** Deletes what was fetched of a repository: read again, it holds nothing before its next fetch. */
  forget(repository: Pick<RepositoryToRead, 'fleetId' | 'name' | 'url'>): Promise<void>;
}

/** Outbound port: the template repositories the operator set, in squadrons' own database, within one fleet. */
export interface RepositoryStore {
  /** The fleet's repositories, oldest first. */
  list(fleetId: FleetId): Promise<TemplateRepository[]>;
  /** Stores a repository; `taken` when the fleet has one of that name already. */
  add(repository: TemplateRepository): Promise<'added' | 'taken'>;
  /** Forgets a repository; false when there was none of that name. */
  remove(fleetId: FleetId, name: string): Promise<boolean>;
  /** Records a repository's last fetch: when, and why it failed (null when it worked). */
  recordFetch(fleetId: FleetId, fetch: { name: string; at: Date; error: string | null }): Promise<void>;
}

/**
 * Outbound port: the templates built for a fleet, each by its hash
 * (docs/squadrons.md, "Built once"), with when it was built and last used.
 * A fleet never finds another fleet's, so a base read with one fleet's token
 * never reaches another.
 */
export interface BuiltTemplateStore {
  /** The fleet's built templates of the given hashes; a hash it does not keep finds none. */
  find(fleetId: FleetId, hashes: readonly string[]): Promise<TemplateVersion[]>;
  /**
   * Keeps each built template the fleet does not keep yet, built at the time
   * of the use, and sets the last use of each to it. One hash is one built template:
   * one kept already, or kept by another use at once, stays as it is.
   */
  use(fleetId: FleetId, use: { templates: readonly TemplateVersion[]; at: Date }): Promise<void>;
  /** Deletes the fleet's built templates last used before the given time; answers how many. */
  deleteUnusedSince(fleetId: FleetId, before: Date): Promise<number>;
}

/** Outbound port: the catalogue squadrons serves each fleet, built at each refresh of that fleet; empty for a fleet not refreshed. */
export interface CatalogueHolder {
  get(fleetId: FleetId): Catalogue;
  set(fleetId: FleetId, catalogue: Catalogue): void;
}
