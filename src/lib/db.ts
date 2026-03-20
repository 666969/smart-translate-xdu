/**
 * IndexedDB 存储层 — 零依赖实现
 *
 * 两张 objectStore:
 *   vocabulary    - 收藏的法语术语卡片（含艾宾浩斯复习时间）
 *   wrong_answers - 答错的 Quiz 题目
 *
 * 所有持久化数据都按 ownerId 隔离：
 *   - 未登录：guest
 *   - 已登录：Firebase user.uid
 */

const DB_NAME = "zhiyi-xidian-db";
const DB_VERSION = 2;

const VOCAB_STORE = "vocabulary";
const WRONG_ANSWER_STORE = "wrong_answers";
const OWNER_ID_INDEX = "ownerId";
const VOCAB_DUE_INDEX = "ownerId_nextReviewAt";
const MIGRATION_FLAG_PREFIX = "auth-migrated:";
const MIGRATION_FLAG_VERSION = "v1";

export const GUEST_OWNER_ID = "guest";

/* ========== Types ========== */

export interface VocabItem {
  id?: number;
  ownerId: string;
  term_fr: string;
  term_zh: string;
  definition_zh: string;
  source: string; // e.g. "snippet", "glossary"
  createdAt: number;
  nextReviewAt: number;
  reviewCount: number;
}

export interface WrongAnswerItem {
  id?: number;
  ownerId: string;
  question_fr: string;
  question_zh: string;
  question_en: string;
  options_fr: string[];
  options_zh: string[];
  options_en: string[];
  answer_fr: string;
  answer_zh: string;
  answer_en: string;
  wrongOption: string;
  createdAt: number;
  resolved: boolean;
}

interface OwnerScopedRecord {
  id?: number;
  ownerId?: string;
}

/* ========== Ebbinghaus intervals (minutes) ========== */

const REVIEW_INTERVALS = [
  20,            // 20 min
  60,            // 1 h
  9 * 60,        // 9 h
  24 * 60,       // 1 day
  2 * 24 * 60,   // 2 days
  6 * 24 * 60,   // 6 days
  31 * 24 * 60,  // 31 days
];

export function resolveOwnerId(uid?: string | null) {
  return uid || GUEST_OWNER_ID;
}

function getNextReviewTime(reviewCount: number): number {
  const interval = REVIEW_INTERVALS[Math.min(reviewCount, REVIEW_INTERVALS.length - 1)];
  return Date.now() + interval * 60 * 1000;
}

function ensureVocabStoreIndexes(store: IDBObjectStore) {
  if (!store.indexNames.contains("term_fr")) {
    store.createIndex("term_fr", "term_fr", { unique: false });
  }

  if (!store.indexNames.contains("nextReviewAt")) {
    store.createIndex("nextReviewAt", "nextReviewAt", { unique: false });
  }

  if (!store.indexNames.contains(OWNER_ID_INDEX)) {
    store.createIndex(OWNER_ID_INDEX, OWNER_ID_INDEX, { unique: false });
  }

  if (!store.indexNames.contains(VOCAB_DUE_INDEX)) {
    store.createIndex(VOCAB_DUE_INDEX, [OWNER_ID_INDEX, "nextReviewAt"], {
      unique: false,
    });
  }
}

function ensureWrongAnswerStoreIndexes(store: IDBObjectStore) {
  if (!store.indexNames.contains(OWNER_ID_INDEX)) {
    store.createIndex(OWNER_ID_INDEX, OWNER_ID_INDEX, { unique: false });
  }
}

function backfillOwnerId(store: IDBObjectStore) {
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      return;
    }

    const value = cursor.value as OwnerScopedRecord;
    if (!value.ownerId) {
      cursor.update({ ...value, ownerId: GUEST_OWNER_ID });
    }
    cursor.continue();
  };
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ========== DB Connection ========== */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;

      if (!tx) {
        return;
      }

      const vocabStore = db.objectStoreNames.contains(VOCAB_STORE)
        ? tx.objectStore(VOCAB_STORE)
        : db.createObjectStore(VOCAB_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });

      ensureVocabStoreIndexes(vocabStore);
      backfillOwnerId(vocabStore);

      const wrongAnswerStore = db.objectStoreNames.contains(WRONG_ANSWER_STORE)
        ? tx.objectStore(WRONG_ANSWER_STORE)
        : db.createObjectStore(WRONG_ANSWER_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });

      ensureWrongAnswerStoreIndexes(wrongAnswerStore);
      backfillOwnerId(wrongAnswerStore);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllByOwner<T>(storeName: string, ownerId: string): Promise<T[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.index(OWNER_ID_INDEX).getAll(ownerId);

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function getOwnedRecord<T extends OwnerScopedRecord>(
  storeName: string,
  ownerId: string,
  id: number
): Promise<T | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result as T | undefined;
      if (!result || resolveOwnerId(result.ownerId) !== ownerId) {
        resolve(null);
        return;
      }

      resolve(result);
    };

    request.onerror = () => reject(request.error);
  });
}

/* ========== Vocabulary CRUD ========== */

export async function addVocab(
  ownerId: string,
  item: Omit<VocabItem, "id" | "ownerId" | "createdAt" | "nextReviewAt" | "reviewCount">
): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOCAB_STORE, "readwrite");
    const store = tx.objectStore(VOCAB_STORE);

    const record: VocabItem = {
      ...item,
      ownerId,
      createdAt: Date.now(),
      nextReviewAt: getNextReviewTime(0),
      reviewCount: 0,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllVocabs(ownerId: string): Promise<VocabItem[]> {
  return getAllByOwner<VocabItem>(VOCAB_STORE, ownerId);
}

export async function getVocabsDueForReview(ownerId: string): Promise<VocabItem[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOCAB_STORE, "readonly");
    const store = tx.objectStore(VOCAB_STORE);

    if (!store.indexNames.contains(VOCAB_DUE_INDEX)) {
      void getAllVocabs(ownerId)
        .then((items) => resolve(items.filter((item) => item.nextReviewAt <= Date.now())))
        .catch(reject);
      return;
    }

    const request = store
      .index(VOCAB_DUE_INDEX)
      .getAll(IDBKeyRange.bound([ownerId, 0], [ownerId, Date.now()]));

    request.onsuccess = () => resolve(request.result as VocabItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function markVocabReviewed(
  ownerId: string,
  id: number,
  remembered: boolean
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOCAB_STORE, "readwrite");
    const store = tx.objectStore(VOCAB_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result as VocabItem | undefined;
      if (!item || resolveOwnerId(item.ownerId) !== ownerId) {
        reject(new Error("Vocab not found"));
        return;
      }

      if (remembered) {
        item.reviewCount += 1;
      } else {
        item.reviewCount = Math.max(0, item.reviewCount - 1);
      }
      item.nextReviewAt = getNextReviewTime(item.reviewCount);

      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeVocab(ownerId: string, id: number): Promise<void> {
  const item = await getOwnedRecord<VocabItem>(VOCAB_STORE, ownerId, id);
  if (!item) {
    throw new Error("Vocab not found");
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOCAB_STORE, "readwrite");
    const store = tx.objectStore(VOCAB_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function isVocabExists(ownerId: string, term_fr: string): Promise<boolean> {
  const items = await getAllVocabs(ownerId);
  return items.some((item) => item.term_fr === term_fr);
}

/* ========== Wrong Answers CRUD ========== */

export async function addWrongAnswer(
  ownerId: string,
  item: Omit<WrongAnswerItem, "id" | "ownerId" | "createdAt" | "resolved">
): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRONG_ANSWER_STORE, "readwrite");
    const store = tx.objectStore(WRONG_ANSWER_STORE);

    const record: WrongAnswerItem = {
      ...item,
      ownerId,
      createdAt: Date.now(),
      resolved: false,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllWrongAnswers(ownerId: string): Promise<WrongAnswerItem[]> {
  return getAllByOwner<WrongAnswerItem>(WRONG_ANSWER_STORE, ownerId);
}

export async function resolveWrongAnswer(ownerId: string, id: number): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRONG_ANSWER_STORE, "readwrite");
    const store = tx.objectStore(WRONG_ANSWER_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result as WrongAnswerItem | undefined;
      if (!item || resolveOwnerId(item.ownerId) !== ownerId) {
        reject(new Error("Wrong answer not found"));
        return;
      }

      item.resolved = true;
      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeWrongAnswer(ownerId: string, id: number): Promise<void> {
  const item = await getOwnedRecord<WrongAnswerItem>(WRONG_ANSWER_STORE, ownerId, id);
  if (!item) {
    throw new Error("Wrong answer not found");
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRONG_ANSWER_STORE, "readwrite");
    const store = tx.objectStore(WRONG_ANSWER_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ========== Guest -> User Migration ========== */

function migrateOwnerScopeInStore(store: IDBObjectStore, uid: string) {
  const cursorRequest = store.index(OWNER_ID_INDEX).openCursor(IDBKeyRange.only(GUEST_OWNER_ID));

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      return;
    }

    const record = cursor.value as OwnerScopedRecord;
    cursor.update({ ...record, ownerId: uid });
    cursor.continue();
  };
}

export async function migrateGuestDataToUser(uid: string): Promise<void> {
  if (!uid || uid === GUEST_OWNER_ID || typeof window === "undefined") {
    return;
  }

  const flagKey = `${MIGRATION_FLAG_PREFIX}${uid}:${MIGRATION_FLAG_VERSION}`;
  if (localStorage.getItem(flagKey) === "1") {
    return;
  }

  const db = await openDB();
  const tx = db.transaction([VOCAB_STORE, WRONG_ANSWER_STORE], "readwrite");

  migrateOwnerScopeInStore(tx.objectStore(VOCAB_STORE), uid);
  migrateOwnerScopeInStore(tx.objectStore(WRONG_ANSWER_STORE), uid);

  await waitForTransaction(tx);
  localStorage.setItem(flagKey, "1");
}
