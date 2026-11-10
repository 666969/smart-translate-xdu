"use client";

import { useCallback, useSyncExternalStore } from "react";
import { resolveOwnerId } from "@/lib/db";
import { cloudStudyEnabled } from "@/lib/studyStorage";
import { useAuth } from "./useAuth";

const changeEvent = "zhiyi-lesson-change";
const activeCloudLessons = new Map<string, string>();

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useLesson() {
  const { uid, loading } = useAuth();
  const ownerId = resolveOwnerId(uid);
  const key = "zhiyi-current-lesson:" + ownerId;
  const read = useCallback(() => {
    if (cloudStudyEnabled) return activeCloudLessons.get(ownerId) ?? "";
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key, ownerId]);
  const lesson = useSyncExternalStore(subscribe, read, () => "");
  const setLesson = useCallback((value: string) => {
    const title = value.trim().slice(0, 80);
    if (cloudStudyEnabled) activeCloudLessons.set(ownerId, title);
    else if (title) localStorage.setItem(key, title);
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(changeEvent));
  }, [key, ownerId]);
  return { ownerId, lesson, setLesson, loading };
}
