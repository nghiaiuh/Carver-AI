import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve("packages/ai/src/prompt-engine");

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTests(filePath);
      return entry.name.endsWith(".test.ts") ? [filePath] : [];
    }),
  );
  return files.flat();
}

// V2 is the production engine. Legacy keyword-engine tests remain in the repo
// as migration fixtures, but their old string contracts are intentionally not
// a CI gate for the typed V2 policy/compiler surface.
const testFiles = (await findTests(root))
  .filter((filePath) => !filePath.includes(`${path.sep}enhance-prompt${path.sep}`))
  .filter((filePath) => !filePath.includes(`${path.sep}generate${path.sep}`))
  .sort();
if (testFiles.length === 0) {
  throw new Error("No prompt-engine test files were found.");
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
