import { createHash } from "node:crypto";

export function buildTerminalRetryIdentity(params: { baseKey: string; previousJobId: string }) {
  // Keep retry identities below the database key limit even when the caller
  // supplied a 128-character idempotency key. The previous terminal job makes
  // repeated clicks deterministic, so the credit ledger is debited at most once.
  const family = createHash("sha256")
    .update(`terminal-retry:${params.baseKey}`)
    .digest("hex")
    .slice(0, 40);
  const idempotencyKey = `retry-${family}-${params.previousJobId}`;
  return {
    idempotencyKey,
    creditIdempotencyKey: `generation:${idempotencyKey}`,
    familyPrefix: `retry-${family}-`,
  };
}
