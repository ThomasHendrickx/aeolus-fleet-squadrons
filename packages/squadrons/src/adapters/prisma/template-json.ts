/**
 * A template version as squadrons keeps it in JSON: in a squadron's snapshot
 * and as a built template. What older rows lack is read with its default.
 */
import { trierarchWorkspaceSchema } from '@aeolus-fleet/common';
import { z } from 'zod';

import type { CrewDraft, TemplateVersion } from '../../core/catalogue/catalogue.js';

// Snapshots stored before squadron files had crew settings (#343) have none.
export const crew: z.ZodType<CrewDraft> = z
  .object({
    harness: z.string(),
    workspace: trierarchWorkspaceSchema,
    firstPrompt: z.string(),
    options: z.record(z.string(), z.json()),
    machineLabels: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .partial()
  .default({});
export const templateSchema: z.ZodType<TemplateVersion> = z
  .object({
    repository: z.string(),
    name: z.string(),
    version: z.number(),
    // Snapshots stored before versions kept their file have none.
    file: z.string().default(''),
    commit: z.string(),
    committedAt: z.coerce.date(),
    description: z.string(),
    checkInMinutes: z.number(),
    model: z.string().nullable(),
    launchNote: z.string().nullable(),
    charter: z.string(),
    handoffs: z.array(z.object({ name: z.string(), carries: z.string() })),
    crew,
    parameters: z.array(z.object({ name: z.string(), description: z.string() })).default([]),
    // Snapshots stored before templates named scopes grant none.
    scopes: z.array(z.string()).default([]),
    // Snapshots stored before templates gave labels give none.
    labels: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
    // Snapshots stored before template bases have no hash, chain or origins: each is read as a chain of one, its own version, below.
    hash: z.string().nullable().default(null),
    chain: z.array(z.object({ repository: z.string(), name: z.string(), version: z.number(), commit: z.string() })).optional(),
    origins: z
      .object({
        charter: z.array(z.object({ layer: z.number(), text: z.string() })),
        fields: z.record(z.string(), z.number()),
        filled: z.array(z.object({ name: z.string(), layer: z.number() })),
      })
      .optional(),
  })
  .transform(({ chain, origins, ...template }) => ({
    ...template,
    chain: chain ?? [{ repository: template.repository, name: template.name, version: template.version, commit: template.commit }],
    origins: origins ?? { charter: [{ layer: 0, text: template.charter }], fields: {}, filled: [] },
  }));
