import assert from "node:assert/strict";
import test from "node:test";
import { buildShotInvocationIdentity } from "./shot-invocation-service";

test("shot invocation identity is stable per job, shot, and candidate", () => {
  const first = buildShotInvocationIdentity({
    jobId: "job-1",
    shotSetNodeId: "set-1",
    shotId: "shot-1",
    shotOrder: 0,
  });
  const replay = buildShotInvocationIdentity({
    jobId: "job-1",
    shotSetNodeId: "set-1",
    shotId: "shot-1",
    shotOrder: 0,
  });
  const alternativeCandidate = buildShotInvocationIdentity({
    jobId: "job-1",
    shotSetNodeId: "set-1",
    shotId: "shot-1",
    shotOrder: 0,
    candidateIndex: 1,
  });

  assert.deepEqual(replay, first);
  assert.notEqual(alternativeCandidate.invocationId, first.invocationId);
  assert.notEqual(alternativeCandidate.candidateId, first.candidateId);
});
