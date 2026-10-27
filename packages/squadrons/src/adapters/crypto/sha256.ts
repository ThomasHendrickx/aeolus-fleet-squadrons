import { createHash } from 'node:crypto';

/** A text's SHA-256, in hex: what a built template's hash is made of. */
export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
