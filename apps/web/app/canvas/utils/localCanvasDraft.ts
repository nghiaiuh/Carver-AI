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
const LOCAL_DRAFT_DB_VERSION = 3;
const DRAFT_META_STORE_NAME = "draftMeta";
const DRAFT_OPERATION_STORE_NAME = "draftOperations";
const DRAFT_CHECKPOINT_STORE_NAME = "draftCheckpoints";
const DRAFT_OPERATIONS_BY_KEY_INDEX = "byDraftKey";


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
  clientId?: string;
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

function getLegacyDraftKey(userId: string, projectId: string) {
  return `carver:canvasDraft:${userId}:${projectId}`;
}

function getDraftKey(userId: string, projectId: string, clientId?: string) {
  return clientId
    ? `${getLegacyDraftKey(userId, projectId)}:client:${clientId}`
    : getLegacyDraftKey(userId, projectId);
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

export async function loadCanvasDraft(userId: string, projectId: string, clientId?: string) {
  const draftKey = getDraftKey(userId, projectId, clientId);
  const record = await withDatabase("readonly", (stores) => readDraftRecord(stores, draftKey));

  if (!record.meta.projectId || !record.meta.userId) {
    if (!clientId) {
      return null;
    }

    // Version 2 kept one shared document per project. Preserve it as a
    // checkpoint branch for this tab instead of deleting it during migration.
    const legacyKey = getLegacyDraftKey(userId, projectId);
    const legacyRecord = await withDatabase("readonly", (stores) => readDraftRecord(stores, legacyKey));
    if (!legacyRecord.meta.projectId || !legacyRecord.meta.userId) {
      return null;
    }

    const migrated = await withDatabase("readwrite", async (stores) => {
      const now = new Date().toISOString();
      const meta: LocalCanvasDraftMeta = {
        ...legacyRecord.meta,
        tabId: clientId,
        clientId,
        updatedAt: now,
        expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
        // The legacy materialized document becomes a recovery checkpoint.
        operationCount: 0,
      };
      await requestToPromise(stores.checkpointStore.put({
        key: draftKey,
        checkpoint: {
          document: legacyRecord.document,
          documentHash: legacyRecord.meta.documentHash,
          createdAt: now,
        },
      } satisfies LocalCanvasDraftCheckpointStoreRecord));
      await requestToPromise(stores.metaStore.put({
        key: draftKey,
        meta,
      } satisfies LocalCanvasDraftMetaStoreRecord));
      return {
        key: draftKey,
        meta,
        document: legacyRecord.document,
        pendingOperations: [],
      } satisfies LocalCanvasDraftRecord;
    });
    return migrated;
  }

  if (isExpired(record.meta.expiresAt)) {
    await clearCanvasDraft(userId, projectId, clientId);
    return null;
  }

  return record;
}

export async function initializeCanvasDraftBranch(
  userId: string,
  projectId: string,
  params: {
    clientId: string;
    document: CanvasSnapshotDocument;
    documentHash: string;
    basedOnSnapshotId: string | null;
    basedOnVersion: number | null;
    basedOnHash: string | null;
    cloudDraftRevision: number | null;
    cloudDraftHash: string | null;
  },
) {
  const draftKey = getDraftKey(userId, projectId, params.clientId);
  return withDatabase("readwrite", async (stores) => {
    const existing = await readDraftRecord(stores, draftKey);
    if (existing.meta.projectId) return existing;
    const updatedAt = new Date().toISOString();
    const meta: LocalCanvasDraftMeta = {
      projectId,
      userId,
      tabId: params.clientId,
      clientId: params.clientId,
      updatedAt,
      expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
      basedOnSnapshotId: params.basedOnSnapshotId,
      basedOnVersion: params.basedOnVersion,
      basedOnHash: params.basedOnHash,
      documentHash: params.documentHash,
      lastSequence: 0,
      operationCount: 0,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash,
      lastMutationId: null,
    };
    await requestToPromise(stores.checkpointStore.put({
      key: draftKey,
      checkpoint: { document: params.document, documentHash: params.documentHash, createdAt: updatedAt },
    } satisfies LocalCanvasDraftCheckpointStoreRecord));
    await requestToPromise(stores.metaStore.put({ key: draftKey, meta } satisfies LocalCanvasDraftMetaStoreRecord));
    return { key: draftKey, meta, document: params.document, pendingOperations: [] } satisfies LocalCanvasDraftRecord;
  });
}

export async function saveCanvasDraft(
  userId: string,
  projectId: string,
  document: CanvasSnapshotDocument,
  meta: Omit<LocalCanvasDraftMeta, "projectId" | "userId" | "lastSequence" | "operationCount"> &
    Partial<Pick<LocalCanvasDraftMeta, "lastSequence" | "operationCount">>,
) {
  const draftKey = getDraftKey(userId, projectId, meta.tabId);

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
      clientId: meta.tabId,
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

    // Pending operations must remain individually addressable until the server
    // acknowledges their IDs. Compaction is performed by acknowledge below,
    // never while a local operation could still be lost in transit.
    const shouldCompact = false;

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

export async function acknowledgeCanvasDraftOperations(
  userId: string,
  projectId: string,
  params: {
    clientId: string;
    operationIds: string[];
    cloudDraftRevision: number;
    cloudDraftHash: string | null;
    lastMutationId?: string | null;
  },
) {
  const draftKey = getDraftKey(userId, projectId, params.clientId);
  const acknowledged = new Set(params.operationIds);

  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    if (!currentRecord.meta.projectId) {
      return null;
    }

    const allRecords = await getOperationRecordsForDraft(stores.operationStore, draftKey);
    const acknowledgedOperations = allRecords
      .filter((record) => acknowledged.has(record.operationId))
      .map((record) => record.operation)
      .sort((left, right) => left.sequence - right.sequence);
    const currentCheckpoint = (await requestToPromise(
      stores.checkpointStore.get(draftKey),
    )) as LocalCanvasDraftCheckpointStoreRecord | undefined;
    const checkpointDocument = applyCanvasDraftOperations(
      currentCheckpoint?.checkpoint.document ?? coerceCanvasSnapshotDocument(undefined),
      acknowledgedOperations,
    );

    for (const record of allRecords) {
      if (acknowledged.has(record.operationId)) {
        await requestToPromise(stores.operationStore.delete(record.operationId));
      }
    }

    const updatedAt = new Date().toISOString();
    const nextMeta: LocalCanvasDraftMeta = {
      ...currentRecord.meta,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash,
      lastMutationId: params.lastMutationId ?? currentRecord.meta.lastMutationId,
      updatedAt,
      expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
      operationCount: Math.max(0, currentRecord.pendingOperations.length - acknowledgedOperations.length),
    };
    await requestToPromise(stores.checkpointStore.put({
      key: draftKey,
      checkpoint: {
        document: checkpointDocument,
        documentHash: params.cloudDraftHash ?? currentCheckpoint?.checkpoint.documentHash ?? "",
        createdAt: updatedAt,
      },
    } satisfies LocalCanvasDraftCheckpointStoreRecord));
    await requestToPromise(stores.metaStore.put({
      key: draftKey,
      meta: nextMeta,
    } satisfies LocalCanvasDraftMetaStoreRecord));

    return readDraftRecord(stores, draftKey);
  });
}

export async function applyRemoteCanvasDraftOperations(
  userId: string,
  projectId: string,
  params: {
    clientId: string;
    operations: CanvasDraftOperation[];
    cloudDraftRevision: number;
    cloudDraftHash?: string | null;
  },
) {
  const draftKey = getDraftKey(userId, projectId, params.clientId);
  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    if (!currentRecord.meta.projectId) return null;
    const currentCheckpoint = (await requestToPromise(
      stores.checkpointStore.get(draftKey),
    )) as LocalCanvasDraftCheckpointStoreRecord | undefined;
    const checkpointDocument = applyCanvasDraftOperations(
      currentCheckpoint?.checkpoint.document ?? coerceCanvasSnapshotDocument(undefined),
      params.operations,
    );
    const updatedAt = new Date().toISOString();
    const nextMeta: LocalCanvasDraftMeta = {
      ...currentRecord.meta,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash ?? currentRecord.meta.cloudDraftHash,
      updatedAt,
      expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
    };
    await requestToPromise(stores.checkpointStore.put({
      key: draftKey,
      checkpoint: {
        document: checkpointDocument,
        documentHash: nextMeta.cloudDraftHash ?? currentCheckpoint?.checkpoint.documentHash ?? "",
        createdAt: updatedAt,
      },
    } satisfies LocalCanvasDraftCheckpointStoreRecord));
    await requestToPromise(stores.metaStore.put({
      key: draftKey,
      meta: nextMeta,
    } satisfies LocalCanvasDraftMetaStoreRecord));
    return readDraftRecord(stores, draftKey);
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
  clientId?: string,
) {
  const draftKey = getDraftKey(userId, projectId, clientId);

  return withDatabase("readwrite", async (stores) => {
    const currentRecord = await readDraftRecord(stores, draftKey);
    if (!currentRecord.meta.projectId) {
      return null;
    }

    const currentMutationId = currentRecord.meta.lastMutationId;
    const acknowledgedMutationId = params.lastMutationId;
    const hasNewerLocalMutation =
      Boolean(currentRecord.meta.documentHash && params.cloudDraftHash) &&
      currentRecord.meta.documentHash !== params.cloudDraftHash;

    const nextMeta: LocalCanvasDraftMeta = {
      ...currentRecord.meta,
      cloudDraftRevision: params.cloudDraftRevision,
      cloudDraftHash: params.cloudDraftHash,
      // A late cloud acknowledgement must not replace a newer local mutation.
      lastMutationId: hasNewerLocalMutation
        ? currentMutationId
        : (acknowledgedMutationId ?? currentMutationId ?? null),
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
  clientId?: string,
) {
  const draftKey = getDraftKey(userId, projectId, clientId ?? params.tabId);

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

export async function clearCanvasDraft(userId: string, projectId: string, clientId?: string) {
  const draftKey = getDraftKey(userId, projectId, clientId);

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
