/*
 * Flow: Owns shared storage and library server infrastructure.
 * 1. Expose R2 helpers used by web and worker.
 * 2. Expose library domain services without Next-specific request objects.
 * 3. Keep storage-heavy orchestration out of apps/web ownership.
 */

export * from "./r2";
export * from "./library";
export * from "./librarySync";
export * from "./imageData";
