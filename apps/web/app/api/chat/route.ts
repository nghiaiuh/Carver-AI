/*
 * Route: API chat cho canvas editor.
 * Thuoc: module tro ly AI / hoi thoai theo canvas.
 * Vai tro: lam dau moi doc, ghi va xoa lich su chat gan voi `canvasId` / `projectId`.
 * Chuc nang:
 * - `GET`: lay lich su chat hien co.
 * - `POST`: gui prompt + anh tham chieu den AI va luu cap tin nhan user/assistant.
 * - `DELETE`: xoa lich su chat cua canvas hoac project hien tai.
 */

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";
import {
  appendChatHistory,
  clearChatHistoryForCanvas,
  getChatHistoryForCanvas,
  type ChatHistoryRecord,
} from "../../../lib/server/chatHistory";
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

function getCanvasIdFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("canvasId")?.trim() || "canvas-main";
}

function getProjectIdFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("projectId")?.trim() || undefined;
}

export async function GET(request: Request) {
  const canvasId = getCanvasIdFromUrl(request);
  const projectId = getProjectIdFromUrl(request);
  const messages = await getChatHistoryForCanvas(canvasId, projectId);

  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const content = stringValue(body, "content");
  const canvasId = stringValue(body, "canvasId") ?? "canvas-main";
  const projectId = stringValue(body, "projectId");
  const images = readChatInputImages(body);

  if (!content && images.length === 0) {
    return badRequest("content or images are required");
  }

  const history = await getChatHistoryForCanvas(canvasId, projectId);

  try {
    const messageContent =
      content ?? "Describe these image references for landscape design context.";

    const assistantContent = await createChatCompletion({
      message: messageContent,
      history,
      canvasId,
      projectId,
      images,
    });

    const createdAt = new Date().toISOString();
    const userMessage: ChatHistoryRecord = {
      id: randomUUID(),
      canvasId,
      projectId,
      role: "user",
      content: messageContent,
      createdAt,
    };
    const assistantMessage: ChatHistoryRecord = {
      id: randomUUID(),
      canvasId,
      projectId,
      role: "assistant",
      content: assistantContent,
      createdAt: new Date().toISOString(),
    };

    await appendChatHistory([userMessage, assistantMessage]);

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
  const canvasId = getCanvasIdFromUrl(request);
  const projectId = getProjectIdFromUrl(request);

  await clearChatHistoryForCanvas(canvasId, projectId);

  return NextResponse.json({ ok: true });
}
