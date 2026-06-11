import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ChatHistoryRole = "user" | "assistant";

export type ChatHistoryRecord = {
  id: string;
  projectId?: string;
  canvasId?: string;
  role: ChatHistoryRole;
  content: string;
  createdAt: string;
};

const CHAT_HISTORY_PATH = path.join(process.cwd(), "data", "chat-history.json");

async function ensureChatHistoryFile() {
  await mkdir(path.dirname(CHAT_HISTORY_PATH), { recursive: true });

  try {
    await readFile(CHAT_HISTORY_PATH, "utf8");
  } catch {
    await writeFile(CHAT_HISTORY_PATH, "[]\n", "utf8");
  }
}

export async function readChatHistory(): Promise<ChatHistoryRecord[]> {
  await ensureChatHistoryFile();

  const raw = await readFile(CHAT_HISTORY_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((record): record is ChatHistoryRecord => {
      if (!record || typeof record !== "object") return false;

      const candidate = record as Partial<ChatHistoryRecord>;

      return (
        typeof candidate.id === "string" &&
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        typeof candidate.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

async function writeChatHistory(records: ChatHistoryRecord[]) {
  await ensureChatHistoryFile();
  await writeFile(CHAT_HISTORY_PATH, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

export async function getChatHistoryForCanvas(canvasId?: string, projectId?: string) {
  const records = await readChatHistory();

  return records.filter((record) => {
    if (projectId && record.projectId !== projectId) {
      return false;
    }

    if (canvasId && record.canvasId !== canvasId) {
      return false;
    }

    if (!projectId && !canvasId) {
      return !record.projectId && !record.canvasId;
    }

    return true;
  });
}

export async function appendChatHistory(recordsToAppend: ChatHistoryRecord[]) {
  const currentRecords = await readChatHistory();
  await writeChatHistory([...currentRecords, ...recordsToAppend]);
}

export async function clearChatHistoryForCanvas(canvasId?: string, projectId?: string) {
  const currentRecords = await readChatHistory();
  const nextRecords = currentRecords.filter((record) => {
    if (projectId && record.projectId === projectId) {
      return false;
    }

    if (canvasId && record.canvasId === canvasId) {
      return false;
    }

    if (!projectId && !canvasId && !record.projectId && !record.canvasId) {
      return false;
    }

    return true;
  });

  await writeChatHistory(nextRecords);
}
