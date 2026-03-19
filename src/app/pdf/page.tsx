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

const MarkdownRenderer = lazy(
  () => import("../components/MarkdownRenderer")
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function PdfPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [deepMode, setDeepMode] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const pdfUrlRef = useRef<string | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // Cleanup URL on unmount
  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke old URL
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);

    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setPdfText(null);
    setSummary(null);
    setChatMessages([]);
    setIsExtracting(true);

    try {
      const { extractTextFromPdf } = await import("@/lib/pdfParser");
      const result = await extractTextFromPdf(file);
      setPdfText(result.fullText);
      setPageCount(result.pageCount);

      // Auto-summarize
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
    } catch (err) {
      console.error("PDF extract failed:", err);
      setPdfText("PDF 文本提取失败，请确保文件不是扫描版（图片）PDF。");
    } finally {
      setIsExtracting(false);
    }

    e.target.value = "";
  };

  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || !pdfText || isChatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/pdf-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfText,
          messages: newMessages,
          action: "chat",
          deepMode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "请求失败");
      }

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `抱歉，回复失败：${err instanceof Error ? err.message : "未知错误"}`,
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
      // Simulate file input change
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 lg:px-10 py-6">
        {/* Page Header */}
        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <FileText size={20} />
            </div>
            文献精读
          </h1>
          <p className="text-sm text-text-muted mt-2 flex items-center gap-4">
            上传完整 PDF 课件，AI 自动生成摘要并支持对文献的任意追问。
            <span className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-1 py-1 text-[11px] shadow-sm">
              <button
                onClick={() => setDeepMode(false)}
                className={`px-3 py-1 rounded-full transition-all ${!deepMode ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
              >
                极速
              </button>
              <button
                onClick={() => setDeepMode(true)}
                className={`px-3 py-1 rounded-full transition-all ${deepMode ? "bg-slate-900 text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
              >
                深度
              </button>
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-220px)]">
          {/* Left: PDF Preview */}
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
                  onClick={() => {
                    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                    setPdfFile(null);
                    setPdfUrl(null);
                    setPdfText(null);
                    setSummary(null);
                    setChatMessages([]);
                    setPageCount(0);
                  }}
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
                  <p className="text-sm">正在提取 PDF 文本...</p>
                </div>
              ) : (
                <iframe
                  src={pdfUrl || undefined}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              )}
            </div>

            {/* Summary section */}
            {(isSummarizing || summary) && (
              <div className="border-t border-card-border/60 max-h-[200px] overflow-y-auto">
                <div className="px-5 py-3 bg-violet-50/50">
                  <h3 className="text-xs font-semibold text-violet-600 mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} />
                    章节摘要
                  </h3>
                  {isSummarizing ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 size={14} className="animate-spin" />
                      AI 正在生成摘要...
                    </div>
                  ) : (
                    <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                      {summary}
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

          {/* Right: Chat Panel */}
          <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden flex flex-col animate-fade-in-up-delay-2">
            <div className="px-5 py-4 border-b border-card-border/60 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">AI 文献助教</h2>
                <p className="text-[10px] text-white/70">
                  {pdfText
                    ? `已加载文献 (${pageCount} 页) · 可直接提问`
                    : "请先上传 PDF 文件"}
                </p>
              </div>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="ml-auto text-[10px] text-white/60 hover:text-white/90 transition-colors"
                >
                  清空
                </button>
              )}
            </div>

            {/* Chat Messages */}
            <div
              ref={chatBodyRef}
              className="flex-1 p-4 overflow-y-auto bg-background/50 space-y-3"
            >
              {/* Welcome */}
              <div className="flex gap-2.5">
                <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                  <Sparkles size={12} />
                </div>
                <div className="bg-card-bg rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm text-foreground border border-card-border shadow-sm max-w-[320px]">
                  <p>
                    你好！我是
                    <strong className="text-violet-600">文献精读助教</strong>
                    📖
                  </p>
                  <p className="mt-1.5 text-text-muted text-xs leading-relaxed">
                    {pdfText
                      ? "文献已就绪！你可以问我任何关于这篇文献的问题，比如「请解释第3页的公式」或「总结第一章的核心观点」。"
                      : "请先在左侧上传 PDF 文件，我会帮你提取文本并生成摘要。之后你可以就文献内容向我提问。"}
                  </p>
                </div>
              </div>

              {chatMessages.map((msg, idx) => (
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
                    className={`rounded-xl px-3.5 py-2.5 text-sm max-w-[320px] overflow-x-auto ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-tr-sm"
                        : "bg-card-bg text-foreground border border-card-border shadow-sm rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <Suspense
                        fallback={<span className="animate-pulse">...</span>}
                      >
                        <MarkdownRenderer content={msg.content} />
                      </Suspense>
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
              ))}

              {/* Loading */}
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

            {/* Chat Input */}
            <div className="p-3 border-t border-card-border bg-card-bg">
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
                    pdfText
                      ? "对文献有疑问？在这里提问..."
                      : "请先上传 PDF 文件..."
                  }
                  disabled={!pdfText || isChatLoading}
                  className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-text-light outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!pdfText || isChatLoading || !chatInput.trim()}
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
