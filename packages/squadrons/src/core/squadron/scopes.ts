/** The plugin namespace squadrons declares and enforces itself (decisions 0017 and 0046). */
export const SQUADRONS_NAMESPACE = 'squadrons';

/** The scopes squadrons declares in its namespace, each with its one-line description. */
export const SQUADRONS_SCOPES = [
  { scope: 'squadrons:form', description: 'Form a squadron from a blueprint by message to squadrons, and stand it down' },
  { scope: 'squadrons:scale', description: 'Add and remove members of a squadron it formed' },
] as const;

/**
 * Whether squadrons may grant a scope at commission on behalf of the asking
 * ship (decision 0046): a scope that ship holds, or one of squadrons' own namespace.
 */
export function isGrantable(scope: string, held: readonly string[]): boolean {
  return held.includes(scope) || scope.startsWith(`${SQUADRONS_NAMESPACE}:`);
}
