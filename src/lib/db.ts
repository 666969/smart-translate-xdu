/**
 * IndexedDB 存储层 — 零依赖实现
 * 
 * 两张 objectStore:
 *   vocabulary    - 收藏的法语术语卡片（含艾宾浩斯复习时间）
 *   wrong_answers - 答错的 Quiz 题目
 */

const DB_NAME = "zhiyi-xidian-db";
const DB_VERSION = 1;

/* ========== Types ========== */

export interface VocabItem {
  id?: number;
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

function getNextReviewTime(reviewCount: number): number {
  const interval = REVIEW_INTERVALS[Math.min(reviewCount, REVIEW_INTERVALS.length - 1)];
  return Date.now() + interval * 60 * 1000;
}

/* ========== DB Connection ========== */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("vocabulary")) {
        const vocabStore = db.createObjectStore("vocabulary", {
          keyPath: "id",
          autoIncrement: true,
        });
        vocabStore.createIndex("term_fr", "term_fr", { unique: false });
        vocabStore.createIndex("nextReviewAt", "nextReviewAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("wrong_answers")) {
        db.createObjectStore("wrong_answers", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ========== Vocabulary CRUD ========== */

export async function addVocab(item: Omit<VocabItem, "id" | "createdAt" | "nextReviewAt" | "reviewCount">): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readwrite");
    const store = tx.objectStore("vocabulary");

    const record: VocabItem = {
      ...item,
      createdAt: Date.now(),
      nextReviewAt: getNextReviewTime(0),
      reviewCount: 0,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllVocabs(): Promise<VocabItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readonly");
    const store = tx.objectStore("vocabulary");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getVocabsDueForReview(): Promise<VocabItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readonly");
    const store = tx.objectStore("vocabulary");
    const index = store.index("nextReviewAt");
    const range = IDBKeyRange.upperBound(Date.now());
    const request = index.getAll(range);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markVocabReviewed(id: number, remembered: boolean): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readwrite");
    const store = tx.objectStore("vocabulary");
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result as VocabItem | undefined;
      if (!item) {
        reject(new Error("Vocab not found"));
        return;
      }

      if (remembered) {
        item.reviewCount += 1;
        item.nextReviewAt = getNextReviewTime(item.reviewCount);
      } else {
        // Reset to earlier interval
        item.reviewCount = Math.max(0, item.reviewCount - 1);
        item.nextReviewAt = getNextReviewTime(item.reviewCount);
      }

      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeVocab(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readwrite");
    const store = tx.objectStore("vocabulary");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function isVocabExists(term_fr: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vocabulary", "readonly");
    const store = tx.objectStore("vocabulary");
    const index = store.index("term_fr");
    const request = index.getAll(term_fr);
    request.onsuccess = () => resolve(request.result.length > 0);
    request.onerror = () => reject(request.error);
  });
}

/* ========== Wrong Answers CRUD ========== */

export async function addWrongAnswer(
  item: Omit<WrongAnswerItem, "id" | "createdAt" | "resolved">
): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("wrong_answers", "readwrite");
    const store = tx.objectStore("wrong_answers");

    const record: WrongAnswerItem = {
      ...item,
      createdAt: Date.now(),
      resolved: false,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllWrongAnswers(): Promise<WrongAnswerItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("wrong_answers", "readonly");
    const store = tx.objectStore("wrong_answers");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function resolveWrongAnswer(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("wrong_answers", "readwrite");
    const store = tx.objectStore("wrong_answers");
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result as WrongAnswerItem | undefined;
      if (!item) {
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

export async function removeWrongAnswer(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("wrong_answers", "readwrite");
    const store = tx.objectStore("wrong_answers");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
