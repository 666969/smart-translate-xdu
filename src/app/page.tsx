"use client";

import { useState, useRef, useEffect, useEffectEvent, lazy, Suspense } from "react";
import type { KeywordItem } from "./components/KeywordGlossary";
import { normalizeTranslationLayout } from "@/lib/translationLayout";
import { useAppSession, type HomeMode } from "./components/AppSessionProvider";

const MarkdownRenderer = lazy(() => import("./components/MarkdownRenderer"));
const KeywordGlossary = lazy(() => import("./components/KeywordGlossary"));
const DocumentMindmapPanel = lazy(() => import("./components/DocumentMindmapPanel"));
const DocumentQuizPanel = lazy(() => import("./components/DocumentQuizPanel"));
const ExportButton = lazy(() => import("./components/ExportButton"));
const PdfWorkspace = lazy(() => import("./components/PdfWorkspace"));
const TextbookTranslationRenderer = lazy(
  () => import("./components/TextbookTranslationRenderer")
);
import Header from "./components/Header";
import OperationProgress from "./components/OperationProgress";
import { BookOpen, Save } from "lucide-react";
import { useLesson } from "@/hooks/useLesson";
import { saveLessonRecord } from "@/lib/db";
import { studySaveError, usesCloudStudy } from "@/lib/studyStorage";
import { buildLearningNoteMarkdown } from "@/lib/markdownExport";
import { postWithUploadProgress, type ProgressValue } from "@/lib/uploadProgress";
import { IMAGE_MIME_TYPES, isPdfFile, MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_MESSAGES, MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_PDF_BYTES, MAX_SNIPPET_CHARS } from "@/lib/studyLimits";

/* ========== Types ========== */

type TranslateTask = "quick" | "study" | "mindmap" | "quiz";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DEMO_SNIPPET_TEXT =
  "Le système linéaire étudié est caractérisé par sa fonction de transfert H(p). Pour analyser sa stabilité, on observe les pôles du dénominateur et la réponse impulsionnelle du circuit.";

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

      const term_en = typeof record.term_en === "string" ? record.term_en.trim() : "";
      if ((!term_fr && !term_en) || !term_zh || !definition_zh) return null;
      const language = record.language === "en" ? "en" as const : "fr" as const;
      return { term_fr, term_en, language, term_zh, definition_zh };
    })
    .filter((item) => item !== null);
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
  const { home, pendingPdfUpload } = useAppSession();
  const { ownerId, lesson, loading: authLoading } = useLesson();
  const {
    mode: workspaceMode,
    setMode,
    deepMode,
    setDeepMode,
    snippetText,
    setSnippetText,
    snippetFile,
    setSnippetFile,
    snippetPreviewUrl,
    setSnippetPreviewUrl,
    documentFiles,
    setDocumentFiles,
    documentPreviewUrls,
    setDocumentPreviewUrls,
    quizLang,
    setQuizLang,
    chatOpen,
    setChatOpen,
    chatMessage,
    setChatMessage,
    chatMessages,
    setChatMessages,
    originalTextResult,
    setOriginalTextResult,
    sourceLanguage,
    setSourceLanguage,
    translationResult,
    setTranslationResult,
    translationLayoutResult,
    setTranslationLayoutResult,
    analysisResult,
    setAnalysisResult,
    keywordsResult,
    setKeywordsResult,
    keywordItemsResult,
    setKeywordItemsResult,
    mermaidData,
    setMermaidData,
    quizData,
    setQuizData,
    errorMessage,
    setErrorMessage,
  } = home;
  const mode = workspaceMode === "document" ? "document" : "snippet";
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [loadingTask, setLoadingTask] = useState<TranslateTask | null>(null);
  const [imageUpload, setImageUpload] = useState<{ progress?: ProgressValue } | null>(null);
  const isLoading = loadingTask !== null;
  const [saveNotice, setSaveNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const translationRequest = useRef<AbortController | null>(null);
  const notes = useRef<Partial<Record<"snippet" | "document", string>>>({});
  useEffect(() => () => translationRequest.current?.abort(), []);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepth = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  // 翻译等待计时器
  useEffect(() => {
    if (!isLoading) {
      setLoadingElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  // 聊天窗自动滚动到底部
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  const handleModeChange = (nextMode: HomeMode) => {
    if (workspaceMode === nextMode) return;
    translationRequest.current?.abort();
    setLoadingTask(null);
    fileDragDepth.current = 0;
    setIsDraggingFiles(false);
    setMode(nextMode);
    setErrorMessage(null);
    setSaveNotice("");
  };

  function invalidateInput(nextMode: "snippet" | "document") {
    translationRequest.current?.abort();
    setLoadingTask(null);
    setErrorMessage(null);
    setSaveNotice("");
    delete notes.current[nextMode];
    if (nextMode === "snippet") {
      setOriginalTextResult(null);
      setSourceLanguage(null);
      setTranslationResult(null);
      setTranslationLayoutResult([]);
      setAnalysisResult(null);
      setKeywordsResult(null);
      setKeywordItemsResult([]);
      setChatMessages([]);
    } else {
      setMermaidData(null);
      setQuizData(null);
    }
  }

  function changeSnippetText(value: string) {
    invalidateInput("snippet");
    setSnippetText(value);
  }
  const fillDemoSnippetText = () => changeSnippetText(DEMO_SNIPPET_TEXT);

  function acceptImages(files: File[], nextMode: "snippet" | "document") {
    if (!files.length) return;
    const images = files.map((file) => {
      if (file.type) return file;
      const extension = file.name.match(/\.(png|jpe?g|webp|gif)$/i)?.[1].toLowerCase();
      if (!extension) return file;
      const type = `image/${extension === "jpg" ? "jpeg" : extension}`;
      return new File([file], file.name, { type, lastModified: file.lastModified });
    });
    if (images.some((file) => !file.size || !IMAGE_MIME_TYPES.includes(file.type))) {
      setErrorMessage("请选择 PNG、JPEG、WebP、GIF 图片或一份 PDF。");
      return;
    }
    const remaining = nextMode === "snippet" ? 1 : MAX_IMAGE_COUNT - documentFiles.length;
    if (remaining <= 0) {
      setErrorMessage("最多上传 5 张课件截图。");
      return;
    }
    const selected = images.slice(0, remaining);
    const existing = nextMode === "snippet" ? 0 : documentFiles.reduce((size, file) => size + file.size, 0);
    if (existing + selected.reduce((size, file) => size + file.size, 0) > MAX_IMAGE_BYTES) {
      setErrorMessage("截图总大小需在 4 MB 以内，请裁剪或压缩后再试。");
      return;
    }
    invalidateInput(nextMode);
    if (nextMode === "snippet") {
      if (snippetPreviewUrl) URL.revokeObjectURL(snippetPreviewUrl);
      setSnippetFile(selected[0]);
      setSnippetPreviewUrl(URL.createObjectURL(selected[0]));
    } else {
      const previewUrls = selected.map((file) => URL.createObjectURL(file));
      setDocumentFiles((previous) => [...previous, ...selected]);
      setDocumentPreviewUrls((previous) => [...previous, ...previewUrls]);
    }
    if (selected.length < files.length) setErrorMessage("已按当前模式的图片数量上限添加截图。");
  }

  const pasteImages = useEffectEvent((event: ClipboardEvent) => {
    if (workspaceMode === "pdf") return;
    if (event.target instanceof HTMLElement && event.target.id === "chat-input") return;
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    acceptImages(files, mode);
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => pasteImages(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  function acceptFiles(files: File[]) {
    const pdf = files.find(isPdfFile);
    if (!pdf) {
      acceptImages(files, mode);
      return;
    }
    if (files.length !== 1) {
      setErrorMessage("请单独选择一份 PDF，图片可以另行添加。");
      return;
    }
    if (!pdf.size || pdf.size > MAX_PDF_BYTES) {
      setErrorMessage("请选择 30 MB 以内的有效 PDF。");
      return;
    }
    if (authLoading) {
      setErrorMessage("正在确认登录状态，请稍后重新添加 PDF。");
      return;
    }
    pendingPdfUpload.current = { file: pdf, ownerId };
    handleModeChange("pdf");
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function preventFileNavigation(event: React.DragEvent) {
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  }

  function handleFileDragEnter(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    fileDragDepth.current += 1;
    setIsDraggingFiles(true);
  }

  function handleFileDragOver(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleFileDragLeave() {
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (fileDragDepth.current === 0) setIsDraggingFiles(false);
  }

  function handleFileDrop(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    fileDragDepth.current = 0;
    setIsDraggingFiles(false);
    acceptFiles(Array.from(event.dataTransfer.files));
  }

  function handleRemoveSnippetImage() {
    invalidateInput("snippet");
    if (snippetPreviewUrl) URL.revokeObjectURL(snippetPreviewUrl);
    setSnippetFile(null);
    setSnippetPreviewUrl(null);
  }

  function handleRemoveDocumentImage(index: number) {
    invalidateInput("document");
    const url = documentPreviewUrls[index];
    if (url) URL.revokeObjectURL(url);
    setDocumentFiles((previous) => previous.filter((_, position) => position !== index));
    setDocumentPreviewUrls((previous) => previous.filter((_, position) => position !== index));
  }

  const handleTranslate = async (task: TranslateTask) => {
    if (isLoading) return;
    if (mode === "snippet" && !snippetText.trim() && !snippetFile) {
      setErrorMessage("请输入外文文本、粘贴或上传一张课件截图。");
      return;
    }
    if (mode === "document" && !documentFiles.length) {
      setErrorMessage("请粘贴或上传至少一张课件截图。");
      return;
    }
    const request = new AbortController();
    translationRequest.current?.abort();
    translationRequest.current = request;
    setLoadingTask(task);
    const hasImages = mode === "snippet" ? Boolean(snippetFile) : documentFiles.length > 0;
    setImageUpload(hasImages ? {} : null);
    setErrorMessage(null);
    setSaveNotice("");

    try {
      const form = new FormData();
      form.append("mode", mode);
      form.append("task", task);
      form.append("deep_mode", deepMode ? "true" : "false");
      if (sourceLanguage) form.append("language", sourceLanguage);
      if (mode === "snippet") {
        if (snippetText.trim()) form.append("text", snippetText.trim());
        if (snippetFile) form.append("image", snippetFile);
      } else {
        documentFiles.forEach((file) => form.append("image", file));
      }
      const timeout = getTranslateTimeoutMs({
        mode, hasSnippetImage: Boolean(snippetFile), documentImageCount: documentFiles.length,
      });
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]);
      const response = hasImages
        ? await postWithUploadProgress("/api/translate", form, signal, (progress) => {
            if (!request.signal.aborted) setImageUpload(progress ? { progress } : null);
          })
        : await fetch("/api/translate", { method: "POST", body: form, signal });
      const data = await response.json().catch(() => null);
      if (request.signal.aborted) return;
      if (!response.ok || !data) throw new Error(data?.error || "请求失败，请重试。");
      if (task === "quick") {
        setOriginalTextResult(data.original_text || snippetText || null);
        setSourceLanguage(data.source_language === "en" || data.source_language === "fr" ? data.source_language : null);
        setTranslationResult(data.translation);
        setTranslationLayoutResult(normalizeTranslationLayout(data.translation_layout));
      } else if (task === "study") {
        setAnalysisResult(data.analysis);
        setKeywordsResult(data.keywords || null);
        setKeywordItemsResult(normalizeKeywordItems(data.keyword_items));
      } else if (task === "mindmap") {
        setMermaidData(data.mermaid);
      } else {
        setQuizData(data.quiz);
        if (data.incomplete) setErrorMessage("已展示通过校验的题目。需要补足时，可重新生成小测。");
      }
    } catch (error) {
      if (!request.signal.aborted) setErrorMessage(error instanceof DOMException && error.name === "TimeoutError"
        ? "请求超时，可稍后重试或减少截图。"
        : error instanceof Error ? error.message : "请求失败，请重试。");
    } finally {
      if (!request.signal.aborted) {
        setLoadingTask(null);
        setImageUpload(null);
      }
    }
  };

  async function saveStudyNote() {
    if (isSaving || authLoading) return;
    const id = notes.current[mode] ??= crypto.randomUUID();
    const markdown = buildLearningNoteMarkdown(mode === "snippet"
      ? { mode, originalText: originalTextResult, translation: translationResult, analysis: analysisResult, keywords: keywordsResult }
      : { mode, mermaid: mermaidData, quiz: quizData });
    setIsSaving(true);
    try {
      await saveLessonRecord({
        id, ownerId, lesson, kind: "translation", markdown, updatedAt: Date.now(),
        title: mode === "snippet" ? snippetFile?.name || "片段速译" : "课件截图练习",
      });
      setSaveNotice(usesCloudStudy(ownerId)
        ? "已保存到云端课程档案。"
        : lesson ? "已保存到「" + lesson + "」。" : "已保存到笔记本的未分类课程档案。");
    } catch (error) {
      setSaveNotice(studySaveError(error, ownerId));
    } finally {
      setIsSaving(false);
    }
  }

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
          messages: updatedMessages.slice(-MAX_CHAT_MESSAGES).map(({ role, content }) => ({
            role, content: content.slice(0, MAX_CHAT_MESSAGE_CHARS),
          })),
          deepMode,
          context: {
            originalText: originalTextResult || snippetText || undefined,
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
  const panelColumnClass = mode === "snippet"
    ? "grid lg:row-span-2 lg:grid-rows-subgrid lg:self-stretch"
    : "flex flex-col";

  const modeOptions = [
    { id: "snippet", icon: <TranslateIcon />, label: "片段速译" },
    { id: "pdf", icon: <BookOpen size={22} />, label: "课件精读 (PDF)" },
    { id: "document", icon: <ImageIcon />, label: "截图练习" },
  ] as const;
  const modeTabs = (
    <div className="flex px-3 pt-4 border-b border-card-border/60 bg-background/30" role="group" aria-label="教材翻译模式">
      {modeOptions.map(({ id, icon, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={workspaceMode === id}
          onClick={() => handleModeChange(id)}
          className={`flex flex-1 flex-col items-center gap-1 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
            workspaceMode === id
              ? "border-primary text-primary"
              : "border-transparent text-text-muted hover:text-foreground hover:border-text-muted/30"
          }`}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );

  if (workspaceMode === "pdf") {
    return (
      <div className="min-h-screen bg-background" onDragOver={preventFileNavigation} onDrop={preventFileNavigation}>
        <Header />
        <div className="mx-auto max-w-[1440px] px-4 pt-6 lg:px-10">
          <div className="max-w-xl overflow-hidden rounded-2xl border border-card-border bg-card-bg">{modeTabs}</div>
        </div>
        <Suspense fallback={<p role="status" className="mx-auto max-w-[1440px] px-4 py-6 text-sm text-text-muted lg:px-10">正在打开课件精读…</p>}>
          <PdfWorkspace embedded />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background" onDragOver={preventFileNavigation} onDrop={preventFileNavigation}>
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
        {(mode === "snippet" ? translationResult : mermaidData || quizData?.length) ? (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {saveNotice && <span role="status" className="text-xs text-text-muted">{saveNotice}</span>}
            <button type="button" onClick={() => void saveStudyNote()} disabled={isSaving || authLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-card-border bg-white px-3 py-2 text-xs text-primary disabled:opacity-50">
              <Save size={15} />{isSaving ? "保存中" : "保存到本节课"}
            </button>
          </div>
        ) : null}
        <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 lg:gap-y-5 items-start ${
          mode === "snippet" ? "xl:grid-rows-[minmax(430px,auto)_minmax(320px,auto)]" : ""
        }`}>
          <div className={`animate-fade-in-up-delay-1 gap-5 ${panelColumnClass}`}>
            <div
              id="translation-drop-zone"
              className="relative bg-card-bg rounded-3xl border border-card-border shadow-sm card-hover overflow-hidden flex h-full flex-col"
              onDragEnter={handleFileDragEnter}
              onDragOver={handleFileDragOver}
              onDragLeave={handleFileDragLeave}
              onDrop={handleFileDrop}
            >
              {isDraggingFiles && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 grid place-items-center border-2 border-dashed border-primary rounded-3xl bg-blue-50/90 px-4 text-center text-sm font-semibold text-primary-dark">
                  松开即可添加文件
                </div>
              )}
              {modeTabs}

              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white">
                    {mode === "snippet" ? <TranslateIcon /> : <BookOpen className="w-4 h-4" />}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {mode === "snippet" ? "片段速译输入" : "课件截图上传"}
                    </h2>
                    <p id="translation-upload-help" className="text-xs text-text-muted">
                      {mode === "snippet"
                        ? "拖入图片或 PDF，也可用 Ctrl+V 粘贴截图"
                        : `拖入或粘贴截图（最多 ${MAX_IMAGE_COUNT} 张，共 4 MB），也可拖入 PDF`}
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
                      按需学习
                    </p>
                    <p className="mt-1 text-xs text-text-light">
                      {mode === "snippet" ? "先看双语对照，再按需解释原理和术语。" : "分别生成知识导图和三语小测。"}
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
                      简明讲解
                    </button>
                    <button
                      onClick={() => setDeepMode(true)}
                      className={`px-3 py-1.5 rounded-full transition-all ${
                        deepMode
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-text-muted hover:text-foreground"
                      }`}
                    >
                      深入讲解
                    </button>
                  </div>
                </div>
              </div>

              <div className={`p-5 flex flex-1 flex-col gap-4 ${mode === "snippet" ? "min-h-[280px]" : ""}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={`${IMAGE_MIME_TYPES.join(",")},application/pdf,.pdf`}
                  multiple={mode === "document"}
                  className="hidden"
                  onChange={handleFileChange}
                />

                {mode === "snippet" ? (
                  <div className="flex-1 flex flex-col">
                    {!snippetPreviewUrl ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          id="input-textarea"
                          value={snippetText}
                          onChange={(e) => changeSnippetText(e.target.value)}
                          maxLength={MAX_SNIPPET_CHARS}
                          placeholder="在此粘贴外文内容...&#10;例如：Le théorème de Gauss établit que le flux du champ électrique..."
                          className="h-[108px] w-full resize-none rounded-2xl border border-card-border bg-white/80 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-text-light/70 focus:border-primary-light transition-all duration-300"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={fillDemoSnippetText}
                            className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10"
                          >
                            填入演示文本
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group flex-1 min-h-[300px] rounded-[28px] border border-card-border overflow-hidden bg-gradient-to-br from-slate-50 to-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={snippetPreviewUrl}
                          alt="片段预览"
                          className="w-full h-full object-contain bg-white"
                        />
                        <div className="absolute top-3 right-3 flex items-center justify-center z-10">
                          <button
                            onClick={handleRemoveSnippetImage}
                            className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm text-red-500 flex items-center justify-center hover:bg-white shadow-md border border-red-500/10 transition-transform hover:scale-105"
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
                        <div key={url} id={"document-image-" + (idx + 1)} className="relative group scroll-mt-28 rounded-xl border border-card-border overflow-hidden bg-background/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`课件预览 ${idx + 1}`}
                            className="w-full h-32 md:h-48 object-contain bg-background/20"
                          />
                          <div className="absolute top-2 right-2 flex items-center justify-center z-10">
                            <button
                              onClick={() => handleRemoveDocumentImage(idx)}
                              className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm text-red-500 flex items-center justify-center hover:bg-white shadow-md border border-red-500/10 transition-transform hover:scale-105"
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

                {isLoading && <OperationProgress
                  label={imageUpload ? "正在上传截图"
                    : loadingTask === "quiz" ? "正在生成三语小测"
                      : loadingTask === "mindmap" ? "正在生成知识导图"
                        : loadingTask === "study" ? "正在整理原理和术语" : "正在生成译文"}
                  progress={imageUpload?.progress}
                  detail={imageUpload ? undefined : "已用时 " + loadingElapsed + " 秒"}
                />}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    id="upload-button"
                    type="button"
                    aria-describedby="translation-upload-help"
                    title="PDF 会在课件精读中打开"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-primary-lighter/60 text-primary hover:bg-primary/5 hover:border-primary-light transition-all duration-200 text-sm font-medium"
                  >
                    <UploadIcon />拖放或选择文件
                  </button>

                  {errorMessage && (
                    <div role="alert" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                      {errorMessage}
                    </div>
                  )}

                  <div className="ml-auto flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                    <button type="button" disabled={isLoading || (mode === "snippet" && !translationResult)}
                      onClick={() => void handleTranslate(mode === "snippet" ? "study" : "quiz")}
                      className="rounded-xl border border-primary/20 px-4 py-2 text-sm font-medium text-primary disabled:opacity-50">
                      {mode === "snippet" ? "讲原理和术语" : "生成三语小测"}
                    </button>
                    <button
                      id="translate-button"
                      onClick={() => void handleTranslate(mode === "snippet" ? "quick" : "mindmap")}
                      disabled={isLoading}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white text-sm font-semibold hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                          </svg>
                          {loadingTask === "study" ? "讲解生成中" : loadingTask === "quiz" ? "小测生成中" : "处理中"} · {loadingElapsed}s
                        </>
                      ) : (
                        <>
                          <SendIcon />
                          {mode === "snippet" ? "开始速译" : "生成知识导图"}
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
                  {(keywordItemsResult.length > 0 || keywordsResult) && loadingTask !== "study" && (
                    <span className="text-xs text-amber-600 bg-amber-500/10 px-2 py-1 rounded-md">
                      术语已就绪
                    </span>
                  )}
                </div>
                <div className="p-5 min-h-[260px] flex-1">
                    {loadingTask === "study" && !keywordItemsResult.length ? (
                      <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(255,251,235,0.72))] shadow-sm flex flex-col items-center justify-center gap-3 text-text-muted">
                        <div className="relative w-10 h-10">
                          <svg className="animate-spin text-amber-500/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        </svg>
                        <svg className="animate-spin text-amber-500 w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-sm animate-pulse">正在提取关键词... {loadingElapsed}s</p>
                      <span className="text-xs text-text-light">
                        当前：{deepMode ? "深度模式" : "极速模式"} · {deepMode ? "深度模式通常 20-60 秒" : "极速模式通常 10-30 秒"}
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

          <div className={`animate-fade-in-up-delay-2 gap-5 ${panelColumnClass}`}>
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
                    {translationResult && loadingTask !== "quick" && (
                      <div className="flex items-center gap-2">
                        <Suspense fallback={null}>
                          <ExportButton
                            originalText={originalTextResult}
                            translation={translationResult}
                            analysis={analysisResult}
                            keywords={keywordsResult}
                            mermaid={mermaidData}
                            mode={mode}
                          />
                        </Suspense>
                        <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
                          译文已就绪
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5 min-h-[280px] flex-1">
                    {loadingTask === "quick" && !translationResult ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
                        <div className="relative w-12 h-12">
                          <svg className="animate-spin text-primary/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          </svg>
                          <svg className="animate-spin text-primary w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                          </svg>
                        </div>
                        <p className="text-sm animate-pulse">正在整理精准译文与公式... {loadingElapsed}s</p>
                        <span className="text-xs text-text-light">
                          当前：{deepMode ? "深度模式" : "极速模式"} · {snippetFile ? "图片模式通常 30-60 秒" : "极速模式通常 10-30 秒"}
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
                            {originalTextResult && <details open className="mb-4 rounded-xl border border-card-border bg-white p-3">
                              <summary className="cursor-pointer text-sm font-medium text-primary">
                                {sourceLanguage === "en" ? "英语原文" : sourceLanguage === "fr" ? "法语原文" : "课件原文"}
                              </summary>
                              <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">{originalTextResult}</p>
                            </details>}
                            <TextbookTranslationRenderer
                              layout={translationLayoutResult}
                              fallbackContent={translationResult}
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
                    {analysisResult && loadingTask !== "study" && (
                      <span className="text-xs text-teal-600 font-medium bg-teal-500/10 px-2 py-1 rounded-md">
                        解析已就绪
                      </span>
                    )}
                  </div>
                  <div className="p-5 min-h-[320px] flex-1">
                    {loadingTask === "study" && !analysisResult ? (
                      <div className="h-full rounded-[28px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(240,253,250,0.78))] shadow-sm flex flex-col items-center justify-center gap-4 text-text-muted">
                        <div className="relative w-12 h-12">
                          <svg className="animate-spin text-teal-500/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          </svg>
                          <svg className="animate-spin text-teal-500 w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                          </svg>
                        </div>
                        <p className="text-sm animate-pulse">AI 正在补充原理与上下文... {loadingElapsed}s</p>
                        <span className="text-xs text-text-light">
                          当前：{deepMode ? "深度模式" : "极速模式"} · {deepMode ? "深度模式通常 20-60 秒" : "极速模式通常 10-30 秒"}
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
                            <MarkdownRenderer content={analysisResult} compact className="[&_p]:leading-[1.85] [&_p]:text-[15px] [&_li]:leading-[1.8] [&_li]:text-[15px]" />
                          </div>
                        </div>
                      </Suspense>
                    ) : (
                      <div className="h-full rounded-[28px] border border-dashed border-card-border bg-white/70 flex flex-col items-center justify-center text-text-light text-sm">
                        <div className="w-12 h-12 mb-3 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-500">
                          <FormulaIcon />
                        </div>
                        <p>速译后点击「讲原理和术语」，查看公式含义和知识点关系。</p>
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
                  {(mermaidData || (quizData && quizData.length > 0)) && (
                    <div className="flex items-center gap-2">
                      <Suspense fallback={null}>
                        <ExportButton
                          mermaid={mermaidData}
                          quiz={quizData}
                          mode={mode}
                        />
                      </Suspense>
                      <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
                        渲染完成
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-5 overflow-y-auto min-h-[400px]">
                  {isLoading && !mermaidData && !quizData?.length ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
                      <div className="relative w-12 h-12">
                        <svg className="animate-spin text-primary/30 w-full h-full" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        </svg>
                        <svg className="animate-spin text-primary w-full h-full absolute top-0 left-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-sm animate-pulse">AI 正在深度分析中... {loadingElapsed}s</p>
                      <span className="text-xs text-text-light">截图练习通常需要 30-90 秒</span>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {!mermaidData && (!quizData || quizData.length === 0) && (
                        <div className="h-full flex flex-col items-center justify-center text-text-light py-12">
                          <div className="w-16 h-16 mb-4 rounded-full bg-card-border flex items-center justify-center">
                            <BookOpen size={24} />
                          </div>
                          <p className="text-sm">解析结果将生成知识脉络导图与随堂小测。</p>
                        </div>
                      )}

                      {mermaidData && (
                        <Suspense fallback={<div className="text-sm text-text-muted">加载导图渲染引擎...</div>}>
                          <DocumentMindmapPanel mermaidData={mermaidData} />
                        </Suspense>
                      )}

                      {quizData && quizData.length > 0 && (
                        <Suspense fallback={<div className="text-sm text-text-muted">加载小测渲染中...</div>}>
                          <DocumentQuizPanel
                            sourceImages={documentFiles.map((file) => file.name)}
                            quizData={quizData}
                            quizLang={quizLang}
                            onQuizLangChange={setQuizLang}
                          />
                        </Suspense>
                      )}

                      {mermaidData && (!quizData || quizData.length === 0) && (
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
          aria-label={chatOpen ? "关闭助教对话" : "打开助教对话"}
          aria-expanded={chatOpen}
          onClick={() => setChatOpen(!chatOpen)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-light text-white shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 animate-float"
        >
          {chatOpen ? <CloseIcon /> : <ChatIcon />}
        </button>
      </div>

      {/* ===== Chat Panel ===== */}
      {chatOpen && (
        <div
          role="dialog"
          aria-label="AI 助教对话"
          className="fixed bottom-24 right-6 z-50 flex max-h-[calc(100dvh_-_7.5rem)] w-[calc(100%_-_3rem)] max-w-[400px] flex-col bg-card-bg rounded-2xl border border-card-border shadow-2xl shadow-primary/10 overflow-hidden animate-fade-in-up"
        >
          {/* Chat Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-primary-dark to-primary text-white flex shrink-0 items-center gap-3">
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
            <div className="px-4 py-2 bg-primary/5 border-b border-card-border/50 flex shrink-0 items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <span className="text-[10px] text-text-muted truncate">已关联当前翻译结果，可直接追问相关问题</span>
            </div>
          )}

          {/* Chat Body */}
          <div ref={chatBodyRef} role="log" aria-label="助教消息" className="h-[320px] min-h-0 p-4 overflow-y-auto bg-background/50 space-y-3">
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
                  className={`rounded-xl px-3.5 py-2.5 text-sm max-w-[400px] overflow-x-auto [&_.math-display]:overflow-x-auto [&_.math-display]:text-[13px] ${
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
                maxLength={MAX_CHAT_MESSAGE_CHARS}
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
                aria-label="发送助教问题"
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
