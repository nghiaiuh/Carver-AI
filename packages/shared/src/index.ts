/*
 * Flow: Shares stable Carver AI contracts across apps and packages.
 * 1. Define snapshot and AI job types once.
 * 2. Reuse them in web routes, workers, and AI orchestration.
 * 3. Keep cross-package data contracts versioned and explicit.
 */

export * from "./snapshot";
export * from "./canvas-draft";
export * from "./prompt-engine";
export * from "./ai-jobs";
export * from "./api-schemas";
export * from "./assistant-output";
export * from "./constants";
export * from "./image-generator";
export * from "./novel-view";
export * from "./camera-normalization";
export type { OpenAIHttpTransport } from "./openai-transport";
export * from "./safe-logger";
export * from "./operational-alert";
