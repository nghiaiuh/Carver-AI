import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const migrationDirectory = path.resolve("packages/db/sql");
const entries = (await readdir(migrationDirectory))
  .filter((name) => /^\d{3}_.+\.sql$/u.test(name))
  .sort();
const expectedPrefixes = Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(3, "0"));

for (const prefix of expectedPrefixes) {
  if (!entries.some((name) => name.startsWith(`${prefix}_`))) {
    throw new Error(`Missing required migration prefix ${prefix}.`);
  }
}

for (const entry of entries) {
  const content = await readFile(path.join(migrationDirectory, entry), "utf8");
  if (!content.trim()) {
    throw new Error(`Migration ${entry} is empty.`);
  }
  if (!content.includes(";")) {
    throw new Error(`Migration ${entry} does not contain a SQL statement terminator.`);
  }
}

console.log(JSON.stringify({ valid: true, migrations: entries }, null, 2));
