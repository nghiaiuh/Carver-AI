import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function applyEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return false;
  }

  const fileContent = readFileSync(filePath, "utf8");
  const lines = fileContent.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }

  return true;
}

export function loadWorkerEnvFiles() {
  const workerRoot = process.cwd();
  const workspaceRoot = path.resolve(workerRoot, "../..");
  const candidateFiles = [
    path.join(workerRoot, ".env.local"),
    path.join(workerRoot, ".env"),
    path.join(workspaceRoot, ".env.local"),
    path.join(workspaceRoot, ".env"),
  ];

  return candidateFiles.filter((filePath) => applyEnvFile(filePath));
}
