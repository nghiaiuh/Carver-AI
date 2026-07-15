"use client";

import {
  applyCanvasDraftOperations,
  buildCanvasDraftOperations,
  coerceCanvasSnapshotDocument,
  type CanvasDraftCheckpoint,
  type CanvasDraftOperation,
  type CanvasSnapshotDocument,
} from "@carver/shared";

const LOCAL_DRAFT_DB_NAME = "carver-canvas-drafts";
const LOCAL_DRAFT_DB_VERSION = 2;
const DRAFT_META_STORE_NAME = "draftMeta";
const DRAFT_OPERATION_STORE_NAME = "draftOperations";
const DRAFT_CHECKPOINT_STORE_NAME = "draftCheckpoints";
const DRAFT_OPERATIONS_BY_KEY_INDEX = "byDraftKey";

const MAX_DRAFT_OPERATION_COUNT = 100;
const MAX_DRAFT_OPERATION_BYTES = 1_000_000;

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
  lastSequence: number;
  operationCount: number;
  cloudDraftRevision: number | null;
  cloudDraftHash: string | null;
  lastMutationId: string | null;
};

type LocalCanvasDraftMetaStoreRecord = {
  key: string;
  meta: LocalCanvasDraftMeta;
};

type LocalCanvasDraftCheckpointStoreRecord = {
  key: string;
  checkpoint: CanvasDraftCheckpoint;
};

type LocalCanvasDraftOperationStoreRecord = {
  operationId: string;
  draftKey: string;
  operation: CanvasDraftOperation;
};

export type LocalCanvasDraftRecord = {
  key: string;
  meta: LocalCanvasDraftMeta;
  document: CanvasSnapshotDocument;
  pendingOperations: CanvasDraftOperation[];
};

function getDraftKey(userId: string, projectId: string) {
  return `carver:canvasDraft:${userId}:${projectId}`;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DRAFT_DB_NAME, LOCAL_DRAFT_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (database.objectStoreNames.contains("drafts")) {
        database.deleteObjectStore("drafts");
      }

      if (!database.objectStoreNames.contains(DRAFT_META_STORE_NAME)) {
        database.createObjectStore(DRAFT_META_STORE_NAME, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(DRAFT_CHECKPOINT_STORE_NAME)) {
        database.createObjectStore(DRAFT_CHECKPOINT_STORE_NAME, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(DRAFT_OPERATION_STORE_NAME)) {
        const operationStore = database.createObjectStore(DRAFT_OPERATION_STORE_NAME, {
          keyPath: "operationId",
        });
        operationStore.createIndex(DRAFT_OPERATIONS_BY_KEY_INDEX, "draftKey", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local draft database."));
  });
}

async function withDatabase<T>(
  mode: IDBTransactionMode,
  action: (stores: {
    metaStore: IDBObjectStore;
    checkpointStore: IDBObjectStore;
    operationStore: IDBObjectStore;
  }) => Promise<T> | T,
) {
  const database = await openDraftDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(
      [DRAFT_META_STORE_NAME, DRAFT_CHECKPOINT_STORE_NAME, DRAFT_OPERATION_STORE_NAME],
      mode,
    );
    const stores = {
      metaStore: transaction.objectStore(DRAFT_META_STORE_NAME),
      checkpointStore: transaction.objectStore(DRAFT_CHECKPOINT_STORE_NAME),
      operationStore: transaction.objectStore(DRAFT_OPERATION_STORE_NAME),
    };

    Promise.resolve(action(stores))
      .then((result) => {
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
        };
      })
      .catch((error) => {
        database.close();
        reject(error);
      });
  });
}

function isExpired(expiresAt: string, now = Date.now()) {
  const expiresAtTime = Date.parse(expiresAt);
  return Number.isFinite(expiresAtTime) && expiresAtTime <= now;
}

async function getOperationRecordsForDraft(
  operationStore: IDBObjectStore,
  draftKey: string,
) {
  const index = operationStore.index(DRAFT_OPERATIONS_BY_KEY_INDEX);
  return (await requestToPromise(
    index.getAll(IDBKeyRange.only(draftKey)),
  )) as LocalCanvasDraftOperationStoreRecord[];
}

function materializeDraftRecord(params: {
  draftKey: string;
  metaRecord: LocalCanvasDraftMetaStoreRecord | undefined;
  checkpointRecord: LocalCanvasDraftCheckpointStoreRecord | undefined;
  operationRecords: LocalCanvasDraftOperationStoreRecord[];
}) {
  const checkpointDocument =
    params.checkpointRecord?.checkpoint.document ?? coerceCanvasSnapshotDocument(undefined);
  const pendingOperations = params.operationRecords
    .map((record) => record.operation)
    .sort((left, right) => left.sequence - right.sequence);
  const document = applyCanvasDraftOperations(checkpointDocument, pendingOperations);

  return {
    key: params.draftKey,
    meta:
      params.metaRecord?.meta ??
      ({
        projectId: "",
        userId: "",
        tabId: "",
        updatedAt: new Date(0).toISOString(),
        expiresAt: new Date(0).toISOString(),
        basedOnSnapshotId: null,
        basedOnVersion: null,
        basedOnHash: null,
        documentHash: params.checkpointRecord?.checkpoint.documentHash ?? "",
        lastSequence: 0,
        operationCount: pendingOperations.length,
        cloudDraftRevision: null,
        cloudDraftHash: null,
        lastMutationId: null,
      } satisfies LocalCanvasDraftMeta),
    document,
    pendingOperations,
  } satisfies LocalCanvasDraftRecord;
}

function estimateOperationsSize(operations: CanvasDraftOperation[]) {
  return new TextEncoder().encode(JSON.stringify(operations)).byteLength;
}

async function deleteDraftOperationRecords(
  operationStore: IDBObjectStore,
  draftKey: string,
) {
  const records = await getOperationRecordsForDraft(operationStore, draftKey);
  await Promise.all(records.map((record) => requestToPromise(operationStore.delete(record.operationId))));
}

async function readDraftRecord(stores: {
  metaStore: IDBObjectStore;
  checkpointStore: IDBObjectStore;
  operationStore: IDBObjectStore;
}, draftKey: string) {
  const [metaRecord, checkpointRecord, operationRecords] = await Promise.all([
    requestToPromise(stores.metaStore.get(draftKey)) as Promise<LocalCanvasDraftMetaStoreRecord | undefined>,
    requestToPromise(stores.checkpointStore.get(draftKey)) as Promise<LocalCanvasDraftCheckpointStoreRecord | undefined>,
    getOperationRecordsForDraft(stores.operationStore, draftKey),
  ]);

  return materializeDraftRecord({
    draftKey,
    metaRecord,
    checkpointRecord,
    operationRecords,
  });
}

export async function loadCanvasDraft(userId: string, projectId: string) {
  const draftKey = getDraftKey(userId, projectId);
  const record = await withDatabase("readonly", (stores) => readDraftRecord(stores, draftKey));

  if (!record.meta.projectId || !record.meta.userId) {
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
  meta: Omit<LocalCanvasDraftMeta, "projectId" | "userId" | "lastSequence" | "operationCount"> &
    Partial<Pick<LocalCanvasDraftMeta, "lastSequence" | "operationCount">>,
) {
  const draftKey = getDraftKey(userId, projectId);

  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    const previousDocument = currentRecord.meta.projectId
      ? currentRecord.document
      : coerceCanvasSnapshotDocument(undefined);
    const { operations, nextSequence } = buildCanvasDraftOperations({
      previousDocument,
      nextDocument: document,
      projectId,
      tabId: meta.tabId,
      baseRevision: meta.cloudDraftRevision ?? currentRecord.meta.cloudDraftRevision ?? null,
      sequenceStart: currentRecord.meta.lastSequence ?? 0,
    });

    for (const operation of operations) {
      await requestToPromise(
        stores.operationStore.put({
          operationId: operation.operationId,
          draftKey,
          operation,
        } satisfies LocalCanvasDraftOperationStoreRecord),
      );
    }

    const nextMeta: LocalCanvasDraftMeta = {
      projectId,
      userId,
      tabId: meta.tabId,
      updatedAt: meta.updatedAt,
      expiresAt: meta.expiresAt,
      basedOnSnapshotId: meta.basedOnSnapshotId,
      basedOnVersion: meta.basedOnVersion,
      basedOnHash: meta.basedOnHash,
      documentHash: meta.documentHash,
      lastSequence: nextSequence,
      operationCount: currentRecord.pendingOperations.length + operations.length,
      cloudDraftRevision: meta.cloudDraftRevision ?? currentRecord.meta.cloudDraftRevision ?? null,
      cloudDraftHash: meta.cloudDraftHash ?? currentRecord.meta.cloudDraftHash ?? null,
      lastMutationId: meta.lastMutationId ?? currentRecord.meta.lastMutationId ?? null,
    };

    const shouldCompact =
      nextMeta.operationCount >= MAX_DRAFT_OPERATION_COUNT ||
      estimateOperationsSize([...currentRecord.pendingOperations, ...operations]) >=
        MAX_DRAFT_OPERATION_BYTES;

    if (shouldCompact || !currentRecord.meta.projectId) {
      await deleteDraftOperationRecords(stores.operationStore, draftKey);
      await requestToPromise(
        stores.checkpointStore.put({
          key: draftKey,
          checkpoint: {
            document,
            documentHash: meta.documentHash,
            createdAt: meta.updatedAt,
          },
        } satisfies LocalCanvasDraftCheckpointStoreRecord),
      );
      nextMeta.operationCount = 0;
    } else if (!currentRecord.meta.projectId) {
      await requestToPromise(
        stores.checkpointStore.put({
          key: draftKey,
          checkpoint: {
            document: previousDocument,
            documentHash: currentRecord.meta.documentHash || meta.basedOnHash || meta.documentHash,
            createdAt: meta.updatedAt,
          },
        } satisfies LocalCanvasDraftCheckpointStoreRecord),
      );
    }

    await requestToPromise(
      stores.metaStore.put({
        key: draftKey,
        meta: nextMeta,
      } satisfies LocalCanvasDraftMetaStoreRecord),
    );

    return materializeDraftRecord({
      draftKey,
      metaRecord: {
        key: draftKey,
        meta: nextMeta,
      },
      checkpointRecord: shouldCompact
        ? {
            key: draftKey,
            checkpoint: {
              document,
              documentHash: meta.documentHash,
              createdAt: meta.updatedAt,
            },
          }
        : (await requestToPromise(
            stores.checkpointStore.get(draftKey),
          )) as LocalCanvasDraftCheckpointStoreRecord | undefined,
      operationRecords: shouldCompact
        ? []
        : await getOperationRecordsForDraft(stores.operationStore, draftKey),
    });
  });
}

export async function recordCanvasDraftCloudSync(
  userId: string,
  projectId: string,
  params: {
    cloudDraftRevision: number;
    cloudDraftHash: string | null;
    lastMutationId: string | null;
  },
) {
  const draftKey = getDraftKey(userId, projectId);

  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    if (!currentRecord.meta.projectId) {
      return null;
    }

    const nextMeta: LocalCanvasDraftMeta = {
      ...currentRecord.meta,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash,
      lastMutationId: params.lastMutationId,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
    };

    await requestToPromise(
      stores.metaStore.put({
        key: draftKey,
        meta: nextMeta,
      } satisfies LocalCanvasDraftMetaStoreRecord),
    );

    return {
      ...currentRecord,
      meta: nextMeta,
    } satisfies LocalCanvasDraftRecord;
  });
}

export async function markCanvasDraftClean(
  userId: string,
  projectId: string,
  params: Pick<
    LocalCanvasDraftMeta,
    | "basedOnSnapshotId"
    | "basedOnVersion"
    | "basedOnHash"
    | "documentHash"
    | "tabId"
    | "cloudDraftRevision"
    | "cloudDraftHash"
    | "lastMutationId"
  >,
) {
  const draftKey = getDraftKey(userId, projectId);

  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    if (!currentRecord.meta.projectId) {
      return null;
    }

    await deleteDraftOperationRecords(stores.operationStore, draftKey);

    const updatedAt = new Date().toISOString();
    const nextMeta: LocalCanvasDraftMeta = {
      ...currentRecord.meta,
      tabId: params.tabId,
      basedOnSnapshotId: params.basedOnSnapshotId,
      basedOnVersion: params.basedOnVersion,
      basedOnHash: params.basedOnHash,
      documentHash: params.documentHash,
      updatedAt,
      expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
      lastSequence: currentRecord.meta.lastSequence,
      operationCount: 0,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash,
      lastMutationId: params.lastMutationId,
    };

    await requestToPromise(
      stores.checkpointStore.put({
        key: draftKey,
        checkpoint: {
          document: currentRecord.document,
          documentHash: params.documentHash,
          createdAt: updatedAt,
        },
      } satisfies LocalCanvasDraftCheckpointStoreRecord),
    );

    await requestToPromise(
      stores.metaStore.put({
        key: draftKey,
        meta: nextMeta,
      } satisfies LocalCanvasDraftMetaStoreRecord),
    );

    return {
      key: draftKey,
      meta: nextMeta,
      document: currentRecord.document,
      pendingOperations: [],
    } satisfies LocalCanvasDraftRecord;
  });
}

export async function clearCanvasDraft(userId: string, projectId: string) {
  const draftKey = getDraftKey(userId, projectId);

  await withDatabase("readwrite", async (stores) => {
    await Promise.all([
      requestToPromise(stores.metaStore.delete(draftKey)),
      requestToPromise(stores.checkpointStore.delete(draftKey)),
      deleteDraftOperationRecords(stores.operationStore, draftKey),
    ]);
  });
}

export async function pruneExpiredCanvasDrafts(userId?: string) {
  await withDatabase("readwrite", async (stores) => {
    const metaRecords = (await requestToPromise(
      stores.metaStore.getAll(),
    )) as LocalCanvasDraftMetaStoreRecord[];

    const expiredDraftKeys = metaRecords
      .filter(
        (record) =>
          (!userId || record.meta.userId === userId) &&
          isExpired(record.meta.expiresAt),
      )
      .map((record) => record.key);

    for (const draftKey of expiredDraftKeys) {
      await Promise.all([
        requestToPromise(stores.metaStore.delete(draftKey)),
        requestToPromise(stores.checkpointStore.delete(draftKey)),
        deleteDraftOperationRecords(stores.operationStore, draftKey),
      ]);
    }
  });
}
