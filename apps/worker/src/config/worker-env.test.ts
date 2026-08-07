import assert from "node:assert/strict";
import test from "node:test";
import { getWorkerRole } from "./worker-env";

test("worker roles default to all and reject unknown roles", () => {
  assert.equal(getWorkerRole(undefined), "all");
  assert.equal(getWorkerRole("generation"), "generation");
  assert.equal(getWorkerRole("maintenance"), "maintenance");
  assert.throws(() => getWorkerRole("unsupported"), /WORKER_ROLE/);
});
