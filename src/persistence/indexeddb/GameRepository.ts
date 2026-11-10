import { migrateSave } from "../migrations/migrateSave.ts";
import type { GameState } from "../../domain/economy/types.ts";

const DATABASE_NAME = "anime-fanservice-clicker";
const DATABASE_VERSION = 1;
const SAVE_STORE = "saves";
const BACKUP_STORE = "backups";
const ACTIVE_SAVE_KEY = "active";

interface RecoveredBackup {
  id: string;
  createdAtMs: number;
  reason: string;
  value: unknown;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export interface SaveLoadResult {
  state: GameState | null;
  recoveredFromInvalidSave: boolean;
}

export class GameRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async load(nowMs = Date.now()): Promise<SaveLoadResult> {
    const database = await this.openDatabase();
    const readTransaction = database.transaction(SAVE_STORE, "readonly");
    const rawRequest = readTransaction
      .objectStore(SAVE_STORE)
      .get(ACTIVE_SAVE_KEY);
    const [raw] = await Promise.all([
      requestResult(rawRequest),
      transactionComplete(readTransaction),
    ]);

    if (raw === undefined)
      return { state: null, recoveredFromInvalidSave: false };

    try {
      return {
        state: migrateSave(raw, nowMs),
        recoveredFromInvalidSave: false,
      };
    } catch (error) {
      await this.archiveInvalidSave(raw, error, nowMs);
      return { state: null, recoveredFromInvalidSave: true };
    }
  }

  async save(state: GameState): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(SAVE_STORE, "readwrite");
    const done = transactionComplete(transaction);
    transaction.objectStore(SAVE_STORE).put(state, ACTIVE_SAVE_KEY);
    await done;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new Error("IndexedDB is not available in this browser context."),
      );
    }

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SAVE_STORE))
          database.createObjectStore(SAVE_STORE);
        if (!database.objectStoreNames.contains(BACKUP_STORE)) {
          database.createObjectStore(BACKUP_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open IndexedDB."));
      request.onblocked = () =>
        reject(new Error("IndexedDB upgrade is blocked by another open tab."));
    });
    return this.databasePromise;
  }

  private async archiveInvalidSave(
    raw: unknown,
    error: unknown,
    nowMs: number,
  ): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [SAVE_STORE, BACKUP_STORE],
      "readwrite",
    );
    const done = transactionComplete(transaction);
    const uniqueId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const backup: RecoveredBackup = {
      id: `recovered-${nowMs}-${uniqueId}`,
      createdAtMs: nowMs,
      reason:
        error instanceof Error ? error.message : "Save could not be migrated.",
      value: raw,
    };
    transaction.objectStore(BACKUP_STORE).put(backup);
    transaction.objectStore(SAVE_STORE).delete(ACTIVE_SAVE_KEY);
    await done;
  }
}
