/*
 * Flow: Legacy compatibility adapter for the old sync prompt compiler.
 * 1. Build a degraded V2 plan without server-side model interpretation.
 * 2. Compile the canonical provider prompt through Prompt Engine V2.
 * 3. Map V2 output back into the historical worker-facing shape.
 */

import { compileFinalPromptCompatibility } from "../compat";
import type { EnhanceLandscapePromptInput, EnhanceLandscapePromptResult } from "./types";

export function compileFinalPrompt(input: EnhanceLandscapePromptInput): EnhanceLandscapePromptResult {
  return compileFinalPromptCompatibility(input);
}
