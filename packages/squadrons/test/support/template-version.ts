import type { TemplateVersion } from '../../src/core/catalogue/catalogue.js';

/** A template version without a base, as the catalogue builds it: a chain of one, every part from its own version. */
export function templateOfOne(template: Omit<TemplateVersion, 'chain' | 'origins'>): TemplateVersion {
  const { repository, name, version, commit, charter } = template;
  return { ...template, chain: [{ repository, name, version, commit }], origins: { charter: [{ layer: 0, text: charter }], fields: {}, filled: [] } };
}
