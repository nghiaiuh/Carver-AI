import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const apiDirectory = path.resolve("apps/web/app/api");

async function findRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findRouteFiles(entryPath);
      return entry.name === "route.ts" ? [entryPath] : [];
    }),
  );

  return nested.flat();
}

const checks = [
  {
    name: "raw error message passed to apiFailure",
    pattern: /apiFailure\([\s\S]{0,240}(?:error\.message|String\(error\))/u,
  },
  {
    name: "raw error value returned in JSON response",
    pattern: /(?:error|message)\s*:\s*(?:error(?:\.message)?|String\(error\))/u,
  },
  {
    name: "unscoped serverError helper creates a second requestId",
    pattern: /\bserverError\(\)/u,
  },
];

const failures = [];
for (const routeFile of await findRouteFiles(apiDirectory)) {
  const source = await readFile(routeFile, "utf8");
  for (const check of checks) {
    if (check.pattern.test(source)) {
      failures.push(`${path.relative(process.cwd(), routeFile)}: ${check.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("API error-boundary verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.info("API error-boundary verification passed.");
}
