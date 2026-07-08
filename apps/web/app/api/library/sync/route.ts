/*
 * Route: Deprecated manual R2 library sync.
 * Thuoc: library compatibility layer.
 * Vai tro: chan FE/client cu goi sync truc tiep; worker moi la owner cua R2 sync.
 */

import { apiFailure, createRequestId } from "../../_lib/http";

export async function POST(request: Request) {
  return apiFailure(
    "LIBRARY_SYNC_MOVED_TO_WORKER",
    "Manual R2 library sync is disabled. The worker syncs R2 assets into the library automatically.",
    410,
    createRequestId(request),
  );
}
