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

import type { PdfCoverage, PdfSource } from "./pdfNavigation";
import { cloudStudyEnabled, GUEST_OWNER_ID, requireStudySaveAccount, usesCloudStudy } from "./studyStorage";

const DB_NAME = "zhiyi-xidian-db";
const DB_VERSION = 3;

const VOCAB_STORE = "vocabulary";
const WRONG_ANSWER_STORE = "wrong_answers";
const LESSON_STORE = "lesson_records";
const OWNER_ID_INDEX = "ownerId";
const VOCAB_DUE_INDEX = "ownerId_nextReviewAt";
const MIGRATION_FLAG_PREFIX = "auth-migrated:";
const MIGRATION_FLAG_VERSION = "v1";

export { GUEST_OWNER_ID } from "./studyStorage";
export type StudyItemId = number | string;

/* ========== Types ========== */

export interface VocabItem {
  id?: StudyItemId;
  ownerId: string;
  term_fr: string;
  term_zh: string;
  definition_zh: string;
  source: string;
  language?: "fr" | "en";
  lesson?: string;
  createdAt: number;
  nextReviewAt: number;
  reviewCount: number;
}

export interface WrongAnswerItem {
  id?: StudyItemId;
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
  answerIndex?: number;
  selectedIndex?: number;
  language?: "zh" | "fr" | "en";
  explanation?: string;
  source?: string;
  lesson?: string;
  createdAt: number;
  resolved: boolean;
}

export interface LessonRecord {
  id: string;
  ownerId: string;
  lesson: string;
  title: string;
  kind: "pdf" | "translation" | "live";
  markdown: string;
  updatedAt: number;
  pdf?: {
    file?: File;
    fileName?: string;
    fileSize?: number;
    page: number;
    summary: string | null;
    coverage: PdfCoverage | null;
    messages: Array<{ role: "user" | "assistant"; content: string; sources?: PdfSource[]; error?: boolean }>;
  };
}

interface OwnerScopedRecord {
  id?: number | string;
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

function nextVocabReview(item: VocabItem, remembered: boolean) {
  const reviewCount = remembered ? item.reviewCount + 1 : Math.max(0, item.reviewCount - 1);
  return { reviewCount, nextReviewAt: getNextReviewTime(reviewCount) };
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

      if (!db.objectStoreNames.contains(LESSON_STORE)) {
        db.createObjectStore(LESSON_STORE, { keyPath: "id" }).createIndex(OWNER_ID_INDEX, OWNER_ID_INDEX);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onblocked = () => reject(new Error("请刷新其他智译西电标签页后重试。"));
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
  id: number | string
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
): Promise<StudyItemId> {
  requireStudySaveAccount(ownerId);
  const record: VocabItem = {
    ...item, ownerId, createdAt: Date.now(), nextReviewAt: getNextReviewTime(0), reviewCount: 0,
  };
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).saveCloudVocab(record);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOCAB_STORE, "readwrite");
    const store = tx.objectStore(VOCAB_STORE);

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllVocabs(ownerId: string): Promise<VocabItem[]> {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).listCloudItems<VocabItem>(ownerId, VOCAB_STORE);
  return getAllByOwner<VocabItem>(VOCAB_STORE, ownerId);
}

export async function getVocabsDueForReview(ownerId: string): Promise<VocabItem[]> {
  if (usesCloudStudy(ownerId)) {
    return (await import("./cloudStudy")).listCloudItems<VocabItem>(ownerId, VOCAB_STORE, Date.now());
  }
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
  id: StudyItemId,
  remembered: boolean
): Promise<void> {
  requireStudySaveAccount(ownerId);
  if (usesCloudStudy(ownerId)) {
    return (await import("./cloudStudy")).updateCloudItem<VocabItem>(
      ownerId, VOCAB_STORE, id, (item) => nextVocabReview(item, remembered),
    );
  }
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

      Object.assign(item, nextVocabReview(item, remembered));

      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeVocab(ownerId: string, id: StudyItemId): Promise<void> {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).removeCloudItem(ownerId, VOCAB_STORE, id);
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

export async function isVocabExists(ownerId: string, term: string, lesson = "", language = "fr"): Promise<boolean> {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).cloudVocabExists(ownerId, term, lesson, language);
  const items = await getAllVocabs(ownerId);
  return items.some((item) => item.term_fr === term && (item.lesson ?? "") === lesson &&
    (item.language ?? "fr") === language);
}

/* ========== Wrong Answers CRUD ========== */

export async function addWrongAnswer(
  ownerId: string,
  item: Omit<WrongAnswerItem, "id" | "ownerId" | "createdAt" | "resolved">
): Promise<StudyItemId> {
  requireStudySaveAccount(ownerId);
  const record: WrongAnswerItem = { ...item, ownerId, createdAt: Date.now(), resolved: false };
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).saveCloudWrongAnswer(record);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRONG_ANSWER_STORE, "readwrite");
    const store = tx.objectStore(WRONG_ANSWER_STORE);

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllWrongAnswers(ownerId: string): Promise<WrongAnswerItem[]> {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).listCloudItems<WrongAnswerItem>(ownerId, WRONG_ANSWER_STORE);
  return getAllByOwner<WrongAnswerItem>(WRONG_ANSWER_STORE, ownerId);
}

export async function resolveWrongAnswer(ownerId: string, id: StudyItemId): Promise<void> {
  requireStudySaveAccount(ownerId);
  if (usesCloudStudy(ownerId)) {
    return (await import("./cloudStudy")).updateCloudItem<WrongAnswerItem>(
      ownerId, WRONG_ANSWER_STORE, id, () => ({ resolved: true }),
    );
  }
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

export async function removeWrongAnswer(ownerId: string, id: StudyItemId): Promise<void> {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).removeCloudItem(ownerId, WRONG_ANSWER_STORE, id);
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

export async function saveLessonRecord(record: LessonRecord) {
  requireStudySaveAccount(record.ownerId);
  if (usesCloudStudy(record.ownerId)) return (await import("./cloudStudy")).saveCloudLesson(record);
  const db = await openDB();
  try {
    const tx = db.transaction(LESSON_STORE, "readwrite");
    const done = waitForTransaction(tx);
    const store = tx.objectStore(LESSON_STORE);
    const lookup = store.get(record.id);
    lookup.onsuccess = () => {
      const prior = lookup.result as LessonRecord | undefined;
      if (prior && prior.ownerId !== record.ownerId) {
        tx.abort();
      } else if (!prior || prior.updatedAt <= record.updatedAt) {
        store.put(record);
      }
    };
    await done;
  } finally {
    db.close();
  }
}

export async function getLessonRecords(ownerId: string) {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).listCloudLessons(ownerId);
  return getAllByOwner<LessonRecord>(LESSON_STORE, ownerId);
}

export async function getLessonRecord(ownerId: string, id: string) {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).readCloudLesson(ownerId, id);
  return getOwnedRecord<LessonRecord>(LESSON_STORE, ownerId, id);
}

export async function removeLessonRecord(ownerId: string, id: string) {
  if (usesCloudStudy(ownerId)) return (await import("./cloudStudy")).removeCloudLesson(ownerId, id);
  const db = await openDB();
  try {
    const tx = db.transaction(LESSON_STORE, "readwrite");
    const done = waitForTransaction(tx);
    const store = tx.objectStore(LESSON_STORE);
    const lookup = store.get(id);
    lookup.onsuccess = () => {
      if (lookup.result?.ownerId === ownerId) store.delete(id);
    };
    await done;
  } finally {
    db.close();
  }
}

export async function importLocalStudyRecords(ownerId: string, includeGuest: boolean) {
  if (!usesCloudStudy(ownerId)) throw new Error("请登录后使用云端学习记录。");
  const cloud = await import("./cloudStudy");
  const sources = includeGuest ? [ownerId, GUEST_OWNER_ID] : [ownerId];
  let count = 0;
  for (const source of sources) {
    const [vocab, wrong, lessons] = await Promise.all([
      getAllByOwner<VocabItem>(VOCAB_STORE, source),
      getAllByOwner<WrongAnswerItem>(WRONG_ANSWER_STORE, source),
      getAllByOwner<LessonRecord>(LESSON_STORE, source),
    ]);
    for (const item of vocab) await cloud.saveCloudVocab({ ...item, ownerId });
    for (const item of wrong) await cloud.saveCloudWrongAnswer({ ...item, ownerId }, item);
    for (const item of lessons) await cloud.saveCloudLesson({ ...item, ownerId }, true);
    count += vocab.length + wrong.length + lessons.length;
  }
  return count;
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
  if (cloudStudyEnabled || !uid || uid === GUEST_OWNER_ID || typeof window === "undefined") {
    return;
  }

  const flagKey = `${MIGRATION_FLAG_PREFIX}${uid}:${MIGRATION_FLAG_VERSION}`;
  if (localStorage.getItem(flagKey) === "1") {
    return;
  }

  const db = await openDB();
  try {
    const stores = [VOCAB_STORE, WRONG_ANSWER_STORE, LESSON_STORE];
    const tx = db.transaction(stores, "readwrite");
    for (const store of stores) migrateOwnerScopeInStore(tx.objectStore(store), uid);
    await waitForTransaction(tx);
    localStorage.setItem(flagKey, "1");
  } finally {
    db.close();
  }
}
