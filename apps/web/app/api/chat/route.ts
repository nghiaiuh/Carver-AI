import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";
import {
  appendChatHistory,
  clearChatHistoryForCanvas,
  getChatHistoryForCanvas,
  type ChatHistoryRecord,
} from "../../../lib/server/chatHistory";
import { createChatCompletion } from "../../../lib/server/openaiChat";

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

  if (!content) {
    return badRequest("content is required");
  }

  const history = await getChatHistoryForCanvas(canvasId, projectId);

  try {
    const assistantContent = await createChatCompletion({
      message: content,
      history,
      canvasId,
      projectId,
    });

    const createdAt = new Date().toISOString();
    const userMessage: ChatHistoryRecord = {
      id: randomUUID(),
      canvasId,
      projectId,
      role: "user",
      content,
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
