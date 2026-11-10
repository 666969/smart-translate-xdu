"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText, Trash2 } from "lucide-react";
import type { LessonRecord } from "@/lib/db";
import { downloadMarkdownFile } from "@/lib/markdownExport";
import MarkdownRenderer from "./MarkdownRenderer";

const kinds = { pdf: "PDF 课件", live: "课堂字幕", translation: "翻译笔记" };

export default function LessonArchive({ records, onRemove }: {
  records: LessonRecord[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!records.length) return <div className="rounded-2xl border border-card-border bg-white p-6 text-sm leading-6 text-text-muted">
    这里会显示保存的课件、翻译笔记和课堂字幕。可以通过导航栏的「当前课节」给学习内容分组。
  </div>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {[...records].sort((a, b) => b.updatedAt - a.updatedAt).map((record) => (
        <article key={record.id} className="rounded-2xl border border-card-border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-1.5 font-semibold"><FileText size={16} className="shrink-0 text-primary" />
                <span className="break-words">{record.title}</span>
              </h3>
              <p className="mt-1 text-xs text-text-muted">{kinds[record.kind]} · {record.lesson || "未分类"} · {new Date(record.updatedAt).toLocaleDateString("zh-CN")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {record.pdf && <Link className="rounded-lg bg-primary/10 px-3 py-1.5 font-medium text-primary"
                href={"/pdf?lessonPdf=" + encodeURIComponent(record.id)}>继续读课件</Link>}
              <button className="rounded-lg border border-card-border px-3 py-1.5" onClick={() => setOpened(opened === record.id ? null : record.id)}>
                {opened === record.id ? "收起记录" : "查看记录"}
              </button>
              <button className="rounded-lg border border-card-border p-1.5" title="导出记录" aria-label="导出记录"
                onClick={() => downloadMarkdownFile("智译西电_课程记录", record.markdown)}><Download size={15} /></button>
              <button className="rounded-lg border border-card-border p-1.5 text-rose-700" title="删除记录" aria-label="删除记录"
                onClick={() => { setError(""); setConfirming(record.id); }}><Trash2 size={15} /></button>
            </div>
          </div>
          {confirming === record.id && <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-rose-700">删除这条本地记录？</span>
            <button className="rounded-md bg-rose-600 px-2 py-1 text-white" onClick={() => {
              setConfirming(null);
              void onRemove(record.id).catch(() => setError("暂时无法删除，请重试。"));
            }}>确认删除</button>
            <button className="text-text-muted" onClick={() => setConfirming(null)}>取消</button>
          </div>}
          {opened === record.id && <div className="mt-3 max-h-[60vh] overflow-auto border-t border-card-border pt-3">
            <MarkdownRenderer content={record.markdown} />
          </div>}
        </article>
      ))}
    </div>
  );
}
