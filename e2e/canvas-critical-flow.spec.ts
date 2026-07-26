import { expect, test } from "@playwright/test";

const enabled = process.env.CARVER_RUN_E2E === "1";
const projectId = process.env.CARVER_E2E_PROJECT_ID;
const storageState = process.env.CARVER_E2E_STORAGE_STATE_PATH;

test.use({ storageState });

test.describe("canvas critical flow", () => {
  test.skip(
    !enabled || !storageState,
    "E2E requires CARVER_RUN_E2E=1 and an authenticated disposable staging storage state.",
  );

  test("authenticated user restores a project canvas and sees the chat composer", async ({ page }) => {
    test.skip(!projectId, "Set CARVER_E2E_PROJECT_ID to a disposable staging project.");

    // The authenticated storage state is intentionally injected by CI/local
    // setup, never hard-coded in the repository.
    await page.goto(`/canvas?projectId=${projectId}`);
    await expect(page.getByText("AI Chat", { exact: true })).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
  });
});
