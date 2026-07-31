import assert from "node:assert/strict";
import test from "node:test";
import {
  isExpiredUnreferencedR2Object,
  isManagedCarverR2Key,
} from "./r2-orphan-cleanup-service";

test("orphan cleanup only owns Carver-managed R2 prefixes", () => {
  assert.equal(isManagedCarverR2Key("users/user-1/projects/project-1/image.webp"), true);
  assert.equal(isManagedCarverR2Key("5de2d3ab-72ed-4d45-9a0f-11019b0254b9/presets/image.webp"), true);
  assert.equal(isManagedCarverR2Key("library preset/unmanaged-source.webp"), false);
  assert.equal(isManagedCarverR2Key("external-team/image.webp"), false);
});

test("orphan cleanup retains referenced or recent objects and selects only stale managed objects", () => {
  const now = Date.UTC(2026, 7, 1);
  const ttlMs = 7 * 24 * 60 * 60 * 1000;
  const staleManaged = {
    key: "users/user-1/projects/project-1/temp-ai-inputs/old.webp",
    size: 120,
    lastModified: new Date(now - ttlMs - 1),
  };

  assert.equal(isExpiredUnreferencedR2Object({ object: staleManaged, referencedKeys: new Set(), now, ttlMs }), true);
  assert.equal(isExpiredUnreferencedR2Object({
    object: staleManaged,
    referencedKeys: new Set([staleManaged.key]),
    now,
    ttlMs,
  }), false);
  assert.equal(isExpiredUnreferencedR2Object({
    object: { ...staleManaged, lastModified: new Date(now - ttlMs + 1) },
    referencedKeys: new Set(),
    now,
    ttlMs,
  }), false);
  assert.equal(isExpiredUnreferencedR2Object({
    object: { ...staleManaged, key: "library preset/old.webp" },
    referencedKeys: new Set(),
    now,
    ttlMs,
  }), false);
});
