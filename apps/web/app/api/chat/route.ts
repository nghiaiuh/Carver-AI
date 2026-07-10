/*
 * Route: API chat cho canvas editor.
 * Thuoc: module tro ly AI / hoi thoai theo canvas.
 * Vai tro: lam dau moi doc, ghi va xoa lich su chat gan voi project hien tai.
 * Chuc nang:
 * - `GET`: lay lich su chat hien co.
 * - `POST`: gui prompt + anh tham chieu den AI hoac enqueue generation job neu prompt muon tao/chinh anh.
 * - `DELETE`: xoa lich su chat cua project hien tai.
 */

import {
  clearProjectChatHistory,
  loadProjectChatHistory,
  sendChatMessage,
} from "../../../lib/server/chatService";
import { requireRequestContext } from "../_lib/authz";
import { readJsonObject } from "../_lib/http";

function getProjectIdFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("projectId")?.trim() || undefined;
}

export async function GET(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const result = await loadProjectChatHistory({
    context,
    requestUrl: request.url,
    projectId: getProjectIdFromUrl(request),
  });
  if (!result.ok) {
    return result.response;
  }

  return Response.json(result.data);
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const result = await sendChatMessage({ request, context, body });
  if (!result.ok) {
    return result.response;
  }

  return Response.json(result.data, {
    headers: result.headers,
    status: result.status,
  });
}

export async function DELETE(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const result = await clearProjectChatHistory({
    context,
    projectId: getProjectIdFromUrl(request),
  });
  if (!result.ok) {
    return result.response;
  }

  return Response.json(result.data);
}
