"use client";

import { useState } from "react";
import { BookMarked } from "lucide-react";
import { useLesson } from "@/hooks/useLesson";

export default function LessonPicker() {
  const { lesson, setLesson, loading } = useLesson();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        title={lesson || "设置当前课节"}
        aria-expanded={isOpen}
        disabled={loading}
        onClick={() => { setDraft(lesson); setError(false); setIsOpen(!isOpen); }}
        className="inline-flex max-w-40 items-center gap-1.5 rounded-full border border-card-border bg-white px-2.5 py-2 text-xs text-primary disabled:opacity-50"
      >
        <BookMarked size={14} className="shrink-0" />
        <span className="truncate">{lesson || "当前课节"}</span>
      </button>
      {isOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try { setLesson(draft); setIsOpen(false); }
            catch { setError(true); }
          }}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-card-border bg-white p-3 shadow-lg"
        >
          <label htmlFor="current-lesson" className="text-sm font-medium">当前课节</label>
          <input id="current-lesson" value={draft} onChange={(event) => setDraft(event.target.value)}
            maxLength={80} placeholder="如 模拟电子技术 · 第 5 讲"
            className="mt-2 w-full rounded-lg border border-card-border px-2.5 py-2 text-sm" />
          <p className="mt-2 text-xs text-text-muted">接下来保存的学习记录会归到这里。留空可返回未分类。</p>
          {error && <p role="alert" className="mt-2 text-xs text-rose-700">浏览器当前无法保存课节。</p>}
          <button className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">应用课节</button>
        </form>
      )}
    </div>
  );
}
