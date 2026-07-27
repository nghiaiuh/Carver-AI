import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.CARVER_RUN_E2E === "1";
const storageState = process.env.CARVER_E2E_STORAGE_STATE_PATH;
const runGeneration = process.env.CARVER_E2E_RUN_GENERATION === "1";

// A valid 1x1 PNG keeps staging coverage independent of source files and OpenAI.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oN2VNcAAAAASUVORK5CYII=";

type ApiResult = {
  status: number;
  body: Record<string, unknown>;
};

test.use({ storageState });

const cleanupFolders: Array<{ token: string; folderId: string }> = [];
const cleanupProjects: Array<{ token: string; projectId: string }> = [];

test.afterEach(async ({ page }) => {
  // Folder deletion removes its uploaded R2 variants. Keep cleanup best-effort
  // so the original test failure remains the useful diagnostic in CI.
  while (cleanupFolders.length > 0) {
    const record = cleanupFolders.pop();
    if (!record) continue;
    await apiJson(page, record.token, `/api/library/folders/${record.folderId}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  while (cleanupProjects.length > 0) {
    const record = cleanupProjects.pop();
    if (!record) continue;
    await apiJson(page, record.token, `/api/projects/${record.projectId}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }
});

async function getAccessToken(page: Page) {
  const token = await page.evaluate(() => {
    const findAccessToken = (value: unknown): string | null => {
      if (!value || typeof value !== "object") return null;
      if (Array.isArray(value)) {
        for (const item of value) {
          const token = findAccessToken(item);
          if (token) return token;
        }
        return null;
      }

      const record = value as Record<string, unknown>;
      if (typeof record.access_token === "string") return record.access_token;
      for (const nested of Object.values(record)) {
        const token = findAccessToken(nested);
        if (token) return token;
      }
      return null;
    };

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.includes("auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const token = findAccessToken(JSON.parse(raw));
        if (token) return token;
      } catch {
        // Continue searching so a stale or unrelated browser value cannot break E2E.
      }
    }

    return null;
  });

  expect(token, "Authenticated staging storage state must contain a Supabase access token.").toBeTruthy();
  return token!;
}

async function apiJson(page: Page, token: string, path: string, init: RequestInit = {}): Promise<ApiResult> {
  return page.evaluate(
    async ({ token: accessToken, path: requestPath, init: requestInit }) => {
      const headers = new Headers(requestInit.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      const response = await fetch(requestPath, { ...requestInit, headers });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: response.status, body };
    },
    { token, path, init },
  );
}

async function uploadFixture(page: Page, token: string, folderId: string): Promise<ApiResult> {
  return page.evaluate(
    async ({ accessToken, destinationFolderId, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const form = new FormData();
      form.append("title", "E2E site image");
      form.append("sourceType", "upload");
      form.append("files", new File([bytes], "e2e-site.png", { type: "image/png" }));
      const response = await fetch(`/api/library/folders/${destinationFolderId}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
      };
    },
    { accessToken: token, destinationFolderId: folderId, base64: PNG_BASE64 },
  );
}

function emptyDocument() {
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

test.describe("canvas release-critical staging flow", () => {
  test.skip(
    !enabled || !storageState,
    "E2E requires CARVER_RUN_E2E=1 and an authenticated disposable staging storage state.",
  );

  test("creates a project, restores its draft, and returns a simulated chat generation to chat and canvas", async ({ page }) => {
    await page.goto("/");
    const token = await getAccessToken(page);
    const runId = `e2e-${Date.now()}`;

    const createProject = await apiJson(page, token, "/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E Canvas ${runId}` }),
    });
    expect(createProject.status, JSON.stringify(createProject.body)).toBe(201);
    const project = createProject.body.project as { id?: string } | undefined;
    expect(project?.id).toBeTruthy();
    const projectId = project!.id!;
    cleanupProjects.push({ token, projectId });

    const createFolder = await apiJson(page, token, "/api/library/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `E2E uploads ${runId}` }),
    });
    expect(createFolder.status, JSON.stringify(createFolder.body)).toBe(201);
    const folder = ((createFolder.body.data as { folder?: { id?: string } } | undefined)?.folder ??
      createFolder.body.folder) as { id?: string } | undefined;
    expect(folder?.id).toBeTruthy();
    cleanupFolders.push({ token, folderId: folder!.id! });

    const upload = await uploadFixture(page, token, folder!.id!);
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const uploadedAssets = (
      (upload.body.data as { assets?: Array<Record<string, unknown>> } | undefined)?.assets ?? upload.body.assets
    ) as Array<Record<string, unknown>> | undefined;
    const uploadedAsset = uploadedAssets?.[0];
    expect(uploadedAsset?.id, "Upload must return stable library asset metadata.").toBeTruthy();
    const assetId = uploadedAsset!.id as string;
    const imageUrl = (uploadedAsset!.originalSrc ?? uploadedAsset!.src) as string | undefined;
    expect(imageUrl, "Upload must return a runtime private delivery URL.").toBeTruthy();

    const imageResponse = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return { status: response.status, contentType: response.headers.get("content-type") };
    }, imageUrl!);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.contentType).toContain("image/");

    const document = emptyDocument();
    document.graph.nodes.push({
      id: `e2e-node-${runId}`,
      kind: "image",
      title: "E2E site image",
      role: "layout",
      imageUrl: "",
      sourceImage: { assetId, url: "", quality: "original" },
      prompt: null,
      x: 120,
      y: 120,
      width: 320,
      height: 220,
    });
    document.graph.activeGenerationTargetId = document.graph.nodes[0]!.id;

    const draftHash = `${"e2e".repeat(22)}${runId}`.slice(0, 64);
    const saveDraft = await apiJson(page, token, `/api/project-drafts/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, expectedRevision: 0, documentHash: draftHash, mutationId: runId }),
    });
    expect(saveDraft.status, JSON.stringify(saveDraft.body)).toBe(200);

    const reloadedDraft = await apiJson(page, token, `/api/project-drafts/${projectId}`);
    expect(reloadedDraft.status, JSON.stringify(reloadedDraft.body)).toBe(200);
    const reloadedDocument = (reloadedDraft.body.data as { document?: typeof document } | undefined)?.document;
    expect(reloadedDocument?.graph.nodes).toHaveLength(1);
    expect(reloadedDocument?.graph.nodes[0]?.sourceImage?.assetId).toBe(assetId);
    expect(reloadedDocument?.graph.nodes[0]?.sourceImage?.url).toContain("/api/assets/");

    await page.goto(`/canvas?projectId=${projectId}`);
    await expect(page.getByText("AI Chat", { exact: true })).toBeVisible();
    await expect(page.getByAltText("E2E site image")).toBeVisible();

    // Asset/draft hydration remains valuable on every staging run. Generation is
    // opted in only where the separate staging worker is running with simulation.
    if (!runGeneration) return;

    // The real composer does not expose simulation controls. The staging test
    // adds the fixture-only provider config at the HTTP boundary, so this still
    // validates chat intent routing, queueing, UI polling, and output hydration.
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const postData = route.request().postData();
      const body = postData ? (JSON.parse(postData) as Record<string, unknown>) : {};
      await route.continue({
        postData: JSON.stringify({
          ...body,
          // The first attempt persists its output then fails. A successful retry
          // proves BullMQ retry reuses the deterministic output asset.
          simulation: { scenario: "fail_after_asset_persisted_once", delayMs: 100 },
        }),
      });
    });

    const chatResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
    );
    const composer = page.locator('[role="textbox"][contenteditable="true"]');
    await composer.fill("Generate a safe simulated landscape output for E2E verification.");
    await page.getByTitle("Send").click();

    const chatResponse = await chatResponsePromise;
    const chatBody = (await chatResponse.json()) as {
      mode?: string;
      job?: { id?: string };
    };
    expect(chatResponse.status(), JSON.stringify(chatBody)).toBe(200);
    expect(chatBody.mode).toBe("generation");
    expect(chatBody.job?.id).toBeTruthy();
    const jobId = chatBody.job!.id!;

    // The chat panel owns poll-and-hydrate. Waiting on its final output verifies
    // that the browser did not merely enqueue a job and abandon the result.
    await expect(page.getByText("Generated a concept image from the selected canvas target and connected references.")).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByAltText("Generated concept")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('canvas[aria-label="Generated concept"]')).toBeVisible({ timeout: 90_000 });

    const completedJob = await apiJson(page, token, `/api/projects/${projectId}/ai-jobs/${jobId}`);
    expect(completedJob.status, JSON.stringify(completedJob.body)).toBe(200);
    const completedJobRecord = (completedJob.body.data as { job?: Record<string, unknown> } | undefined)?.job;
    expect(completedJobRecord?.status).toBe("succeeded");

    const jobResult = completedJobRecord?.jobResult as { generatedImages?: Array<{ assetId?: string; imageUrl?: string }> } | undefined;
    expect(jobResult?.generatedImages?.[0]?.assetId).toBeTruthy();
    expect(jobResult?.generatedImages?.[0]?.imageUrl).toContain("/api/assets/");

    const generatedAssetId = jobResult?.generatedImages?.[0]?.assetId;
    await expect
      .poll(
        async () => {
          const draft = await apiJson(page, token, `/api/project-drafts/${projectId}`);
          expect(draft.status, JSON.stringify(draft.body)).toBe(200);
          const draftDocument = (draft.body.data as { document?: { graph?: { nodes?: Array<{ sourceImage?: { assetId?: string } }> } } } | undefined)
            ?.document;
          return draftDocument?.graph?.nodes?.some((node) => node.sourceImage?.assetId === generatedAssetId) ?? false;
        },
        { timeout: 20_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(true);

    const chatHistory = await apiJson(page, token, `/api/chat?projectId=${projectId}&canvasId=e2e-retry`);
    expect(chatHistory.status, JSON.stringify(chatHistory.body)).toBe(200);
    const messages = (chatHistory.body.messages as Array<{
      generatedImages?: Array<{ assetId?: string }>;
    }> | undefined) ?? [];
    const generatedMessages = messages.filter((message) =>
      message.generatedImages?.some((image) => image.assetId === generatedAssetId),
    );
    expect(generatedMessages).toHaveLength(1);
  });
});
