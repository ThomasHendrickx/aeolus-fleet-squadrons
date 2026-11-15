/** The REST refusal body shared by the fleet door and wake stream. */
import { z } from 'zod';

export const refusalSchema = z.object({ code: z.string(), message: z.string() });
