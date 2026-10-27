import type { TemplateVersion } from '../../src/core/catalogue/catalogue.js';

/** A template version without a base, as the catalogue builds it: a chain of one, every part from its own version. */
export function templateOfOne(template: Omit<TemplateVersion, 'hash' | 'chain' | 'origins' | 'labels'> & { labels?: TemplateVersion['labels'] }): TemplateVersion {
  const { repository, name, version, commit, charter } = template;
  return { labels: [], ...template, hash: `${name}@${String(version)}-hash`, chain: [{ repository, name, version, commit }], origins: { charter: [{ layer: 0, text: charter }], fields: {}, filled: [] } };
}
