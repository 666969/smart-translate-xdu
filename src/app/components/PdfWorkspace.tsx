"use client";

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Download, FileText, FileUp, Image as ImageIcon, Loader2, Save, Send, X } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { emptyPdfDetails, useAppSession } from "./AppSessionProvider";
import { getLessonRecord, saveLessonRecord, type LessonRecord } from "@/lib/db";
import { findPdfPageRequest, pdfPageTitle, resolvePdfPages, type PdfCoverage, type PdfSource } from "@/lib/pdfNavigation";
import { buildPdfStudyNoteMarkdown, downloadMarkdownFile } from "@/lib/markdownExport";
import { isPdfFile, MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_MESSAGES, MAX_PDF_BYTES, MAX_SCAN_PAGES, MAX_SCAN_REQUEST_BYTES } from "@/lib/studyLimits";
import { useLesson } from "@/hooks/useLesson";
import { studySaveError, usesCloudStudy } from "@/lib/studyStorage";

type DocumentAnswer = { reply: string; sources?: PdfSource[] };
type SummaryAnswer = { summary: string; coverage: PdfCoverage };

async function askPdf<T>(body: object, signal: AbortSignal): Promise<T> {
  const json = JSON.stringify(body);
  if (new Blob([json]).size > MAX_SCAN_REQUEST_BYTES) {
    throw new Error("请求超过大小限制，请减少选页或换用文本问答。");
  }
  const response = await fetch("/api/pdf-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error || "暂时无法完成请求，请稍后重试。");
  }
  return data;
}

function PdfPreview({ file, url, page }: { file: File; url: string; page: number }) {
  const [frame, setFrame] = useState<{ file: File; page: number; image: string } | null>(null);
  useEffect(() => {
    const request = new AbortController();
    void import("@/lib/pdfParser").then(({ renderPdfPagesToImages }) =>
      renderPdfPagesToImages(file, [page], request.signal)
    ).then(({ pages }) => {
      if (!request.signal.aborted && pages[0]) {
        setFrame({ file, page, image: pages[0].imageUrl });
      }
    }).catch(() => {
      // The built-in PDF viewer remains available if the worker cannot render the page.
    });
    return () => request.abort();
  }, [file, page]);
  return frame?.file === file && frame.page === page ? (
    /* eslint-disable-next-line @next/next/no-img-element -- local PDF rendering has no remote image URL */
    <img src={frame.image} alt={"PDF 第 " + page + " 页预览"} className="h-full w-full object-contain" />
  ) : (
    <iframe key={url + page} src={url + "#page=" + page} className="h-full w-full border-0" title="PDF Preview" />
  );
}

const button = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-card-border bg-white px-3 py-2 text-xs font-medium text-text-muted hover:text-primary disabled:opacity-50";

export default function PdfWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { pdf, pendingPdfUpload } = useAppSession();
  const { ownerId, lesson, loading: authLoading } = useLesson();
  const {
    details, setDetails, pdfFile, setPdfFile, pdfPages, setPdfPages, pdfUrl, setPdfUrl,
    pdfExtractStatus, setPdfExtractStatus, pdfExtractReason, setPdfExtractReason,
    pageCount, setPageCount, summary, setSummary, deepMode, setDeepMode,
    scanPageSelection, setScanPageSelection, chatMessages, setChatMessages, chatInput, setChatInput,
  } = pdf;
  const [imageMode, setImageMode] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [pendingPdfRecord, setPendingPdfRecord] = useState<LessonRecord | null>(null);
  const documentRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const chatBody = useRef<HTMLDivElement>(null);
  const previewSection = useRef<HTMLElement>(null);

  const activePage = details.activePage;
  const scanOnly = pdfExtractStatus === "scan_like";
  const useImages = scanOnly || imageMode;
  const canAsk = pdfExtractStatus === "text_ready" || scanOnly;

  const startDocument = () => {
    documentRef.current?.abort();
    const controller = new AbortController();
    documentRef.current = controller;
    setIsAsking(false);
    setIsSummarizing(false);
    setIsSaving(false);
    setSummaryError("");
    setFeedback("");
    return controller.signal;
  };

  const releaseCurrent = (replacement?: File) => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    if (pdfFile && pdfFile !== replacement) {
      void import("@/lib/pdfParser").then(({ releasePdf }) => releasePdf(pdfFile));
    }
  };

  const resetDocument = () => {
    startDocument();
    releaseCurrent();
    setDetails(emptyPdfDetails);
    setPdfUrl(null);
    setPdfFile(null);
    setPdfPages([]);
    setPageCount(0);
    setPdfExtractStatus("idle");
    setPdfExtractReason(null);
    setSummary(null);
    setChatMessages([]);
    setChatInput("");
    setImageMode(false);
    setScanPageSelection("");
    setPageInput("");
    setPendingPdfRecord(null);
    setIsExtracting(false);
  };

  const runSummary = async (pages: string[], labels: (string | null)[], signal: AbortSignal) => {
    setIsSummarizing(true);
    setSummaryError("");
    try {
      const data = await askPdf<SummaryAnswer>({ action: "summarize", pdfPages: pages, pageLabels: labels, deepMode }, signal);
      if (signal.aborted) return;
      setSummary(data.summary);
      setDetails((previous) => ({ ...previous, coverage: data.coverage }));
    } catch (error) {
      if (!signal.aborted) setSummaryError(error instanceof Error ? error.message : "摘要生成失败。");
    } finally {
      if (!signal.aborted) setIsSummarizing(false);
    }
  };

  const loadPdf = async (file: File, saved?: LessonRecord) => {
    if (file.size === 0 || file.size > MAX_PDF_BYTES || !isPdfFile(file)) {
      setFeedback("请选择 30 MB 以内的有效 PDF。");
      return;
    }
    const record = saved ?? pendingPdfRecord;
    const prior = record?.pdf;
    if (!saved && pendingPdfRecord && prior &&
        (file.name !== (prior.fileName ?? pendingPdfRecord.title) ||
          (typeof prior.fileSize === "number" && file.size !== prior.fileSize))) {
      setFeedback("请选择与这份笔记对应的原始 PDF。");
      return;
    }
    const signal = startDocument();
    releaseCurrent(file);
    setPendingPdfRecord(null);
    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setPdfPages([]);
    setPageCount(0);
    setPdfExtractStatus("idle");
    setPdfExtractReason(null);
    setDetails({ ...emptyPdfDetails, ownerId, activePage: prior?.page ?? 1, coverage: prior?.coverage ?? null, recordId: record?.id });
    setSummary(prior?.summary ?? null);
    setChatMessages(prior?.messages ?? []);
    setChatInput("");
    setScanPageSelection("");
    setImageMode(false);
    setPageInput("");
    setIsExtracting(true);
    try {
      const { extractTextFromPdf } = await import("@/lib/pdfParser");
      signal.throwIfAborted();
      const result = await extractTextFromPdf(file, signal);
      if (signal.aborted) return;
      setPageCount(result.pageCount);
      setPdfPages(result.pages);
      setPdfExtractStatus(result.status);
      setPdfExtractReason(result.reason ?? null);
      setDetails((previous) => ({
        ...previous,
        activePage: Math.min(previous.activePage, result.pageCount || 1),
        labels: result.labels,
      }));
      setIsExtracting(false);
      if (result.status === "text_ready" && !record) {
        void runSummary(result.pages, result.labels, signal);
      }
    } catch {
      if (signal.aborted) return;
      setPdfExtractStatus("parse_error");
      setPdfExtractReason("暂时无法提取文字。你仍可打开原始 PDF 查看课件。");
      setIsExtracting(false);
    }
  };

  const restore = useEffectEvent(async (signal: AbortSignal) => {
    const upload = pendingPdfUpload.current;
    pendingPdfUpload.current = null;
    if ((details.ownerId && details.ownerId !== ownerId) ||
        (pendingPdfRecord && pendingPdfRecord.ownerId !== ownerId)) resetDocument();
    const recordId = embedded ? null : new URLSearchParams(window.location.search).get("lessonPdf");
    if (recordId) {
      // The URL is only a hand-off from the lesson archive. Subsequent route visits use this workspace.
      window.history.replaceState(null, "", window.location.pathname);
      try {
        const record = await getLessonRecord(ownerId, recordId);
        if (signal.aborted) return;
        if (record?.pdf?.file) await loadPdf(record.pdf.file, record);
        else if (record?.pdf) {
          resetDocument();
          setPendingPdfRecord(record);
          setFeedback("已取回云端笔记。重新选择原始 PDF 后可继续翻页和提问。");
        }
        else setFeedback("当前账号找不到这份课程记录。");
      } catch {
        if (!signal.aborted) setFeedback("暂时无法打开课程记录。");
      }
    } else if (upload) {
      if (upload.ownerId === ownerId) await loadPdf(upload.file);
      else setFeedback("登录状态已改变，请重新选择 PDF。");
    } else if (pdfFile && pdfExtractStatus === "idle" && details.ownerId === ownerId) {
      await loadPdf(pdfFile);
    } else {
      documentRef.current = new AbortController();
    }
  });

  useEffect(() => {
    const lifetime = new AbortController();
    if (!authLoading) {
      queueMicrotask(() => { if (!lifetime.signal.aborted) void restore(lifetime.signal); });
    }
    return () => {
      lifetime.abort();
      documentRef.current?.abort();
    };
  }, [authLoading, ownerId]);

  useEffect(() => {
    if (chatBody.current) chatBody.current.scrollTop = chatBody.current.scrollHeight;
  }, [chatMessages, isAsking]);

  function goToPage(page: number) {
    setDetails((previous) => ({ ...previous, activePage: page }));
    setPageInput("");
  }

  function navigateToInput(event: FormEvent) {
    event.preventDefault();
    if (!pageInput.trim()) return;
    try {
      const request = findPdfPageRequest(pageInput, true);
      if (!request || request.start !== request.end) throw new Error("请输入一个页码。");
      goToPage(resolvePdfPages(request, pageCount, details.labels)[0]);
      setFeedback("");
    } catch (error) {
      setFeedback((error as Error).message);
    }
  }

  async function handleQuestion(event: FormEvent) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!pdfFile || !question || !canAsk || isAsking) return;
    const signal = (documentRef.current ??= new AbortController()).signal;
    let selected: number[] = [];
    let visual = useImages;
    try {
      const pageRequest = findPdfPageRequest(question);
      if (pageRequest) {
        selected = resolvePdfPages(pageRequest, pageCount, details.labels);
      } else if (/这(?:一)?页|本页|当前页|\b(?:this|cette) page\b/iu.test(question)) {
        selected = [activePage];
      } else if (useImages && scanPageSelection.trim()) {
        const scanRequest = findPdfPageRequest(scanPageSelection, true);
        if (!scanRequest) throw new Error("请输入页码或范围，例如 3-5。");
        selected = resolvePdfPages(scanRequest, pageCount, details.labels);
      }
      visual ||= selected.some((page) => !/\p{L}/u.test(pdfPages[page - 1] ?? ""));
    } catch (error) {
      setFeedback((error as Error).message);
      return;
    }

    const userMessage = { role: "user" as const, content: question };
    const messages = [...chatMessages.filter((message) => !message.error), userMessage]
      .slice(-MAX_CHAT_MESSAGES)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_CHAT_MESSAGE_CHARS) }));
    setChatMessages((previous) => [...previous, userMessage]);
    setChatInput("");
    setFeedback("");
    setIsAsking(true);
    try {
      let data: DocumentAnswer;
      if (visual) {
        const { renderPdfPagesToImages } = await import("@/lib/pdfParser");
        const { pages } = await renderPdfPagesToImages(pdfFile, selected.length ? selected : [activePage], signal);
        data = await askPdf<DocumentAnswer>({
          mode: "scan_pages", pageCount, pageLabels: details.labels,
          pageNumbers: pages.map((item) => item.pageNumber),
          pageImages: pages.map((item) => item.imageUrl), messages, deepMode,
        }, signal);
      } else {
        const previousPages = chatMessages.findLast((message) => message.sources?.length)
          ?.sources?.map((source) => source.page);
        data = await askPdf<DocumentAnswer>({
          pdfPages, pageLabels: details.labels, messages, deepMode,
          ...(selected.length ? { pageNumbers: selected } : previousPages?.length ? { previousPages } : {}),
        }, signal);
      }
      if (!signal.aborted) {
        const content = data.sources ? data.reply.replace(/\n+参考页码：第 [^\n]+ 页\s*$/u, "") : data.reply;
        setChatMessages((previous) => [...previous, { role: "assistant", content, sources: data.sources }]);
      }
    } catch (error) {
      if (!signal.aborted) {
        setChatMessages((previous) => [...previous, {
          role: "assistant", error: true, content: error instanceof Error ? error.message : "请求失败，请重试。",
        }]);
      }
    } finally {
      if (!signal.aborted) setIsAsking(false);
    }
  }

  function studyMarkdown() {
    return buildPdfStudyNoteMarkdown({
      fileName: pdfFile?.name ?? "课件", pageCount, deepMode, extractStatus: pdfExtractStatus,
      extractReason: pdfExtractReason, scanFallbackMode: scanOnly, scanPageSelection,
      summary, coverage: details.coverage, chatMessages,
    });
  }

  async function savePdf() {
    if (!pdfFile || isSaving || authLoading) return;
    const signal = documentRef.current?.signal;
    const id = details.recordId || crypto.randomUUID();
    setIsSaving(true);
    try {
      await saveLessonRecord({
        id, ownerId, lesson, title: pdfFile.name, kind: "pdf", updatedAt: Date.now(), markdown: studyMarkdown(),
        pdf: { file: pdfFile, page: activePage, summary, coverage: details.coverage, messages: chatMessages },
      });
      if (!signal?.aborted) {
        setDetails((previous) => ({ ...previous, recordId: id }));
        setFeedback(usesCloudStudy(ownerId)
          ? "文字笔记已保存到云端课程档案。"
          : lesson ? "已保存到「" + lesson + "」。" : "已保存到笔记本的未分类课程档案。");
      }
    } catch (error) {
      if (!signal?.aborted) setFeedback(studySaveError(error, ownerId));
    } finally {
      if (!signal?.aborted) setIsSaving(false);
    }
  }

  const coverage = details.coverage;
  const showFile = pdfFile && pdfUrl && details.ownerId === ownerId;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-10">
      <div className="animate-fade-in-up mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="text-violet-600" />{embedded ? "课件精读" : "文献精读"}</h1>
          <p className="mt-1 text-sm text-text-muted">上传整份 PDF，按页码提问，再从回答的来源回到课件原页。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!showFile || isSaving || authLoading} onClick={savePdf}>
            <Save size={15} />{isSaving ? "保存中" : "保存到本节课"}
          </button>
          <button className={button} disabled={!showFile} onClick={() => downloadMarkdownFile("智译西电_课件笔记", studyMarkdown())}>
            <Download size={15} />导出笔记
          </button>
        </div>
      </div>

      {feedback && <p role="status" className="mb-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">{feedback}</p>}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section ref={previewSection} className="animate-fade-in-up-delay-1 min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border border-card-border bg-white"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            const { files } = event.dataTransfer;
            if (!files.length) return;
            event.preventDefault();
            if (authLoading) return;
            if (files.length === 1) void loadPdf(files[0]);
            else setFeedback("每次请选择一份 PDF。");
          }}>
          <div className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3">
            <h2 className="flex min-w-0 items-center gap-2 font-semibold"><BookOpen size={17} className="shrink-0 text-violet-600" />
              <span className="truncate" title={showFile ? pdfFile.name : undefined}>{showFile ? pdfFile.name : "PDF 预览"}</span>
            </h2>
            {showFile && <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" className={button} disabled={authLoading} onClick={() => fileInput.current?.click()}>更换 PDF</button>
              <button type="button" onClick={resetDocument} className={button} aria-label="移除文件" title="移除文件"><X size={15} /></button>
            </div>}
          </div>
          {showFile ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-card-border px-3 py-2.5">
                <button className={button} aria-label="上一页" disabled={activePage <= 1} onClick={() => goToPage(activePage - 1)}><ChevronLeft size={15} /></button>
                <form className="flex items-center gap-1.5" onSubmit={navigateToInput}>
                  <input aria-label="跳转页码" className="w-24 rounded-lg border border-card-border px-2 py-2 text-xs"
                    placeholder={"第 " + activePage + " 页"} value={pageInput} onChange={(event) => setPageInput(event.target.value)} />
                  <button className={button} disabled={!pageCount || !pageInput.trim()}>跳转</button>
                </form>
                <button className={button} aria-label="下一页" disabled={activePage >= pageCount} onClick={() => goToPage(activePage + 1)}><ChevronRight size={15} /></button>
                <p className="text-xs text-text-muted">{pdfPageTitle(activePage, details.labels[activePage - 1])}{pageCount ? " / 共 " + pageCount + " 页" : ""}</p>
                <a className="ml-auto text-xs text-primary underline-offset-2 hover:underline" href={pdfUrl} target="_blank" rel="noreferrer">打开原始 PDF</a>
              </div>
              <div className="h-[min(57vh,620px)] min-h-60 bg-slate-100">
                <PdfPreview file={pdfFile} url={pdfUrl} page={activePage} />
              </div>
              <div className="border-t border-card-border px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-violet-700">{coverage?.excerpted ? "按页摘录摘要" : "课件摘要"}</h3>
                  {pdfExtractStatus === "text_ready" && !isSummarizing && (
                    <button className={button} onClick={() => void runSummary(pdfPages, details.labels, (documentRef.current ??= new AbortController()).signal)}>
                      {summary ? "重新生成" : "生成摘要"}
                    </button>
                  )}
                </div>
                {isExtracting && <p className="text-sm text-text-muted">正在后台提取页面文字，课件可先预览。</p>}
                {isSummarizing && <p className="text-sm text-text-muted">正在生成摘要，仍可翻页和提问。</p>}
                {pdfExtractReason && <p className="text-sm text-text-muted">{pdfExtractReason}</p>}
                {summaryError && <p role="alert" className="text-sm text-rose-700">{summaryError}</p>}
                {coverage && <p className="mt-1 text-xs text-text-muted">覆盖 {coverage.pages.length} / {coverage.total} 页的{coverage.excerpted ? "文字摘录" : "可提取文字"}</p>}
                {summary && <div className="mt-2 max-h-60 overflow-y-auto"><MarkdownRenderer content={summary} /></div>}
              </div>
            </>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
              <FileUp className="text-violet-600" size={34} />
              <p className="text-sm text-text-muted">
                {pendingPdfRecord ? "请选择原件 " + (pendingPdfRecord.pdf?.fileName ?? pendingPdfRecord.title) : "拖入 PDF，或从本机选择课件。"}
              </p>
              <button className={button} disabled={authLoading} onClick={() => fileInput.current?.click()}>选择 PDF 文件</button>
              {pendingPdfRecord && <button className="text-xs text-text-muted underline" onClick={() => {
                setPendingPdfRecord(null);
                setFeedback("");
              }}>阅读另一份 PDF</button>}
            </div>
          )}
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void loadPdf(file);
          }} />
        </section>

        <section className="animate-fade-in-up-delay-2 flex min-h-[27rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-card-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-3">
            <h2 className="font-semibold">课件助教</h2>
            <div className="flex gap-2">
              <button className={button} aria-pressed={deepMode} onClick={() => setDeepMode(!deepMode)}>{deepMode ? "深度讲解" : "简明回答"}</button>
              <button className={button} aria-pressed={useImages} disabled={!canAsk || scanOnly} title="直接读取 PDF 页图" onClick={() => setImageMode(!imageMode)}>
                <ImageIcon size={15} aria-hidden />{useImages ? "看图提问已开启" : "看图提问"}
              </button>
            </div>
          </div>
          <div ref={chatBody} className="flex-1 space-y-3 overflow-y-auto p-4 lg:max-h-[70vh]">
            {!chatMessages.length && <p className="text-sm leading-6 text-text-muted">
              {showFile ? "可以问「第 3 页有哪些知识点？」，也可以先翻页再问「这页讲什么？」。解读图表时可开启「看图提问」，直接读取 PDF 页图。" : "上传 PDF 后，就可以按页码提问或查找课件里的术语。"}
            </p>}
            {showFile && chatMessages.map((message, index) => (
              <div key={index} className={message.role === "user"
                ? "ml-auto w-fit max-w-full break-words rounded-xl bg-violet-100 px-3 py-2 text-sm"
                : "rounded-xl border border-card-border bg-slate-50 p-3"}>
                {message.role === "user" || message.error
                  ? <p className={message.error ? "text-sm text-rose-700" : "whitespace-pre-wrap"}>{message.content}</p>
                  : <MarkdownRenderer content={message.content} />}
                {!!message.sources?.length && (
                  <div className="mt-3 space-y-2 border-t border-card-border pt-2">
                    <p className="text-xs font-semibold text-text-muted">课件来源 · 点击回到原页</p>
                    {message.sources.map((source) => (
                      <div key={source.page} className="space-y-1">
                        <button className={button} onClick={() => {
                          goToPage(source.page);
                          previewSection.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                        }}>{pdfPageTitle(source.page, source.label)}</button>
                        {source.quote && <details className="text-xs text-text-muted">
                          <summary className="cursor-pointer">查看原文片段</summary>
                          <blockquote className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-violet-200 pl-2">{source.quote}</blockquote>
                        </details>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isAsking && <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" />正在查看课件…</p>}
          </div>
          <form onSubmit={handleQuestion} className="space-y-2 border-t border-card-border p-3">
            {useImages && <label className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              页码或范围
              <input value={scanPageSelection} onChange={(event) => setScanPageSelection(event.target.value)}
                placeholder={"默认 PDF 第 " + activePage + " 页"} className="min-w-28 flex-1 rounded-lg border border-card-border px-2 py-2" />
              最多 {MAX_SCAN_PAGES} 页
            </label>}
            <div className="flex gap-2">
              <input aria-label="课件问题" maxLength={MAX_CHAT_MESSAGE_CHARS} disabled={!showFile || !canAsk || isAsking}
                value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={`例如，PDF 第 ${activePage} 页有哪些知识点？`}
                className="min-w-0 flex-1 rounded-xl border border-card-border px-3 py-2 text-sm disabled:bg-slate-50" />
              <button className="rounded-xl bg-violet-600 px-3 text-white disabled:opacity-50"
                aria-label="发送问题" disabled={!showFile || !canAsk || !chatInput.trim() || isAsking}><Send size={17} /></button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
