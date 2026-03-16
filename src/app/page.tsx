"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import type { KeywordItem } from "./components/KeywordGlossary";

const MermaidRenderer = lazy(() => import("./components/MermaidRenderer"));
const MarkdownRenderer = lazy(() => import("./components/MarkdownRenderer"));
const KeywordGlossary = lazy(() => import("./components/KeywordGlossary"));
import Header from "./components/Header";
import { BookOpen } from "lucide-react";

/* ========== Types ========== */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface QuizItem {
  question_fr: string;
  question_zh: string;
  question_en: string;
  options_fr: string[];
  options_zh: string[];
  options_en: string[];
  answer_fr: string;
  answer_zh: string;
  answer_en: string;
  answer?: string;
  explanation_fr?: string;
  explanation_zh?: string;
  explanation_en?: string;
  explanation?: string;
}

type QuizLang = "zh" | "fr" | "en";

function getTranslateTimeoutMs(options: {
  mode: "snippet" | "document";
  hasSnippetImage: boolean;
  documentImageCount: number;
}) {
  if (options.mode === "document") {
    return options.documentImageCount > 2 ? 240_000 : 210_000;
  }

  if (options.hasSnippetImage) {
    return 180_000;
  }

  return 90_000;
}

function normalizeKeywordItems(value: unknown): KeywordItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const term_fr =
        typeof record.term_fr === "string" ? record.term_fr.trim() : "";
      const term_zh =
        typeof record.term_zh === "string" ? record.term_zh.trim() : "";
      const definition_zh =
        typeof record.definition_zh === "string"
          ? record.definition_zh.trim()
          : "";

      if (!term_fr || !term_zh || !definition_zh) {
        return null;
      }

      return { term_fr, term_zh, definition_zh };
    })
    .filter((item): item is KeywordItem => Boolean(item));
}

function getQuizQuestion(item: QuizItem, lang: QuizLang) {
  if (lang === "fr") return item.question_fr;
  if (lang === "en") return item.question_en;
  return item.question_zh;
}

function getQuizOptions(item: QuizItem, lang: QuizLang) {
  if (lang === "fr") return item.options_fr;
  if (lang === "en") return item.options_en;
  return item.options_zh;
}

function getQuizExplanation(item: QuizItem, lang: QuizLang) {
  if (lang === "fr") return item.explanation_fr || item.explanation;
  if (lang === "en") return item.explanation_en || item.explanation;
  return item.explanation_zh || item.explanation;
}

function getQuizActionLabel(lang: QuizLang) {
  if (lang === "fr") return "Voir la reponse";
  if (lang === "en") return "View Answer";
  return "查看解析";
}

function getQuizAnswerLabel(lang: QuizLang) {
  if (lang === "fr") return "Bonne reponse";
  if (lang === "en") return "Correct Answer";
  return "正确答案";
}

function getQuizAnswer(item: QuizItem, lang: QuizLang) {
  const answer =
    lang === "fr"
      ? item.answer_fr.trim()
      : lang === "en"
        ? item.answer_en.trim()
        : item.answer_zh.trim();

  if (!answer) {
    const legacyAnswer = item.answer?.trim() || "";
    if (!legacyAnswer) {
      return "";
    }

    const letterIndex = ["A", "B", "C", "D"].indexOf(legacyAnswer.toUpperCase());
    if (letterIndex >= 0) {
      return getQuizOptions(item, lang)[letterIndex] || legacyAnswer;
    }

    const matchedIndex = [item.options_zh, item.options_fr, item.options_en]
      .map((options) => options.findIndex((option) => option.trim() === legacyAnswer))
      .find((index) => index >= 0);

    if (typeof matchedIndex === "number" && matchedIndex >= 0) {
      return getQuizOptions(item, lang)[matchedIndex] || legacyAnswer;
    }

    return legacyAnswer;
  }

  return answer;
}

/* ========== SVG Icon Components ========== */

function UploadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
      <polyline points="7 7 10 3 13 7" />
      <line x1="10" y1="3" x2="10" y2="13" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l6 10" />
      <path d="M4 14h8" />
      <path d="M10 6h8" />
      <path d="M14 6v2a4 4 0 0 0 4 4" />
      <path d="M18 6v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

function FormulaIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h6v6H4z" />
      <path d="M14 4l6 6" />
      <path d="M20 4l-6 6" />
      <path d="M4 16l3 4 3-4" />
      <path d="M14 18h6" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M8 0l2 5.5L16 8l-6 2.5L8 16l-2-5.5L0 8l6-2.5L8 0z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ========== Main Page Component ========== */

export default function Home() {
  const [mode, setMode] = useState<"snippet" | "document">("snippet");
  const [deepMode, setDeepMode] = useState(false);
  const [snippetText, setSnippetText] = useState("");
  const [snippetFile, setSnippetFile] = useState<File | null>(null);
  const [snippetPreviewUrl, setSnippetPreviewUrl] = useState<string | null>(null);

  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<string[]>([]);

  const [quizLang, setQuizLang] = useState<QuizLang>("zh");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [translationResult, setTranslationResult] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [keywordsResult, setKeywordsResult] = useState<string | null>(null);
  const [keywordItemsResult, setKeywordItemsResult] = useState<KeywordItem[]>([]);
  const [mindmapResult, setMindmapResult] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const snippetFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<{ snippet: string | null; document: string[] }>({
    snippet: null,
    document: [],
  });

  // 聊天窗自动滚动到底部
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    previewUrlsRef.current = {
      snippet: snippetPreviewUrl,
      document: documentPreviewUrls,
    };
  }, [snippetPreviewUrl, documentPreviewUrls]);

  useEffect(() => {
    return () => {
      const { snippet, document } = previewUrlsRef.current;
      if (snippet) {
        URL.revokeObjectURL(snippet);
      }
      document.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleModeChange = (nextMode: "snippet" | "document") => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const openSnippetUpload = () => {
    snippetFileInputRef.current?.click();
  };

  const openDocumentUpload = () => {
    documentFileInputRef.current?.click();
  };

  const handleSnippetFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (snippetPreviewUrl) {
      URL.revokeObjectURL(snippetPreviewUrl);
    }
    setSnippetFile(file);
    setSnippetPreviewUrl(URL.createObjectURL(file));
    setErrorMessage(null);
    e.target.value = "";
  };

  const handleDocumentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 5 - documentFiles.length);
    if (remainingSlots === 0) {
      setErrorMessage("最多上传 5 张课件截图");
      e.target.value = "";
      return;
    }

    const acceptedFiles = files.slice(0, remainingSlots);
    const acceptedUrls = acceptedFiles.map((file) => URL.createObjectURL(file));

    setDocumentFiles((prev) => [...prev, ...acceptedFiles]);
    setDocumentPreviewUrls((prev) => [...prev, ...acceptedUrls]);

    if (files.length > remainingSlots) {
      setErrorMessage(`最多上传 5 张课件截图，已添加前 ${remainingSlots} 张`);
    } else {
      setErrorMessage(null);
    }
    e.target.value = "";
  };

  const handleRemoveSnippetImage = useCallback(() => {
    if (snippetPreviewUrl) {
      URL.revokeObjectURL(snippetPreviewUrl);
    }
    setSnippetFile(null);
    setSnippetPreviewUrl(null);

    if (snippetFileInputRef.current) {
      snippetFileInputRef.current.value = "";
    }
  }, [snippetPreviewUrl]);

  const handleRemoveDocumentImage = useCallback((indexToRemove: number) => {
    const urlToRemove = documentPreviewUrls[indexToRemove];
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
    }

    setDocumentFiles((prev) => prev.filter((_, i) => i !== indexToRemove));
    setDocumentPreviewUrls((prev) => prev.filter((_, i) => i !== indexToRemove));

    if (documentFileInputRef.current) {
      documentFileInputRef.current.value = "";
    }
  }, [documentPreviewUrls]);

  const handleTranslate = async () => {
    if (mode === "snippet" && !snippetText && !snippetFile) {
      setErrorMessage("请输入外文文本或上传课件截图");
      return;
    }
    if (mode === "document" && documentFiles.length === 0) {
      setErrorMessage("请至少上传 1 张课件截图");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setTranslationResult(null);
    setAnalysisResult(null);
    setKeywordsResult(null);
    setKeywordItemsResult([]);
    setMindmapResult(null);
    setQuizResult(null);

    try {
      const formData = new FormData();
      formData.append("mode", mode);
      formData.append("deep_mode", deepMode ? "true" : "false");
      
      if (mode === "snippet") {
        if (snippetText) formData.append("text", snippetText);
        if (snippetFile) formData.append("image", snippetFile);
      } else {
        documentFiles.forEach((file) => {
          formData.append("image", file);
        });
      }

      const requestTimeoutMs = getTranslateTimeoutMs({
        mode,
        hasSnippetImage: Boolean(snippetFile),
        documentImageCount: documentFiles.length,
      });

      // 第三方 Gemini 中转在图片任务上通常明显更慢，前端超时需高于后端。
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

      const response = await fetch("/api/translate", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "请求失败");
      }

      const data = await response.json();
      
      // Decode JSON fields based on the modes
      if (mode === "document") {
        setTranslationResult(null);
        setAnalysisResult(null);
        setKeywordsResult(null);
        setKeywordItemsResult([]);
        
        setMindmapResult(data.mermaid || null);
        setQuizResult(data.quiz || null);
      } else {
        setTranslationResult(data.translation || null);
        setAnalysisResult(data.analysis || null);
        setKeywordsResult(data.keywords || null);
        setKeywordItemsResult(normalizeKeywordItems(data.keyword_items));
        
        setMindmapResult(null);
        setQuizResult(null);
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMessage(
          "请求超时，当前 Gemini 中转响应较慢。你可以稍后重试，或改用更快的 Flash 模型。"
        );
      } else {
        setErrorMessage(err instanceof Error ? err.message : "请求失败，请稍后重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ===== 发送聊天消息 =====
  const handleChatSend = async () => {
    const msg = chatMessage.trim();
    if (!msg || isChatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatMessage("");
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          deepMode,
          context: {
            originalText: snippetText || undefined,
            translation: translationResult || undefined,
            analysis: analysisResult || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "请求失败");
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
          content: `抱歉，回复失败：${err instanceof Error ? err.message : "未知错误"}。请稍后重试。`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const hasDocumentInput = documentFiles.length > 0;
  const inputSummary =
    mode === "snippet"
      ? [snippetText ? `${snippetText.length} 字符` : null, snippetFile ? "1 张图片" : null]
          .filter(Boolean)
          .join(" + ")
      : hasDocumentInput
        ? `${documentFiles.length} 张图片`
        : "";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ===== Top Navigation Bar (Shared) ===== */}
      <Header />

      {/* ===== Hero Subtitle ===== */}
      <div className="text-center pt-8 pb-4 animate-fade-in-up">
        <p className="text-sm text-text-muted">
          <SparkleIcon />{" "}
          <span className="ml-1">
            面向中外合作办学理工科学生 · 法语/英语教材智能翻译与解析
          </span>
        </p>
      </div>

      {/* ===== Main Content ===== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 lg:px-10 pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 items-start">
          <div
            className={`animate-fade-in-up-delay-1 gap-5 ${
              mode === "snippet"
                ? "grid xl:grid-rows-[minmax(430px,1fr)_minmax(320px,1fr)]"
                : "flex flex-col"
            }`}
          >
            <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm card-hover overflow-hidden flex h-full flex-col">
              <div className="flex px-4 pt-4 border-b border-card-border/60 bg-background/30">
                <button
                  onClick={() => handleModeChange("snippet")}
                  className={`flex-1 pb-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
                    mode === "snippet"
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-foreground hover:border-text-muted/30"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <TranslateIcon />
                    <span>片段速译 (Snippet)</span>
                  </div>
                </button>
                <button
                  onClick={() => handleModeChange("document")}
                  className={`flex-1 pb-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
                    mode === "document"
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-foreground hover:border-text-muted/30"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <BookOpen />
                    <span>课件精读 (Document)</span>
                  </div>
                </button>
              </div>

              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white">
                    {mode === "snippet" ? <TranslateIcon /> : <BookOpen className="w-4 h-4" />}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {mode === "snippet" ? "片段速译输入" : "课件截图上传"}
                    </h2>
                    <p className="text-xs text-text-muted">
                      {mode === "snippet"
                        ? "支持文本及单张图片混合识别，图片上传后将自动切换为大图预览"
                        : "支持上传多张连续课件截图（最多 5 张）"}
                    </p>
                  </div>
                </div>
                {inputSummary && (
                  <span className="text-xs text-text-light bg-background px-2 py-0.5 rounded-full">
                    {inputSummary}
                  </span>
                )}
              </div>

              <div className="px-6 pb-1">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-border/80 bg-white/75 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.08em] text-text-muted">
                      模型模式
                    </p>
                    <p className="mt-1 text-xs text-text-light">
                      默认使用极速模式；只有开启深度模式时才调用 Pro。
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-1 py-1 text-[11px] shadow-sm">
                    <button
                      onClick={() => setDeepMode(false)}
                      className={`px-3 py-1.5 rounded-full transition-all ${
                        !deepMode
                          ? "bg-primary text-white shadow-sm"
                          : "text-text-muted hover:text-foreground"
                      }`}
                    >
                      极速模式
                    </button>
                    <button
                      onClick={() => setDeepMode(true)}
                      className={`px-3 py-1.5 rounded-full transition-all ${
                        deepMode
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-text-muted hover:text-foreground"
                      }`}
                    >
                      深度模式
                    </button>
                  </div>
                </div>
              </div>

              <div className={`p-5 flex flex-1 flex-col gap-4 ${mode === "snippet" ? "min-h-[280px]" : ""}`}>
                <input
                  ref={snippetFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSnippetFileChange}
                />
                <input
                  ref={documentFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleDocumentFileChange}
                />

                {mode === "snippet" ? (
                  <div className="flex-1 flex flex-col">
                    {!snippetPreviewUrl ? (
                      <textarea
                        id="input-textarea"
                        value={snippetText}
                        onChange={(e) => setSnippetText(e.target.value)}
                        placeholder="在此粘贴外文内容...&#10;例如：Le théorème de Gauss établit que le flux du champ électrique..."
                        className="h-[88px] w-full resize-none rounded-2xl border border-card-border bg-white/80 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-text-light/70 focus:border-primary-light transition-all duration-300"
                      />
                    ) : (
                      <div className="relative group flex-1 min-h-[300px] rounded-[28px] border border-card-border overflow-hidden bg-gradient-to-br from-slate-50 to-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={snippetPreviewUrl}
                          alt="片段预览"
                          className="w-full h-full object-contain bg-white"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all duration-200 flex items-center justify-center">
                          <button
                            onClick={handleRemoveSnippetImage}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-9 h-9 rounded-full bg-white/90 text-red-500 flex items-center justify-center hover:bg-white shadow-lg"
                          >
                            <CloseIcon />
                          </button>
                        </div>
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 text-white text-[10px] flex items-center gap-1.5 backdrop-blur-sm">
                          <ImageIcon />
                          <span className="max-w-[180px] truncate">{snippetFile?.name || "截图"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  documentPreviewUrls.length > 0 && (
                    <div className={`grid gap-3 ${documentPreviewUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {documentPreviewUrls.map((url, idx) => (
                        <div key={idx} className="relative group rounded-xl border border-card-border overflow-hidden bg-background/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`课件预览 ${idx + 1}`}
                            className="w-full h-32 md:h-48 object-contain bg-background/20"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                            <button
                              onClick={() => handleRemoveDocumentImage(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-full bg-white/90 text-red-500 flex items-center justify-center hover:bg-white shadow-lg"
                            >
                              <CloseIcon />
                            </button>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] flex items-center gap-1 backdrop-blur-sm">
                            <ImageIcon />
                            <span className="max-w-[120px] truncate">{documentFiles[idx]?.name || `图 ${idx + 1}`}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {!(mode === "snippet" && snippetFile) && !(mode === "document" && documentFiles.length >= 5) && (
                    <button
                      id="upload-button"
                      onClick={mode === "snippet" ? openSnippetUpload : openDocumentUpload}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-primary-lighter/60 text-primary hover:bg-primary/5 hover:border-primary-light transition-all duration-200 text-sm font-medium"
                    >
                      <UploadIcon />
                      {mode === "snippet" ? "上传课件截图" : "上传多张课件 (上限5张)"}
                    </button>
                  )}

                  {errorMessage && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                      {errorMessage}
                    </div>
                  )}

                  <div className="ml-auto w-full sm:w-auto">
                    <button
                      id="translate-button"
                      onClick={handleTranslate}
                      disabled={isLoading}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white text-sm font-semibold hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                          </svg>
                          解析中...
                        </>
                      ) : (
                        <>
                          <SendIcon />
                          {mode === "snippet" ? "开始速译" : "开始精读解析"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {mode === "snippet" && (
              <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-card-border/60 bg-background/30 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <BookOpen size={14} />
                    </span>
                    关键词速览
                  </h3>
                  {(keywordItemsResult.length > 0 || keywordsResult) && !isLoading && (
                    <span className="text-xs text-amber-600 bg-amber-500/10 px-2 py-1 rounded-md">
                      术语已就绪
                    </span>
                  )}
                </div>
                <div className="p-5 min-h-[260px] flex-1">
                    {isLoading ? (
                      <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(255,251,235,0.72))] shadow-sm flex flex-col items-center justify-center gap-3 text-text-muted">
                        <div className="relative w-10 h-10">
                          <svg className="animate-spin text-amber-500/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        </svg>
                        <svg className="animate-spin text-amber-500 w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-sm animate-pulse">正在提取关键词...</p>
                      <span className="text-xs text-text-light">
                        当前：{deepMode ? "深度模式" : "极速模式"}
                      </span>
                    </div>
                  ) : keywordItemsResult.length > 0 || keywordsResult ? (
                    <Suspense fallback={<div className="text-sm text-text-muted">加载关键词...</div>}>
                      <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(255,251,235,0.7))] shadow-sm overflow-hidden flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border/70 px-4 py-3 bg-white/85">
                          <div>
                            <p className="text-xs font-semibold tracking-[0.08em] text-text-muted">
                              术语整理
                            </p>
                            <p className="mt-1 text-xs text-text-light">
                              每个关键词按法语词、中文释义和定义逐条展示。
                            </p>
                          </div>
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-600">
                            便于复习
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-4 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)]">
                          <KeywordGlossary
                            content={keywordsResult ?? undefined}
                            items={keywordItemsResult}
                          />
                        </div>
                      </div>
                    </Suspense>
                  ) : (
                    <div className="h-full rounded-[28px] border border-dashed border-card-border bg-white/70 flex flex-col items-center justify-center text-text-light text-sm">
                      <div className="w-12 h-12 mb-3 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <BookOpen size={20} />
                      </div>
                      <p>每个关键词会按“法语词 (中文) : 定义”逐条展示。</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className={`animate-fade-in-up-delay-2 gap-5 ${
              mode === "snippet"
                ? "grid xl:grid-rows-[minmax(430px,1fr)_minmax(320px,1fr)]"
                : "flex flex-col"
            }`}
          >
            {mode === "snippet" ? (
              <>
                <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden h-full flex flex-col">
                  <div className="px-5 py-4 border-b border-card-border/60 bg-background/30 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                        <TranslateIcon />
                      </span>
                      精准翻译
                    </h2>
                    {translationResult && !isLoading && (
                      <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
                        译文已就绪
                      </span>
                    )}
                  </div>
                  <div className="p-5 min-h-[280px] flex-1">
                    {isLoading ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
                        <div className="relative w-12 h-12">
                          <svg className="animate-spin text-primary/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          </svg>
                          <svg className="animate-spin text-primary w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                          </svg>
                        </div>
                        <p className="text-sm animate-pulse">正在整理精准译文与公式...</p>
                        <span className="text-xs text-text-light">
                          当前：{deepMode ? "深度模式" : "极速模式"}
                        </span>
                      </div>
                    ) : translationResult ? (
                      <Suspense fallback={<div className="text-sm text-text-muted">加载排版引擎...</div>}>
                        <div className="flex h-full flex-col rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] shadow-sm overflow-hidden">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border/70 px-4 py-3 bg-white/85">
                            <div>
                              <p className="text-xs font-semibold tracking-[0.08em] text-text-muted">
                                译文整理
                              </p>
                              <p className="mt-1 text-xs text-text-light">
                                聚焦中文译文与公式呈现，方便对照左侧原图通读。
                              </p>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                              便于通读
                            </span>
                          </div>
                          <div className="flex-1 overflow-y-auto px-5 py-5 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.06),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
                            <MarkdownRenderer
                              content={translationResult}
                              preserveLineBreaks
                              className="[&_p]:leading-8 [&_p]:text-[15px] [&_li]:leading-8"
                            />
                          </div>
                        </div>
                      </Suspense>
                    ) : snippetPreviewUrl ? (
                      <div className="rounded-[28px] border border-dashed border-card-border bg-white/70 px-5 py-6 text-sm text-text-light flex h-full items-center justify-center text-center">
                        开始解析后，这里会展示整理后的中文译文，方便与左侧原图对照阅读。
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-text-light text-sm">
                        <div className="w-12 h-12 mb-3 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <TranslateIcon />
                        </div>
                        <p>上传截图后，这里会显示整理好的中文译文与公式。</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden h-full flex flex-col">
                  <div className="px-5 py-4 border-b border-card-border/60 bg-background/30 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-teal-500/10 flex items-center justify-center text-teal-500">
                        <FormulaIcon />
                      </span>
                      深度解析
                    </h2>
                    {analysisResult && !isLoading && (
                      <span className="text-xs text-teal-600 font-medium bg-teal-500/10 px-2 py-1 rounded-md">
                        解析已就绪
                      </span>
                    )}
                  </div>
                  <div className="p-5 min-h-[320px] flex-1">
                    {isLoading ? (
                      <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(240,253,250,0.78))] shadow-sm flex flex-col items-center justify-center gap-4 text-text-muted">
                        <div className="relative w-12 h-12">
                          <svg className="animate-spin text-teal-500/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          </svg>
                          <svg className="animate-spin text-teal-500 w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                          </svg>
                        </div>
                        <p className="text-sm animate-pulse">AI 正在补充原理与上下文...</p>
                        <span className="text-xs text-text-light">
                          当前：{deepMode ? "深度模式" : "极速模式"}
                        </span>
                      </div>
                    ) : analysisResult ? (
                      <Suspense fallback={<div className="text-sm text-text-muted">加载分析结果...</div>}>
                        <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(240,253,250,0.78))] shadow-sm overflow-hidden flex flex-col">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border/70 px-4 py-3 bg-white/85">
                            <div>
                              <p className="text-xs font-semibold tracking-[0.08em] text-text-muted">
                                原理拆解
                              </p>
                              <p className="mt-1 text-xs text-text-light">
                                帮你理解原理、公式含义和知识点之间的关系。
                              </p>
                            </div>
                            <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-medium text-teal-600">
                              更易理解
                            </span>
                          </div>
                          <div className="flex-1 overflow-y-auto px-5 py-5 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f0fdfa_100%)]">
                            <MarkdownRenderer content={analysisResult} className="[&_p]:leading-8 [&_p]:text-[15px] [&_li]:leading-8" />
                          </div>
                        </div>
                      </Suspense>
                    ) : (
                      <div className="h-full rounded-[28px] border border-dashed border-card-border bg-white/70 flex flex-col items-center justify-center text-text-light text-sm">
                        <div className="w-12 h-12 mb-3 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-500">
                          <FormulaIcon />
                        </div>
                        <p>这里会展示对原理、公式含义和知识点关系的中文解析。</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-card-bg rounded-3xl border border-card-border shadow-sm overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-card-border/60 bg-background/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </div>
                    <h2 className="text-base font-semibold text-foreground">解析结果</h2>
                  </div>
                  {(mindmapResult || (quizResult && quizResult.length > 0)) && !isLoading && (
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
                      渲染完成
                    </span>
                  )}
                </div>

                <div className="flex-1 p-5 overflow-y-auto min-h-[400px]">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
                      <div className="relative w-12 h-12">
                        <svg className="animate-spin text-primary/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        </svg>
                        <svg className="animate-spin text-primary w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-sm animate-pulse">AI 正在深度分析中...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {!mindmapResult && (!quizResult || quizResult.length === 0) && (
                        <div className="h-full flex flex-col items-center justify-center text-text-light py-12">
                          <div className="w-16 h-16 mb-4 rounded-full bg-card-border flex items-center justify-center">
                            <BookOpen size={24} />
                          </div>
                          <p className="text-sm">解析结果将生成知识脉络导图与随堂小测。</p>
                        </div>
                      )}

                      {mindmapResult && (
                        <div className="p-4 rounded-xl bg-background border border-card-border shadow-sm overflow-x-auto">
                          <h3 className="text-sm font-semibold text-indigo-500 mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 17 22 12" /></svg>
                            </span>
                            知识脉络导图
                          </h3>
                          <Suspense fallback={<div className="text-sm text-text-muted">加载导图渲染引擎...</div>}>
                            <div className="min-w-[500px]">
                              <MermaidRenderer code={mindmapResult} />
                            </div>
                          </Suspense>
                        </div>
                      )}

                      {quizResult && quizResult.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-2 px-1">
                            <h3 className="text-sm font-semibold text-rose-500 flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-rose-500/10 flex items-center justify-center">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                              </span>
                              随堂小测 ({quizResult.length}题)
                            </h3>
                            <div className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-1 py-1 text-[11px]">
                              <button
                                onClick={() => setQuizLang("zh")}
                                className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "zh" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
                              >
                                中
                              </button>
                              <button
                                onClick={() => setQuizLang("fr")}
                                className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "fr" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
                              >
                                法
                              </button>
                              <button
                                onClick={() => setQuizLang("en")}
                                className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "en" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
                              >
                                En
                              </button>
                            </div>
                          </div>
                          {quizResult.map((q, idx) => {
                            const options = getQuizOptions(q, quizLang);
                            const explanation = getQuizExplanation(q, quizLang);
                            const answer = getQuizAnswer(q, quizLang);

                            return (
                              <div key={idx} className="p-4 rounded-xl bg-background border border-card-border shadow-sm">
                                <div className="mb-3 flex items-start gap-2">
                                  <span className="pt-0.5 text-sm font-medium text-foreground">
                                    {idx + 1}.
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <MarkdownRenderer
                                      content={getQuizQuestion(q, quizLang)}
                                      className="[&>p]:mb-0 [&_p]:text-sm [&_p]:font-medium [&_p]:leading-7 [&_.math-display]:my-1 [&_.math-display]:py-1"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2 mb-4">
                                  {options?.map((opt, optIdx) => (
                                    <div key={optIdx} className="px-3 py-2 rounded-lg bg-card-bg border border-card-border/50 text-sm hover:border-primary/30 transition-colors">
                                      <div className="flex items-start gap-2">
                                        <span className="pt-0.5 font-medium text-foreground">
                                          {String.fromCharCode(65 + optIdx)}.
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <MarkdownRenderer
                                            content={opt}
                                            className="[&>p]:mb-0 [&_p]:text-sm [&_p]:leading-6 [&_.math-display]:my-1 [&_.math-display]:py-1"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <details className="group">
                                  <summary className="text-xs font-medium text-primary cursor-pointer hover:underline outline-none list-none flex items-center gap-1">
                                    <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                    {getQuizActionLabel(quizLang)}
                                  </summary>
                                  <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-sm">
                                    <div className="mb-2 flex items-start gap-1.5 text-emerald-600">
                                      <span className="pt-0.5 text-sm font-semibold">
                                        {getQuizAnswerLabel(quizLang)}：
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <MarkdownRenderer
                                          content={answer}
                                          className="[&>p]:mb-0 [&_p]:text-sm [&_p]:font-semibold [&_p]:leading-6 [&_.math-display]:my-1 [&_.math-display]:py-1"
                                        />
                                      </div>
                                    </div>
                                    {explanation && (
                                      <MarkdownRenderer
                                        content={explanation}
                                        className="[&_p]:text-sm [&_p]:leading-7 [&_li]:text-sm [&_li]:leading-7 text-text-muted"
                                      />
                                    )}
                                  </div>
                                </details>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {mindmapResult && (!quizResult || quizResult.length === 0) && (
                        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/70 px-4 py-4 text-sm text-rose-600">
                          本次已成功生成知识脉络导图，但随堂小测暂未生成。你可以重新点击“开始精读解析”再试一次。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===== Bottom AI Chat Button ===== */}
      <div className="fixed bottom-6 right-6 z-50 animate-fade-in-up-delay-3">
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring" />

        {/* Chat FAB */}
        <button
          id="ai-chat-button"
          onClick={() => setChatOpen(!chatOpen)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-light text-white shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 animate-float"
        >
          {chatOpen ? <CloseIcon /> : <ChatIcon />}
        </button>
      </div>

      {/* ===== Chat Panel ===== */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] bg-card-bg rounded-2xl border border-card-border shadow-2xl shadow-primary/10 overflow-hidden animate-fade-in-up">
          {/* Chat Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-primary-dark to-primary text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <SparkleIcon />
            </div>
            <div>
              <p className="text-sm font-semibold">AI 助教</p>
              <p className="text-[10px] text-white/70">
                {translationResult ? "已加载翻译上下文 · 可继续追问" : "随时为你解答学术疑问"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="text-[10px] text-white/60 hover:text-white/90 transition-colors"
                  title="清空对话"
                >
                  清空
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-white/70">在线</span>
              </div>
            </div>
          </div>

          {/* Context Indicator */}
          {translationResult && (
            <div className="px-4 py-2 bg-primary/5 border-b border-card-border/50 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <span className="text-[10px] text-text-muted truncate">已关联当前翻译结果，可直接追问相关问题</span>
            </div>
          )}

          {/* Chat Body */}
          <div ref={chatBodyRef} className="h-[320px] p-4 overflow-y-auto bg-background/50 space-y-3">
            {/* Welcome message (always visible) */}
            <div className="flex gap-2.5">
              <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
                <SparkleIcon />
              </div>
              <div className="bg-card-bg rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm text-foreground border border-card-border shadow-sm max-w-[290px]">
                <p>
                  你好！我是
                  <strong className="text-primary">智译西电 AI 助教</strong>
                  。🎓
                </p>
                <p className="mt-1.5 text-text-muted text-xs leading-relaxed">
                  {translationResult
                    ? "我已获取你刚才的翻译结果，你可以直接对其中的内容提问，比如「能用大白话再解释一下吗？」"
                    : "我可以帮你解答法语/英语教材中的疑问，解释专业术语，或推导相关公式。请随时提问！"}
                </p>
              </div>
            </div>

            {/* Conversation Messages */}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
                    <SparkleIcon />
                  </div>
                )}
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-sm max-w-[290px] overflow-x-auto ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary-light text-white rounded-tr-sm"
                      : "bg-card-bg text-foreground border border-card-border shadow-sm rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Suspense fallback={<span className="animate-pulse">...</span>}>
                      <MarkdownRenderer content={msg.content} />
                    </Suspense>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content}</pre>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-white text-xs font-bold">
                    我
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isChatLoading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
                  <SparkleIcon />
                </div>
                <div className="bg-card-bg rounded-xl rounded-tl-sm px-4 py-3 border border-card-border shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-card-border bg-card-bg">
            <div className="flex items-center gap-2 bg-background rounded-xl px-3 py-1 border border-card-border focus-within:border-primary-light transition-colors duration-200">
              <input
                id="chat-input"
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder={translationResult ? "对翻译结果有疑问？在这里追问..." : "输入你的学术问题..."}
                disabled={isChatLoading}
                className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-text-light outline-none disabled:opacity-50"
              />
              <button
                onClick={handleChatSend}
                disabled={isChatLoading || !chatMessage.trim()}
                className="w-8 h-8 rounded-lg bg-gradient-to-r from-primary to-primary-light text-white flex items-center justify-center hover:shadow-md transition-all duration-200 shrink-0 disabled:opacity-40 disabled:hover:shadow-none"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Bottom Chat Banner (when chat is closed) ===== */}
      {!chatOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-[1440px] mx-auto px-4 lg:px-10 pb-4">
            <button
              id="chat-banner"
              onClick={() => setChatOpen(true)}
              className="w-full glass border border-card-border rounded-2xl px-6 py-3.5 flex items-center gap-3 hover:border-primary-light/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white shadow-md shadow-primary/20">
                <ChatIcon />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  呼叫 AI 助教
                </p>
                <p className="text-xs text-text-muted">
                  解答学术疑问 · 翻译辅助 · 公式推导
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2 text-text-light group-hover:text-primary transition-colors">
                <span className="text-xs font-medium">开始对话</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
