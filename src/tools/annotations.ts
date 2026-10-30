/**
 * MCP tool annotations (spec 2025-03-26 `ToolAnnotations`).
 * Four factories cover every tool: read-only lookups, ordinary mutations,
 * destructive mutations (delete / revoke / cancel / rotate) and spending. API tools
 * talk only to the Proxies.sx API, so openWorldHint is false; the wallet
 * tools that read or pay on a public blockchain wrap theirs in onChain().
 */

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const annotate = (title: string, readOnly: boolean, destructive: boolean, idempotent: boolean): ToolAnnotations => ({
  title,
  readOnlyHint: readOnly,
  destructiveHint: destructive,
  idempotentHint: idempotent,
  openWorldHint: false,
});

/** list / get / status / check / stock / balance — no state change. */
export const readOnly = (title: string): ToolAnnotations => annotate(title, true, false, true);

/** Creates or updates state; pass idempotent=true for set-style updates. */
export const mutating = (title: string, idempotent = false): ToolAnnotations => annotate(title, false, false, idempotent);

/** delete / revoke / cancel / rotate — irreversible for the caller. */
export const destructive = (title: string): ToolAnnotations => annotate(title, false, true, false);

/** Spends money from the balance; idempotent when the request carries an Idempotency-Key. */
export const spending = (title: string, idempotent = false): ToolAnnotations => annotate(title, false, true, idempotent);

/** For wallet tools that read from or pay on a public blockchain. */
export const onChain = (annotations: ToolAnnotations): ToolAnnotations => ({ ...annotations, openWorldHint: true });
