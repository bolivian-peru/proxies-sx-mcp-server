/**
 * Shared pieces of the purchase tools (Private modems, card top-up).
 *
 * - A tool with an outputSchema returns `structuredContent` and the same data
 *   as text (MCP 2025-06-18: servers SHOULD mirror structured results).
 * - Money moves only after the user agreed to the exact USD amount, which the
 *   agent signals with `confirm: true`. The refusal is a tool result
 *   (isError), not a protocol error, so the agent can read what to do.
 */

export interface StructuredResult {
  text: string;
  structuredContent: Record<string, unknown>;
}

/** Structured content plus its text mirror, with an optional first line. */
export function structured(structuredContent: Record<string, unknown>, lead?: string): StructuredResult {
  const json = JSON.stringify(structuredContent, null, 2);
  return { structuredContent, text: lead ? `${lead}\n${json}` : json };
}

export const confirmProperty = {
  type: 'boolean',
  description: 'Set true only after the user agreed to the exact USD amount. Without it nothing is bought and the tool says what to confirm.',
};

export function requireConfirm(confirm: boolean | undefined, action: string): void {
  if (confirm === true) return;
  throw new Error(`Nothing was ${action}: confirm is not true. Show the user the exact USD amount, and call again with confirm: true once they agree.`);
}
