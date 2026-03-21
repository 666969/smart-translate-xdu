"use client";

import { useState, useRef, useEffect, lazy, Suspense } from "react";
import {
  FileUp,
  Send,
  Sparkles,
  FileText,
  Loader2,
  X,
  BookOpen,
} from "lucide-react";
import Header from "../components/Header";
import type { PdfExtractStatus } from "@/lib/pdfParser";
import { useAppSession } from "../components/AppSessionProvider";

const MarkdownRenderer = lazy(
  () => import("../components/MarkdownRenderer")
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PdfReaderStatus = "idle" | PdfExtractStatus;

const MAX_SCAN_PAGES = 5;

function extractPageReferenceNote(content: string) {
  const match = content.match(/(?:\n\s*){1,2}(参考页码：第 [^\n]+ 页)\s*$/u);

  if (!match) {
    return {
      body: content,
      reference: null as string | null,
    };
  }

  return {
    body: content.slice(0, match.index).trimEnd(),
    reference: match[1].trim(),
  };
}

function extractPageSelectionFromMessage(message: string) {
  const rangeMatch = message.match(
    /第?\s*(\d+)\s*(?:页)?\s*(?:-|~|—|–|到|至)\s*(\d+)\s*页?/u
  );
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}`;
  }

  const singleMatch =
    message.match(/第\s*(\d+)\s*页/u) ||
    message.match(/\bpage\s*(\d+)\b/iu) ||
    message.match(/\bp\.\s*(\d+)\b/iu);

  if (singleMatch) {
    return singleMatch[1];
  }

  return null;
}

function parseScanPageSelection(selection: string, pageCount: number) {
  const trimmed = selection.trim();
  if (!trimmed) {
    return {
      ok: false as const,
      error: "扫描版提问需要指定页码或页码范围，例如 3 或 3-5。",
    };
  }

  const normalized = trimmed
    .replace(/^第/u, "")
    .replace(/页$/u, "")
    .replace(/\s+/gu, "");

  const rangeMatch = normalized.match(/^(\d+)(?:-|~|—|–|到|至)(\d+)$/u);
  const singleMatch = normalized.match(/^(\d+)$/u);

  let pages: number[] = [];

  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return {
        ok: false as const,
        error: "页码范围格式不正确，请使用 3-5 这样的形式。",
      };
    }

    pages = Array.from(
      { length: end - start + 1 },
      (_, index) => start + index
    );
  } else if (singleMatch) {
    const page = Number(singleMatch[1]);
    if (!Number.isInteger(page) || page < 1) {
      return {
        ok: false as const,
        error: "页码必须是大于等于 1 的整数。",
      };
    }
    pages = [page];
  } else {
    return {
      ok: false as const,
      error: "页码格式不正确，请输入单页（如 3）或范围（如 3-5）。",
    };
  }

  if (pageCount > 0 && pages.some((page) => page > pageCount)) {
    return {
      ok: false as const,
      error: `页码超出范围，当前 PDF 共 ${pageCount} 页。`,
    };
  }

  if (pages.length > MAX_SCAN_PAGES) {
    return {
      ok: false as const,
      error: `扫描版单次最多解析 ${MAX_SCAN_PAGES} 页，请缩小页码范围。`,
    };
  }

  return {
    ok: true as const,
    pages,
  };
}

function formatPageLabel(pageNumbers: number[]) {
  if (pageNumbers.length === 0) {
    return "";
  }

  if (pageNumbers.length === 1) {
    return `第 ${pageNumbers[0]} 页`;
  }

  return `第 ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]} 页`;
}

function getReaderStatusLabel(
  status: PdfReaderStatus,
  pageCount: number,
  pdfPreviewReady: boolean
) {
  if (!pdfPreviewReady) {
    return "请先上传 PDF 文件";
  }

  if (status === "text_ready") {
    return `已加载文献 (${pageCount} 页) · 可直接提问`;
  }

  if (status === "scan_like") {
    return `已检测为扫描版 PDF (${pageCount} 页) · 支持按页解析`;
  }

  if (status === "worker_error") {
    return "PDF 预览正常，但文本提取器加载失败";
  }

  if (status === "parse_error") {
    return "PDF 预览正常，但文本层无法解析";
  }

  return "PDF 已上传，正在解析中";
}

function getStatusCardCopy(
  status: PdfReaderStatus,
  reason: string | null,
  pageCount: number
) {
  if (status === "scan_like") {
    return {
      title: "已切换为扫描版 PDF 模式",
      description:
        reason ||
        "当前 PDF 可以预览，但文字层极少或为空。你仍然可以在右侧按页或按页码范围提问，例如输入 3 或 3-5。",
      tone: "info" as const,
    };
  }

  if (status === "worker_error") {
    return {
      title: "文本提取器加载失败",
      description:
        reason ||
        "当前网络环境下 PDF 文本提取器没有正常加载。左侧预览不受影响，但全文摘要和全文问答暂时不可用。",
      tone: "warning" as const,
    };
  }

  if (status === "parse_error") {
    return {
      title: "PDF 文本层无法解析",
      description:
        reason ||
        `当前 PDF 共 ${pageCount || 0} 页，但文本层没有被成功解析，可能是加密、特殊编码或结构异常的 PDF。`,
      tone: "warning" as const,
    };
  }

  return null;
}

export default function PdfPage() {
  const { pdf } = useAppSession();
  const {
    pdfFile,
    setPdfFile,
    pdfText,
    setPdfText,
    pdfPages,
    setPdfPages,
    pdfUrl,
    setPdfUrl,
    pdfPreviewReady,
    setPdfPreviewReady,
    pdfExtractStatus,
    setPdfExtractStatus,
    pdfExtractReason,
    setPdfExtractReason,
    pageCount,
    setPageCount,
    summary,
    setSummary,
    deepMode,
    setDeepMode,
    scanFallbackMode,
    setScanFallbackMode,
    scanPageSelection,
    setScanPageSelection,
    lastResolvedPageLabel,
    setLastResolvedPageLabel,
    chatMessages,
    setChatMessages,
    chatInput,
    setChatInput,
  } = pdf;
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  const resetPdfState = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfFile(null);
    setPdfUrl(null);
    setPdfPreviewReady(false);
    setPdfText(null);
    setPdfPages([]);
    setSummary(null);
    setChatMessages([]);
    setPageCount(0);
    setPdfExtractStatus("idle");
    setPdfExtractReason(null);
    setScanFallbackMode(false);
    setScanPageSelection("1");
    setLastResolvedPageLabel(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }

    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setPdfPreviewReady(true);
    setPdfText(null);
    setPdfPages([]);
    setSummary(null);
    setChatMessages([]);
    setPageCount(0);
    setPdfExtractStatus("idle");
    setPdfExtractReason(null);
    setScanFallbackMode(false);
    setScanPageSelection("1");
    setLastResolvedPageLabel(null);
    setIsExtracting(true);
    setIsSummarizing(false);

    try {
      const { extractTextFromPdf } = await import("@/lib/pdfParser");
      const result = await extractTextFromPdf(file);

      setPageCount(result.pageCount);
      setPdfExtractStatus(result.status);
      setPdfExtractReason(result.reason || null);
      setScanFallbackMode(result.status === "scan_like");

      if (result.status === "text_ready" && result.fullText.trim()) {
        setPdfText(result.fullText);
        setPdfPages(result.pages);
        setIsSummarizing(true);

        try {
          const res = await fetch("/api/pdf-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pdfText: result.fullText,
              action: "summarize",
              deepMode,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setSummary(data.summary || null);
          }
        } catch {
          console.error("Summary failed");
        } finally {
          setIsSummarizing(false);
        }
      } else {
        setPdfText(null);
        setPdfPages([]);
        setSummary(null);
      }
    } catch (err) {
      console.error("PDF extract failed:", err);
      setPdfExtractStatus("parse_error");
      setPdfExtractReason("PDF 预览正常，但文本提取流程发生了未预期异常。");
      setPdfText(null);
      setPdfPages([]);
      setSummary(null);
      setScanFallbackMode(false);
    } finally {
      setIsExtracting(false);
    }

    e.target.value = "";
  };

  const handleChatSend = async () => {
    const msg = chatInput.trim();
    const canChat = pdfExtractStatus === "text_ready" || scanFallbackMode;
    if (!msg || !canChat || isChatLoading) return;

    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: msg },
    ];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      let response: Response;

      if (scanFallbackMode) {
        if (!pdfFile) {
          throw new Error("当前没有可用于扫描版解析的 PDF 文件。");
        }

        const selection =
          extractPageSelectionFromMessage(msg) || scanPageSelection || "1";
        const parsedSelection = parseScanPageSelection(selection, pageCount);

        if (!parsedSelection.ok) {
          throw new Error(parsedSelection.error);
        }

        setScanPageSelection(selection);
        setLastResolvedPageLabel(formatPageLabel(parsedSelection.pages));

        const { renderPdfPagesToImages } = await import("@/lib/pdfParser");
        const rendered = await renderPdfPagesToImages(pdfFile, parsedSelection.pages);

        response = await fetch("/api/pdf-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "scan_pages",
            pageImages: rendered.pages.map((page) => page.imageUrl),
            pageNumbers: rendered.pages.map((page) => page.pageNumber),
            messages: newMessages,
            deepMode,
          }),
        });
      } else {
        response = await fetch("/api/pdf-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfText,
            pdfPages,
            messages: newMessages,
            action: "chat",
            deepMode,
          }),
        });
      }

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "请求失败");
      }

      const data = await response.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `抱歉，回复失败：${
            err instanceof Error ? err.message : "未知错误"
          }`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  const readerStatusLabel = getReaderStatusLabel(
    pdfExtractStatus,
    pageCount,
    pdfPreviewReady
  );
  const statusCard = getStatusCardCopy(
    pdfExtractStatus,
    pdfExtractReason,
    pageCount
  );
  const canAskDocument = pdfExtractStatus === "text_ready" || scanFallbackMode;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 lg:px-10 py-6">
        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <FileText size={20} />
            </div>
            文献精读
          </h1>
          <p className="text-sm text-text-muted mt-2 flex items-center gap-4">
            上传完整 PDF 课件，AI 自动生成全文摘要并支持对文献的任意追问。
            <span className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-1 py-1 text-[11px] shadow-sm">
              <button
                onClick={() => setDeepMode(false)}
                className={`px-3 py-1 rounded-full transition-all ${
                  !deepMode
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                极速
              </button>
              <button
                onClick={() => setDeepMode(true)}
                className={`px-3 py-1 rounded-full transition-all ${
                  deepMode
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                深度
              </button>
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-220px)]">
          <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden flex flex-col animate-fade-in-up-delay-1">
            <div className="px-5 py-4 border-b border-card-border/60 bg-background/30 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-violet-500/10 flex items-center justify-center text-violet-500">
                  <FileText size={14} />
                </span>
                PDF 预览
                {pageCount > 0 && (
                  <span className="text-xs text-text-light font-normal ml-2">
                    共 {pageCount} 页
                  </span>
                )}
              </h2>
              {pdfFile && (
                <button
                  onClick={resetPdfState}
                  className="text-text-muted hover:text-red-500 transition-colors"
                  title="移除文件"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {!pdfFile ? (
                <div
                  className="h-full flex flex-col items-center justify-center p-8 cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <div className="w-20 h-20 mb-4 rounded-full bg-violet-50 flex items-center justify-center text-violet-400">
                    <FileUp size={36} />
                  </div>
                  <p className="text-base font-semibold text-foreground mb-1">
                    拖拽 PDF 文件到此处
                  </p>
                  <p className="text-sm text-text-muted mb-4">
                    或点击选择文件
                  </p>
                  <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all">
                    <FileUp size={16} className="inline mr-2" />
                    选择 PDF 文件
                  </button>
                </div>
              ) : isExtracting ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-text-muted">
                  <Loader2 size={32} className="animate-spin text-violet-500" />
                  <p className="text-sm">正在提取 PDF 文本并判断可读性...</p>
                </div>
              ) : (
                <iframe
                  src={pdfUrl || undefined}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              )}
            </div>

            {(isSummarizing || summary || statusCard) && (
              <div className="border-t border-card-border/60 max-h-[220px] overflow-y-auto">
                <div className="px-5 py-3 bg-violet-50/50">
                  <h3 className="text-xs font-semibold text-violet-600 mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} />
                    {statusCard ? "解析状态" : "全文摘要"}
                  </h3>
                  {statusCard ? (
                    <div
                      className={`text-xs leading-relaxed rounded-xl border px-3 py-2.5 ${
                        statusCard.tone === "info"
                          ? "bg-sky-50 text-sky-900 border-sky-100"
                          : "bg-amber-50 text-amber-900 border-amber-100"
                      }`}
                    >
                      <p className="font-semibold mb-1">{statusCard.title}</p>
                      <p>{statusCard.description}</p>
                    </div>
                  ) : isSummarizing ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 size={14} className="animate-spin" />
                      AI 正在生成摘要...
                    </div>
                  ) : (
                    <div className="text-xs text-gray-700 leading-relaxed">
                      <MarkdownRenderer content={summary || ""} compact={false} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden flex flex-col animate-fade-in-up-delay-2">
            <div className="px-5 py-4 border-b border-card-border/60 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">AI 文献助教</h2>
                <p className="text-[10px] text-white/70">{readerStatusLabel}</p>
              </div>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => {
                    setChatMessages([]);
                    setLastResolvedPageLabel(null);
                  }}
                  className="ml-auto text-[10px] text-white/60 hover:text-white/90 transition-colors"
                >
                  清空
                </button>
              )}
            </div>

            <div
              ref={chatBodyRef}
              className="flex-1 p-4 overflow-y-auto bg-background/50 space-y-3"
            >
              {scanFallbackMode && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-900">
                  <p className="font-semibold">扫描版 PDF 按页解析已启用</p>
                  <p className="mt-1 leading-relaxed">
                    当前文件可预览但没有稳定文本层。请在下方填写页码或范围，例如
                    <span className="font-semibold"> 3 </span>
                    或
                    <span className="font-semibold"> 3-5 </span>
                    ，再提出问题。
                  </p>
                  {lastResolvedPageLabel && (
                    <p className="mt-1 text-violet-700">
                      上次解析范围：{lastResolvedPageLabel}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2.5">
                <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                  <Sparkles size={12} />
                </div>
                <div className="bg-card-bg rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm text-foreground border border-card-border shadow-sm max-w-[360px]">
                  <p>
                    你好！我是
                    <strong className="text-violet-600">文献精读助教</strong>
                    📖
                  </p>
                  <p className="mt-1.5 text-text-muted text-xs leading-relaxed">
                    {pdfExtractStatus === "text_ready"
                      ? "文献已就绪！你可以问我任何关于这篇文献的问题，比如「请解释第3页的公式」或「总结第一章的核心观点」。"
                      : scanFallbackMode
                        ? "当前文档被识别为扫描版 PDF。你仍然可以对指定页或页码范围提问，例如「解释第 3-5 页的核心公式」。"
                        : pdfPreviewReady
                          ? "PDF 预览已经加载，但当前还没有可用于全文问答的文本层。请查看上方解析状态说明。"
                          : "请先在左侧上传 PDF 文件，我会帮你提取文本并生成摘要。之后你可以就文献内容向我提问。"}
                  </p>
                  {(pdfExtractStatus === "text_ready" || scanFallbackMode) && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                      <FileText size={12} />
                      命中页码时自动追加参考页码尾注
                    </div>
                  )}
                </div>
              </div>

              {chatMessages.map((msg, idx) => {
                const assistantContent =
                  msg.role === "assistant" ? extractPageReferenceNote(msg.content) : null;

                return (
                  <div
                    key={idx}
                    className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                        <Sparkles size={12} />
                      </div>
                    )}
                    <div
                      className={`rounded-xl px-3.5 py-2.5 text-sm max-w-[360px] overflow-x-auto ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-tr-sm"
                          : "bg-card-bg text-foreground border border-card-border shadow-sm rounded-tl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="space-y-3">
                          <Suspense fallback={<span className="animate-pulse">...</span>}>
                            <MarkdownRenderer content={assistantContent?.body || msg.content} compact />
                          </Suspense>
                          {assistantContent?.reference && (
                            <div className="rounded-xl border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.98),rgba(237,233,254,0.94))] px-3 py-2.5 text-xs text-violet-900 shadow-sm">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-violet-600">
                                  <FileText size={12} />
                                </span>
                                <div>
                                  <p className="font-semibold">参考页码</p>
                                  <p className="mt-0.5 leading-relaxed text-violet-700">
                                    {assistantContent.reference.replace(/^参考页码：/u, "")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                          {msg.content}
                        </pre>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        我
                      </div>
                    )}
                  </div>
                );
              })}

              {isChatLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                    <Sparkles size={12} />
                  </div>
                  <div className="bg-card-bg rounded-xl rounded-tl-sm px-4 py-3 border border-card-border shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-card-border bg-card-bg">
              {scanFallbackMode && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-card-border bg-background px-3 py-2">
                  <span className="text-[11px] font-medium text-text-muted shrink-0">
                    页码/范围
                  </span>
                  <input
                    type="text"
                    value={scanPageSelection}
                    onChange={(e) => setScanPageSelection(e.target.value)}
                    placeholder="如 3 或 3-5"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-text-light outline-none"
                  />
                  <span className="text-[11px] text-text-light shrink-0">
                    最多 {MAX_SCAN_PAGES} 页
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 bg-background rounded-xl px-3 py-1 border border-card-border focus-within:border-violet-400 transition-colors duration-200">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                    }
                  }}
                  placeholder={
                    scanFallbackMode
                      ? "请结合页码/范围提问，例如：解释第 3-5 页的核心公式"
                      : pdfExtractStatus === "text_ready"
                        ? "对文献有疑问？在这里提问..."
                        : "当前未就绪：请先上传 PDF，或等待解析结果"
                  }
                  disabled={!canAskDocument || isChatLoading}
                  className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-text-light outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!canAskDocument || isChatLoading || !chatInput.trim()}
                  className="w-8 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white flex items-center justify-center hover:shadow-md transition-all duration-200 shrink-0 disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
