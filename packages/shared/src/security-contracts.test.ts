import assert from "node:assert/strict";
import test from "node:test";
import { createAiJobBodySchema } from "./api-schemas";
import { notifyOperationalAlert } from "./operational-alert";
import { redactLogValue } from "./safe-logger";

const UUID = "11111111-1111-4111-8111-111111111111";

test("AI job schema strips client-supplied ownership fields", () => {
  const parsed = createAiJobBodySchema.parse({
    projectId: UUID,
    prompt: "Create a calm garden concept",
    ownerId: "attacker",
    userId: "attacker",
    created_by: "attacker",
    storage_path: "users/attacker/private.png",
  });

  assert.equal("ownerId" in parsed, false);
  assert.equal("userId" in parsed, false);
  assert.equal("created_by" in parsed, false);
  assert.equal("storage_path" in parsed, false);
});

test("AI job schema rejects invalid asset identifiers and oversized prompts", () => {
  const invalidAsset = createAiJobBodySchema.safeParse({
    projectId: UUID,
    prompt: "Create a garden concept",
    referenceAssetIds: ["not-a-uuid"],
  });
  assert.equal(invalidAsset.success, false);

  const oversizedPrompt = createAiJobBodySchema.safeParse({
    projectId: UUID,
    prompt: "a".repeat(12_001),
  });
  assert.equal(oversizedPrompt.success, false);
});

test("safe logger redacts secrets, signed URL queries, private content, and errors", () => {
  const redacted = redactLogValue({
    authorization: "Bearer secret-token",
    assetUrl: "https://app.example/api/assets/id/content?token=secret&exp=1",
    prompt: "Private user request",
    snapshot: { nodes: [{ imageUrl: "data:image/png;base64,AAAA" }] },
    error: new Error("postgres host and password details"),
  }) as Record<string, unknown>;

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.prompt, "[REDACTED]");
  assert.equal(redacted.snapshot, "[REDACTED]");
  assert.deepEqual(redacted.error, {
    name: "Error",
    message: "[REDACTED_ERROR_MESSAGE]",
  });
  assert.equal(String(redacted.assetUrl).includes("secret"), false);
});

test("operational alerts redact payloads and apply cooldown without blocking callers", async () => {
  const requests: unknown[] = [];
  const options = {
    env: {
      NODE_ENV: "production",
      OPS_ALERT_WEBHOOK_URL: "https://alerts.example.test/carver",
      OPS_ALERT_COOLDOWN_MS: "60000",
    },
    now: 1_000,
    fetcher: async (_input: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    },
  };

  const first = await notifyOperationalAlert(
    {
      event: "test_alert_redaction",
      severity: "error",
      metadata: { prompt: "private garden request", token: "secret", jobId: "job-1" },
    },
    options,
  );
  const second = await notifyOperationalAlert(
    { event: "test_alert_redaction", severity: "error" },
    { ...options, now: 1_001 },
  );

  assert.deepEqual(first, { delivered: true });
  assert.deepEqual(second, { delivered: false, reason: "cooldown" });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    source: "carver-ai",
    event: "test_alert_redaction",
    severity: "error",
    occurredAt: "1970-01-01T00:00:01.000Z",
    metadata: { prompt: "[REDACTED]", token: "[REDACTED]", jobId: "job-1" },
  });
});
