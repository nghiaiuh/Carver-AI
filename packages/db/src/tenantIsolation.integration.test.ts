import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type IntegrationConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  webBaseUrl: string;
};

type TenantFixture = {
  admin: SupabaseClient<Database>;
  userAId: string;
  userAAccessToken: string;
  userBId: string;
  userBAccessToken: string;
  projectId: string;
  snapshotId: string;
  assetId: string;
  threadId: string;
  messageId: string;
  jobId: string;
  libraryFolderId: string;
  libraryAssetId: string;
  creditLedgerId: string;
};

type DatabaseResponse = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

const requiredEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}. Tenant-isolation tests require an explicit staging or local Supabase test environment.`);
  }

  return value;
};

function loadConfig(): IntegrationConfig {
  if (process.env.CARVER_RUN_INTEGRATION_TESTS !== "1") {
    throw new Error("Set CARVER_RUN_INTEGRATION_TESTS=1 before running tenant-isolation integration tests.");
  }

  const environment = requiredEnv("CARVER_TEST_ENVIRONMENT");
  if (environment !== "local" && environment !== "staging") {
    throw new Error("CARVER_TEST_ENVIRONMENT must be local or staging. Production is not allowed.");
  }

  const webBaseUrl = requiredEnv("CARVER_TEST_WEB_BASE_URL").replace(/\/+$/, "");
  try {
    new URL(webBaseUrl);
  } catch {
    throw new Error("CARVER_TEST_WEB_BASE_URL must be an absolute URL.");
  }

  return {
    url: requiredEnv("SUPABASE_TEST_URL"),
    anonKey: requiredEnv("SUPABASE_TEST_ANON_KEY"),
    serviceRoleKey: requiredEnv("SUPABASE_TEST_SERVICE_ROLE_KEY"),
    webBaseUrl,
  };
}

const config = loadConfig();

function assertNoDatabaseError(error: DatabaseResponse["error"]) {
  assert.equal(error, null, error?.message);
}

async function assertHidden(response: PromiseLike<DatabaseResponse>) {
  const { data, error } = await response;
  assertNoDatabaseError(error);
  assert.deepEqual(data, []);
}

async function assertMutationBlocked(response: PromiseLike<DatabaseResponse>) {
  const { data, error } = await response;
  if (error) {
    return;
  }

  assert.deepEqual(data, []);
}

async function createAuthenticatedUser(params: {
  admin: SupabaseClient<Database>;
  anonKey: string;
  url: string;
  label: "a" | "b";
}) {
  const suffix = randomUUID();
  const email = `tenant-isolation-${params.label}-${suffix}@example.invalid`;
  const password = `Carver!${randomUUID()}Aa9`;
  const { data: created, error: createError } = await params.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assertNoDatabaseError(createError);
  assert.ok(created.user, "Supabase did not return the created test user.");

  try {
    const authClient = createClient<Database>(params.url, params.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error: loginError } = await authClient.auth.signInWithPassword({ email, password });
    assertNoDatabaseError(loginError);
    assert.ok(login.session?.access_token, "Supabase did not return a test-user access token.");

    return {
      id: created.user.id,
      accessToken: login.session.access_token,
    };
  } catch (error) {
    await params.admin.auth.admin.deleteUser(created.user.id);
    throw error;
  }
}

async function createFixture(): Promise<TenantFixture> {
  const admin = createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let userA: Awaited<ReturnType<typeof createAuthenticatedUser>> | null = null;
  let userB: Awaited<ReturnType<typeof createAuthenticatedUser>> | null = null;

  try {
    userA = await createAuthenticatedUser({ admin, ...config, label: "a" });
    userB = await createAuthenticatedUser({ admin, ...config, label: "b" });
    const suffix = randomUUID();

    const { error: profileError } = await admin.from("profiles").upsert([
      { id: userA.id, display_name: "Tenant A" },
      { id: userB.id, display_name: "Tenant B" },
    ]);
    assertNoDatabaseError(profileError);

    const { data: creditLedger, error: creditLedgerError } = await admin
      .from("credit_ledger")
      .insert({
        profile_id: userA.id,
        amount: 5,
        balance_after: 5,
        reason: "admin_adjustment",
        idempotency_key: `tenant-credit-${suffix}`,
      })
      .select("id")
      .single();
    assertNoDatabaseError(creditLedgerError);
    assert.ok(creditLedger, "Credit ledger fixture was not created.");

    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ owner_id: userA.id, name: `Tenant isolation ${suffix}` })
      .select("id")
      .single();
    assertNoDatabaseError(projectError);
    assert.ok(project, "Project fixture was not created.");

    const { data: snapshot, error: snapshotError } = await admin
      .from("canvas_snapshots")
      .insert({
        project_id: project.id,
        version: 1,
        canvas_json: {},
        created_by: userA.id,
        snapshot_kind: "initial",
        is_user_visible: false,
        document_hash: "a".repeat(64),
      })
      .select("id")
      .single();
    assertNoDatabaseError(snapshotError);
    assert.ok(snapshot, "Snapshot fixture was not created.");

    const { error: currentSnapshotError } = await admin
      .from("projects")
      .update({ current_canvas_snapshot_id: snapshot.id })
      .eq("id", project.id);
    assertNoDatabaseError(currentSnapshotError);

    const { data: asset, error: assetError } = await admin
      .from("assets")
      .insert({
        project_id: project.id,
        owner_id: userA.id,
        kind: "upload",
        storage_bucket: "project-uploads",
        storage_path: `tenant-isolation/${suffix}/source.webp`,
        mime_type: "image/webp",
      })
      .select("id")
      .single();
    assertNoDatabaseError(assetError);
    assert.ok(asset, "Asset fixture was not created.");

    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .insert({ project_id: project.id, title: "Tenant isolation thread" })
      .select("id")
      .single();
    assertNoDatabaseError(threadError);
    assert.ok(thread, "Chat thread fixture was not created.");

    const { data: message, error: messageError } = await admin
      .from("chat_messages")
      .insert({
        project_id: project.id,
        thread_id: thread.id,
        role: "user",
        content: "Tenant A private message",
      })
      .select("id")
      .single();
    assertNoDatabaseError(messageError);
    assert.ok(message, "Chat message fixture was not created.");

    const { data: job, error: jobError } = await admin
      .from("ai_jobs")
      .insert({
        project_id: project.id,
        thread_id: thread.id,
        created_by: userA.id,
        job_type: "generate_concept",
        status: "queued",
        prompt: "Tenant A private generation",
        input_snapshot_id: snapshot.id,
        input_asset_ids: [asset.id],
        idempotency_key: `tenant-isolation-${suffix}`,
      })
      .select("id")
      .single();
    assertNoDatabaseError(jobError);
    assert.ok(job, "AI job fixture was not created.");

    const { data: folder, error: folderError } = await admin
      .from("library_folders")
      .insert({
        owner_id: userA.id,
        title: "Tenant A library",
        slug: `tenant-a-${suffix}`,
        created_by: "integration-test",
      })
      .select("id")
      .single();
    assertNoDatabaseError(folderError);
    assert.ok(folder, "Library folder fixture was not created.");

    const { data: libraryAsset, error: libraryAssetError } = await admin
      .from("library_assets")
      .insert({
        owner_id: userA.id,
        folder_id: folder.id,
        title: "Tenant A library asset",
        source_type: "manual",
        thumb_storage_path: `tenant-isolation/${suffix}/thumb.webp`,
        preview_storage_path: `tenant-isolation/${suffix}/preview.webp`,
        original_storage_path: `tenant-isolation/${suffix}/original.webp`,
        thumb_url: `asset://tenant-isolation/${suffix}/thumb`,
        preview_url: `asset://tenant-isolation/${suffix}/preview`,
        original_url: `asset://tenant-isolation/${suffix}/original`,
      })
      .select("id")
      .single();
    assertNoDatabaseError(libraryAssetError);
    assert.ok(libraryAsset, "Library asset fixture was not created.");

    const { error: draftError } = await admin.rpc("upsert_project_canvas_draft", {
      actor_user_id: userA.id,
      target_project_id: project.id,
      expected_revision: 0,
      draft_canvas_json: {},
      draft_document_hash: "b".repeat(64),
      draft_last_mutation_id: `tenant-isolation-${suffix}`,
      draft_base_snapshot_id: snapshot.id,
    });
    assertNoDatabaseError(draftError);

    return {
      admin,
      userAId: userA.id,
      userAAccessToken: userA.accessToken,
      userBId: userB.id,
      userBAccessToken: userB.accessToken,
      projectId: project.id,
      snapshotId: snapshot.id,
      assetId: asset.id,
      threadId: thread.id,
      messageId: message.id,
      jobId: job.id,
      libraryFolderId: folder.id,
      libraryAssetId: libraryAsset.id,
      creditLedgerId: creditLedger.id,
    };
  } catch (error) {
    await Promise.allSettled(
      [userA?.id, userB?.id]
        .filter((userId): userId is string => Boolean(userId))
        .map((userId) => admin.auth.admin.deleteUser(userId)),
    );
    throw error;
  }
}

async function deleteFixture(fixture: TenantFixture) {
  const results = await Promise.allSettled([
    fixture.admin.auth.admin.deleteUser(fixture.userAId),
    fixture.admin.auth.admin.deleteUser(fixture.userBId),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
}

function createEmptyCanvasDocument() {
  return {
    schema: "carver-canvas-v4",
    schemaVersion: 4,
    snapshotVersion: 4,
    camera: {},
    objects: [],
    regions: [],
    locks: [],
    references: [],
    selection: { objectIds: [], regionIds: [], activeAssetIds: [] },
    graph: { nodes: [], edges: [], activeGenerationTargetId: null },
    markers: [],
    addedObjects: [],
    sketchLines: [],
    sketchGroups: [],
    penStrokes: [],
    metadata: {},
  };
}

function createUserClient(accessToken: string) {
  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function apiRequestForUser(accessToken: string, path: string, init: RequestInit = {}) {
  return fetch(`${config.webBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

async function apiRequest(fixture: TenantFixture, path: string, init: RequestInit = {}) {
  return apiRequestForUser(fixture.userBAccessToken, path, init);
}

async function assertApiNotFound(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; code?: string };
  assert.equal(response.status, 404, `Expected 404, received ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.success, false);
}

test("tenant isolation hides User A data from User B through RLS and API routes", async () => {
  const fixture = await createFixture();
  const userA = createUserClient(fixture.userAAccessToken);
  const userB = createUserClient(fixture.userBAccessToken);

  try {
    const ownerDraftResponse = await apiRequestForUser(
      fixture.userAAccessToken,
      `/api/project-drafts/${fixture.projectId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: createEmptyCanvasDocument(),
          expectedRevision: 1,
          documentHash: "f".repeat(64),
          mutationId: `service-boundary-${randomUUID()}`,
          baseSnapshotId: fixture.snapshotId,
        }),
      },
    );
    const ownerDraftBody = (await ownerDraftResponse.json()) as {
      success?: boolean;
      data?: { draft?: { revision?: number } };
    };
    assert.equal(ownerDraftResponse.status, 200, JSON.stringify(ownerDraftBody));
    assert.equal(ownerDraftBody.success, true);
    const ownerDraftRevision = ownerDraftBody.data?.draft?.revision;
    assert.equal(typeof ownerDraftRevision, "number");

    const ownerFinalizeResponse = await apiRequestForUser(
      fixture.userAAccessToken,
      `/api/project-drafts/${fixture.projectId}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: ownerDraftRevision, reason: "manual" }),
      },
    );
    assert.equal(ownerFinalizeResponse.status, 200, await ownerFinalizeResponse.text());

    const ownerSnapshotResponse = await apiRequestForUser(
      fixture.userAAccessToken,
      `/api/projects/${fixture.projectId}/snapshot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: createEmptyCanvasDocument(),
          reason: "manual",
          documentHash: "a".repeat(64),
        }),
      },
    );
    assert.equal(ownerSnapshotResponse.status, 201, await ownerSnapshotResponse.text());

    for (const scope of ["chat", "ai-job-poll", "asset-resolve"] as const) {
      const { data: allowedRateLimit, error: allowedRateLimitError } = await userA.rpc("consume_api_rate_limit", {
        p_scope: scope,
        p_limit: 5,
        p_window_seconds: 60,
      });
      assertNoDatabaseError(allowedRateLimitError);
      assert.ok(Array.isArray(allowedRateLimit));
      assert.equal(allowedRateLimit[0]?.allowed, true);
    }

    const { error: rejectedRateLimitError } = await userA.rpc("consume_api_rate_limit", {
      p_scope: `unapproved-scope-${randomUUID()}`,
      p_limit: 5,
      p_window_seconds: 60,
    });
    assert.ok(rejectedRateLimitError, "The rate-limit RPC must reject an unapproved scope.");
    assert.match(rejectedRateLimitError.message, /INVALID_RATE_LIMIT_INPUT/i);

    await Promise.all([
      assertHidden(userB.from("projects").select("id").eq("id", fixture.projectId)),
      assertHidden(userB.from("canvas_snapshots").select("id").eq("id", fixture.snapshotId)),
      assertHidden(userB.from("project_canvas_drafts").select("project_id").eq("project_id", fixture.projectId)),
      assertHidden(userB.from("assets").select("id").eq("id", fixture.assetId)),
      assertHidden(userB.from("chat_threads").select("id").eq("id", fixture.threadId)),
      assertHidden(userB.from("chat_messages").select("id").eq("id", fixture.messageId)),
      assertHidden(userB.from("ai_jobs").select("id").eq("id", fixture.jobId)),
      assertHidden(userB.from("library_folders").select("id").eq("id", fixture.libraryFolderId)),
      assertHidden(userB.from("library_assets").select("id").eq("id", fixture.libraryAssetId)),
      assertHidden(userB.from("credit_ledger").select("id").eq("id", fixture.creditLedgerId)),
    ]);

    await Promise.all([
      assertMutationBlocked(userB.from("projects").update({ name: "compromised" }).eq("id", fixture.projectId).select("id")),
      assertMutationBlocked(userB.from("canvas_snapshots").update({ canvas_json: { compromised: true } }).eq("id", fixture.snapshotId).select("id")),
      assertMutationBlocked(userB.from("project_canvas_drafts").update({ document_hash: "c".repeat(64) }).eq("project_id", fixture.projectId).select("project_id")),
      assertMutationBlocked(userB.from("assets").update({ storage_path: "compromised.webp" }).eq("id", fixture.assetId).select("id")),
      assertMutationBlocked(userB.from("chat_threads").update({ title: "compromised" }).eq("id", fixture.threadId).select("id")),
      assertMutationBlocked(userB.from("chat_messages").update({ content: "compromised" }).eq("id", fixture.messageId).select("id")),
      assertMutationBlocked(userB.from("ai_jobs").update({ prompt: "compromised" }).eq("id", fixture.jobId).select("id")),
      assertMutationBlocked(userB.from("library_folders").update({ title: "compromised" }).eq("id", fixture.libraryFolderId).select("id")),
      assertMutationBlocked(userB.from("library_assets").update({ title: "compromised" }).eq("id", fixture.libraryAssetId).select("id")),
    ]);

    const { error: draftInsertError } = await userB.from("project_canvas_drafts").insert({
      project_id: fixture.projectId,
      owner_id: fixture.userBId,
      canvas_json: {},
    });
    assert.ok(draftInsertError, "User B must not create a draft for User A's project.");

    const { error: draftRpcError } = await userB.rpc("upsert_project_canvas_draft", {
      actor_user_id: fixture.userBId,
      target_project_id: fixture.projectId,
      expected_revision: 0,
      draft_canvas_json: {},
      draft_document_hash: "d".repeat(64),
      draft_last_mutation_id: `attack-${randomUUID()}`,
      draft_base_snapshot_id: fixture.snapshotId,
    });
    assert.ok(draftRpcError, "Browser user tokens must not call the draft RPC directly.");
    assert.match(draftRpcError.message, /permission denied|not allowed/i);

    const { error: snapshotRpcError } = await userB.rpc("save_project_canvas_snapshot", {
      actor_user_id: fixture.userBId,
      target_project_id: fixture.projectId,
      snapshot_canvas_json: {},
      snapshot_reason: "manual",
      snapshot_document_hash: "e".repeat(64),
    });
    assert.ok(snapshotRpcError, "Browser user tokens must not call the snapshot RPC directly.");
    assert.match(snapshotRpcError.message, /permission denied|not allowed/i);

    const { error: finalizeRpcError } = await userB.rpc("finalize_project_canvas_draft", {
      actor_user_id: fixture.userBId,
      target_project_id: fixture.projectId,
      expected_revision: 1,
      snapshot_reason: "manual",
    });
    assert.ok(finalizeRpcError, "Browser user tokens must not call the draft finalize RPC directly.");
    assert.match(finalizeRpcError.message, /permission denied|not allowed/i);

    await assertMutationBlocked(userB.from("ai_jobs").delete().eq("id", fixture.jobId).select("id"));
    await assertMutationBlocked(userB.from("chat_messages").delete().eq("id", fixture.messageId).select("id"));
    await assertMutationBlocked(userB.from("chat_threads").delete().eq("id", fixture.threadId).select("id"));
    await assertMutationBlocked(userB.from("assets").delete().eq("id", fixture.assetId).select("id"));
    await assertMutationBlocked(userB.from("project_canvas_drafts").delete().eq("project_id", fixture.projectId).select("project_id"));
    await assertMutationBlocked(userB.from("canvas_snapshots").delete().eq("id", fixture.snapshotId).select("id"));
    await assertMutationBlocked(userB.from("library_assets").delete().eq("id", fixture.libraryAssetId).select("id"));
    await assertMutationBlocked(userB.from("library_folders").delete().eq("id", fixture.libraryFolderId).select("id"));
    await assertMutationBlocked(userB.from("projects").delete().eq("id", fixture.projectId).select("id"));

    await Promise.all([
      assertApiNotFound(await apiRequest(fixture, `/api/projects/${fixture.projectId}/snapshot`)),
      assertApiNotFound(await apiRequest(fixture, `/api/projects/${fixture.projectId}`, { method: "DELETE" })),
      assertApiNotFound(await apiRequest(fixture, `/api/project-drafts/${fixture.projectId}`)),
      assertApiNotFound(await apiRequest(fixture, `/api/projects/${fixture.projectId}/ai-jobs/${fixture.jobId}`)),
      assertApiNotFound(await apiRequest(fixture, `/api/chat?projectId=${fixture.projectId}&canvasId=tenant-isolation`)),
      assertApiNotFound(await apiRequest(fixture, `/api/library/assets/${fixture.libraryAssetId}`, { method: "DELETE" })),
      assertApiNotFound(await apiRequest(fixture, `/api/library/folders/${fixture.libraryFolderId}`, { method: "DELETE" })),
    ]);

    const assetResolve = await apiRequest(fixture, "/api/assets/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: [fixture.assetId] }),
    });
    const assetResolveBody = (await assetResolve.json()) as {
      success?: boolean;
      data?: { assets?: Record<string, unknown> };
    };
    assert.equal(assetResolve.status, 200);
    assert.equal(assetResolveBody.success, true);
    assert.equal(assetResolveBody.data?.assets?.[fixture.assetId], undefined);

    // The content gateway must not accept a raw asset ID without a URL token
    // minted after ownership verification.
    await assertApiNotFound(
      await fetch(`${config.webBaseUrl}/api/assets/${fixture.assetId}/content`),
    );

    const legacyGenerate = await fetch(`${config.webBaseUrl}/api/generate`, { method: "POST" });
    const legacyGenerateBody = (await legacyGenerate.json()) as {
      success?: boolean;
      code?: string;
      requestId?: string;
    };
    assert.equal(legacyGenerate.status, 410);
    assert.equal(legacyGenerateBody.success, false);
    assert.equal(legacyGenerateBody.code, "LEGACY_GENERATE_DISABLED");
    assert.equal(typeof legacyGenerateBody.requestId, "string");

    const legacyLibrarySync = await fetch(`${config.webBaseUrl}/api/library/sync`, { method: "POST" });
    const legacyLibrarySyncBody = (await legacyLibrarySync.json()) as {
      success?: boolean;
      code?: string;
      requestId?: string;
    };
    assert.equal(legacyLibrarySync.status, 410);
    assert.equal(legacyLibrarySyncBody.success, false);
    assert.equal(legacyLibrarySyncBody.code, "LIBRARY_SYNC_MOVED_TO_WORKER");
    assert.equal(typeof legacyLibrarySyncBody.requestId, "string");

    const libraryResponse = await apiRequest(fixture, "/api/library");
    const libraryBody = await libraryResponse.text();
    assert.equal(libraryResponse.status, 200);
    assert.equal(libraryBody.includes(fixture.libraryFolderId), false);
    assert.equal(libraryBody.includes(fixture.libraryAssetId), false);

    const creditHistoryResponse = await apiRequest(fixture, "/api/credits/transactions");
    const creditHistoryBody = (await creditHistoryResponse.json()) as {
      success?: boolean;
      data?: { entries?: Array<{ id?: string }> };
    };
    assert.equal(creditHistoryResponse.status, 200);
    assert.equal(creditHistoryBody.success, true);
    assert.equal(
      creditHistoryBody.data?.entries?.some((entry) => entry.id === fixture.creditLedgerId),
      false,
      "User B must not receive User A ledger entries through the credit history API.",
    );
  } finally {
    await deleteFixture(fixture);
  }
});
