import { setExpectationsInputSchema } from '@aeolus-fleet/common';

/** The expectations a template can set, before it has a ship to set them on. */
export const templateExpectationsSchema = setExpectationsInputSchema.omit({ shipId: true }).strict();
