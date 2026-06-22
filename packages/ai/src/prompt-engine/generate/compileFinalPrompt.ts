/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import { enhanceLandscapePrompt } from "./enhanceLandscapePrompt";
import type { EnhanceLandscapePromptInput, EnhanceLandscapePromptResult } from "./types";

export function compileFinalPrompt(input: EnhanceLandscapePromptInput): EnhanceLandscapePromptResult {
  return enhanceLandscapePrompt(input);
}

