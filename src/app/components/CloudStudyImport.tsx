"use client";

import { useState } from "react";
import { importLocalStudyRecords } from "@/lib/db";
import { studySaveError } from "@/lib/studyStorage";

export default function CloudStudyImport({ ownerId, onImported }: { ownerId: string; onImported: () => Promise<void> }) {
  const [includeGuest, setIncludeGuest] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");

  async function importRecords() {
    if (importing) return;
    setImporting(true);
    setNotice("");
    try {
      const count = await importLocalStudyRecords(ownerId, includeGuest);
      setNotice(count ? "已核对 " + count + " 条本机记录，可以在云端笔记本里查看。" : "当前浏览器没有可导入的记录。");
      await onImported();
    } catch (error) {
      setNotice(studySaveError(error, ownerId) + " 再次导入时会跳过云端已有的记录。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-card-border bg-white p-4 text-sm">
      <h2 className="font-semibold text-primary">云端学习记录</h2>
      <p className="mt-1 leading-6 text-text-muted">登录后保存的生词、错题、文字笔记和字幕，可以在其他设备上查看。</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium text-primary">导入此浏览器里的旧记录</summary>
        <p className="mt-2 text-xs leading-5 text-text-muted">导入会上传已保存的文字内容。课件原文件在继续阅读时重新选择。</p>
        <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={includeGuest} disabled={importing} onChange={(event) => setIncludeGuest(event.target.checked)} />
          也导入此浏览器的访客记录
        </label>
        <button type="button" onClick={() => void importRecords()} disabled={importing}
          className="mt-3 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          {importing ? "导入中…" : "导入到我的云端笔记本"}
        </button>
        {notice && <p role="status" className="mt-2 text-xs leading-5 text-text-muted">{notice}</p>}
      </details>
    </section>
  );
}
