import { reportChangesWithinMinutesSchema, setExpectationsInputSchema } from '@aeolus-fleet/common';
import { z } from 'zod';

/** A template supplies expectation values for a newly commissioned ship. */
export const templateExpectationsSchema = z.strictObject({
  reportChangesWithin: reportChangesWithinMinutesSchema.optional(),
  taskDoneBy: setExpectationsInputSchema.shape.taskDoneBy.unwrap().unwrap().optional(),
});

export type TemplateExpectations = z.infer<typeof templateExpectationsSchema>;
