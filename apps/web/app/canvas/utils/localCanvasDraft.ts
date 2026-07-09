"use client";

import type { CanvasSnapshotDocument } from "@carver/shared";

const LOCAL_DRAFT_DB_NAME = "carver-canvas-drafts";
const LOCAL_DRAFT_DB_VERSION = 1;
const LOCAL_DRAFT_STORE_NAME = "drafts";

export const LOCAL_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LocalCanvasDraftMeta = {
  projectId: string;
  userId: string;
  tabId: string;
  updatedAt: string;
  expiresAt: string;
  basedOnSnapshotId: string | null;
  basedOnVersion: number | null;
  basedOnHash: string | null;
  documentHash: string;
};

export type LocalCanvasDraftRecord = {
  key: string;
  meta: LocalCanvasDraftMeta;
  document: CanvasSnapshotDocument;
};

function getDraftKey(userId: string, projectId: string) {
  return `carver:canvasDraft:${userId}:${projectId}`;
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DRAFT_DB_NAME, LOCAL_DRAFT_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_DRAFT_STORE_NAME)) {
        database.createObjectStore(LOCAL_DRAFT_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local draft database."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T> | T,
) {
  const database = await openDraftDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(LOCAL_DRAFT_STORE_NAME, mode);
    const store = transaction.objectStore(LOCAL_DRAFT_STORE_NAME);

    Promise.resolve(action(store))
      .then((result) => {
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
      })
      .catch((error) => {
        database.close();
        reject(error);
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function isExpired(expiresAt: string, now = Date.now()) {
  const expiresAtTime = Date.parse(expiresAt);
  return Number.isFinite(expiresAtTime) && expiresAtTime <= now;
}

export async function loadCanvasDraft(userId: string, projectId: string) {
  const record = await withStore("readonly", (store) =>
    requestToPromise(store.get(getDraftKey(userId, projectId))),
  ) as LocalCanvasDraftRecord | undefined;

  if (!record) {
    return null;
  }

  if (isExpired(record.meta.expiresAt)) {
    await clearCanvasDraft(userId, projectId);
    return null;
  }

  return record;
}

export async function saveCanvasDraft(
  userId: string,
  projectId: string,
  document: CanvasSnapshotDocument,
  meta: Omit<LocalCanvasDraftMeta, "projectId" | "userId">,
) {
  const record: LocalCanvasDraftRecord = {
    key: getDraftKey(userId, projectId),
    meta: {
      ...meta,
      projectId,
      userId,
    },
    document,
  };

  await withStore("readwrite", (store) => requestToPromise(store.put(record)));
  return record;
}

export async function markCanvasDraftClean(
  userId: string,
  projectId: string,
  params: Pick<LocalCanvasDraftMeta, "basedOnSnapshotId" | "basedOnVersion" | "basedOnHash" | "documentHash" | "tabId">,
) {
  const current = await loadCanvasDraft(userId, projectId);
  if (!current) {
    return null;
  }

  return saveCanvasDraft(userId, projectId, current.document, {
    ...current.meta,
    ...params,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
  });
}

export async function clearCanvasDraft(userId: string, projectId: string) {
  await withStore("readwrite", (store) =>
    requestToPromise(store.delete(getDraftKey(userId, projectId))),
  );
}

export async function pruneExpiredCanvasDrafts(userId?: string) {
  await withStore("readwrite", async (store) => {
    const allRecords = await requestToPromise(store.getAll()) as LocalCanvasDraftRecord[];
    await Promise.all(
      allRecords
        .filter((record) => (!userId || record.meta.userId === userId) && isExpired(record.meta.expiresAt))
        .map((record) => requestToPromise(store.delete(record.key))),
    );
  });
}
