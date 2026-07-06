/*
 * Route: API chat cho canvas editor.
 * Thuoc: module tro ly AI / hoi thoai theo canvas.
 * Vai tro: lam dau moi doc, ghi va xoa lich su chat gan voi `canvasId` / `projectId`.
 * Chuc nang:
 * - `GET`: lay lich su chat hien co.
 * - `POST`: gui prompt + anh tham chieu den AI va luu cap tin nhan user/assistant.
 * - `DELETE`: xoa lich su chat cua canvas hoac project hien tai.
 */

import { NextResponse } from "next/server";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../_lib/authz";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";
import {
  appendProjectChatExchange,
  clearProjectChatMessages,
  listProjectChatMessages,
} from "../../../lib/server/projectChatHistory";
import { createChatCompletion, type ChatInputImage } from "../../../lib/server/openaiChat";

function readChatInputImages(body: Record<string, unknown>) {
  const value = body.images;
  if (!Array.isArray(value)) {
    return [] as ChatInputImage[];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const imageUrl = typeof candidate.imageUrl === "string" ? candidate.imageUrl.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : undefined;
    const source =
      candidate.source === "attachment" ||
      candidate.source === "canvas-target" ||
      candidate.source === "canvas-reference" ||
      candidate.source === "preset-reference"
        ? candidate.source
        : undefined;

    if (!imageUrl) {
      return [];
    }

    return [{ imageUrl, label, source } satisfies ChatInputImage];
  });
}

function getProjectIdFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("projectId")?.trim() || undefined;
}

export async function GET(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const projectId = getProjectIdFromUrl(request);
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    const messages = await listProjectChatMessages(context.supabase, projectResult.project.id);

    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat history right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const content = stringValue(body, "content");
  const canvasId = stringValue(body, "canvasId") ?? "canvas-main";
  const projectId = stringValue(body, "projectId") ?? getProjectIdFromUrl(request);
  const images = readChatInputImages(body);

  if (!content && images.length === 0) {
    return badRequest("content or images are required");
  }

  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    const history = await listProjectChatMessages(context.supabase, projectResult.project.id);
    const messageContent =
      content ?? "Describe these image references for landscape design context.";

    const assistantContent = await createChatCompletion({
      message: messageContent,
      history,
      images,
    });
    const { userMessage, assistantMessage } = await appendProjectChatExchange(
      context.supabase,
      projectResult.project.id,
      {
        canvasId,
        images: images.map((image) => ({
          label: image.label,
          source: image.source,
        })),
        userMessage: messageContent,
        assistantMessage: assistantContent,
      },
    );

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Carver AI could not answer right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const projectId = getProjectIdFromUrl(request);
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    await clearProjectChatMessages(context.supabase, projectResult.project.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear chat history right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
