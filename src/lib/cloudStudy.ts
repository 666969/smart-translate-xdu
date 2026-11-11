import {
  collection, doc, getDoc, getDocs, initializeFirestore,
  query, runTransaction, where, type Firestore, type DocumentData,
  type DocumentReference, type Transaction,
} from "firebase/firestore/lite";
import { app, auth } from "./firebase";
import type { LessonRecord, StudyItemId, VocabItem, WrongAnswerItem } from "./db";

type ItemStore = "vocabulary" | "wrong_answers";
type StudyStore = ItemStore | "lesson_records";

let firestore: Firestore | undefined;

export function getStudyFirestore() {
  if (!app) throw new Error("账号服务尚未配置。");
  return firestore ??= initializeFirestore(app, {
    ...(typeof window !== "undefined" ? {
      host: window.location.host + "/api/firebase-relay/firestore",
      ssl: window.location.protocol === "https:",
    } : {}),
    ignoreUndefinedProperties: true,
  });
}

function records(ownerId: string, store: StudyStore) {
  if (auth?.currentUser?.uid !== ownerId) throw new Error("请重新登录后访问云端记录。");
  return collection(getStudyFirestore(), "zhiyiUsers", ownerId, store);
}

async function fingerprint(values: (string | number | undefined)[]) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function vocabularyId(term: string, lesson: string, language: string) {
  return fingerprint([language, lesson, term]);
}

export async function cloudVocabExists(ownerId: string, term: string, lesson: string, language: string) {
  const key = await vocabularyId(term, lesson, language);
  return (await getDoc(doc(records(ownerId, "vocabulary"), key))).exists();
}

async function createItem<T extends VocabItem | WrongAnswerItem>(
  record: T,
  store: ItemStore,
  id: string,
) {
  const ref = doc(records(record.ownerId, store), id);
  await runTransaction(ref.firestore, async (transaction) => {
    if (!(await transaction.get(ref)).exists()) transaction.set(ref, { ...record, id });
  });
  return id;
}

export async function saveCloudVocab(record: VocabItem) {
  const id = await vocabularyId(record.term_fr, record.lesson ?? "", record.language ?? "fr");
  return createItem(record, "vocabulary", id);
}

export async function saveCloudWrongAnswer(record: WrongAnswerItem, original?: WrongAnswerItem) {
  const id = original
    ? "import-" + await fingerprint([original.ownerId, original.id, original.createdAt, original.question_zh])
    : crypto.randomUUID();
  return createItem(record, "wrong_answers", id);
}

export async function listCloudItems<T extends VocabItem | WrongAnswerItem>(ownerId: string, store: ItemStore, dueAt?: number) {
  const collectionRef = records(ownerId, store);
  const result = await getDocs(dueAt === undefined ? collectionRef : query(collectionRef, where("nextReviewAt", "<=", dueAt)));
  return result.docs.map((item) => ({ ...item.data(), id: item.id } as T))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function updateCloudItem<T extends VocabItem | WrongAnswerItem>(
  ownerId: string, store: ItemStore, id: StudyItemId, update: (record: T) => Partial<T>
) {
  const ref = doc(records(ownerId, store), String(id));
  await runTransaction(ref.firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("这条云端记录已不存在。");
    transaction.set(ref, update(snapshot.data() as T), { merge: true });
  });
}

export async function removeCloudItem(ownerId: string, store: ItemStore, id: StudyItemId) {
  const ref = doc(records(ownerId, store), String(id));
  await runTransaction(ref.firestore, async (transaction) => {
    if ((await transaction.get(ref)).exists()) transaction.delete(ref);
  });
}

const MAX_INLINE_BYTES = 800_000;
const MAX_RECORD_BYTES = 6_000_000;
const CHUNK_LENGTH = 220_000;
const MAX_CHUNKS = 32;

interface LessonHeader {
  ownerId: string;
  updatedAt: number;
  partCount: number;
  payload: string;
}

function lessonPayload(record: LessonRecord) {
  if (!record.pdf) return JSON.stringify(record);
  const { file, ...pdf } = record.pdf;
  return JSON.stringify({
    ...record,
    pdf: { ...pdf, fileName: file?.name ?? pdf.fileName ?? record.title, fileSize: file?.size ?? pdf.fileSize },
  });
}

function splitPayload(text: string) {
  const size = new TextEncoder().encode(text).byteLength;
  if (size > MAX_RECORD_BYTES) throw new Error("这条文字记录过长，请拆分后保存。");
  if (size <= MAX_INLINE_BYTES) return [];
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + CHUNK_LENGTH);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text.charAt(end - 1))) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  if (chunks.length > MAX_CHUNKS) throw new Error("这条文字记录过长，请拆分后保存。");
  return chunks;
}

function partRef(parent: DocumentReference, index: number) {
  return doc(parent, "parts", String(index));
}

function partCount(header: DocumentData | undefined) {
  const value = header?.partCount ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > MAX_CHUNKS) throw new Error("这条云端记录的格式不正确。");
  return value as number;
}

export async function saveCloudLesson(record: LessonRecord, importOnly = false) {
  const ref = doc(records(record.ownerId, "lesson_records"), record.id);
  const payload = lessonPayload(record);
  const chunks = splitPayload(payload);
  await runTransaction(ref.firestore, async (transaction) => {
    const previous = (await transaction.get(ref)).data();
    if (previous && (importOnly || previous.updatedAt > record.updatedAt)) return;
    const header: LessonHeader = {
      ownerId: record.ownerId, updatedAt: record.updatedAt, partCount: chunks.length,
      payload: chunks.length ? "" : payload,
    };
    transaction.set(ref, header);
    chunks.forEach((text, index) => transaction.set(partRef(ref, index), { text }));
    for (let index = chunks.length; index < partCount(previous); index += 1) {
      transaction.delete(partRef(ref, index));
    }
  });
}

async function readLessonInTransaction(transaction: Transaction, ref: DocumentReference) {
  const data = (await transaction.get(ref)).data();
  if (!data) return null;
  const parts = partCount(data);
  if (!parts) return JSON.parse(data.payload) as LessonRecord;
  const rows = await Promise.all(Array.from({ length: parts }, (_, index) => transaction.get(partRef(ref, index))));
  const payload = rows.map((row) => {
    const text = row.data()?.text;
    if (typeof text !== "string") throw new Error("这条云端记录缺少文字内容。");
    return text;
  }).join("");
  return JSON.parse(payload) as LessonRecord;
}

export function readCloudLesson(ownerId: string, id: string) {
  const ref = doc(records(ownerId, "lesson_records"), id);
  return runTransaction(ref.firestore, (transaction) => readLessonInTransaction(transaction, ref));
}

export async function listCloudLessons(ownerId: string) {
  const rows = await getDocs(records(ownerId, "lesson_records"));
  const lessons = await Promise.all(rows.docs.map((row) => {
    const header = row.data();
    return partCount(header) ? readCloudLesson(ownerId, row.id) : JSON.parse(header.payload) as LessonRecord;
  }));
  return lessons.filter((record): record is LessonRecord => record !== null);
}

export async function removeCloudLesson(ownerId: string, id: string) {
  const ref = doc(records(ownerId, "lesson_records"), id);
  await runTransaction(ref.firestore, async (transaction) => {
    const data = (await transaction.get(ref)).data();
    if (!data) return;
    for (let index = 0; index < partCount(data); index += 1) transaction.delete(partRef(ref, index));
    transaction.delete(ref);
  });
}
