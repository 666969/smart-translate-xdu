"use client";

import { useState, useRef, useEffect, useEffectEvent, lazy, Suspense } from "react";
import Link from "next/link";
import type { KeywordItem } from "./components/KeywordGlossary";
import { normalizeTranslationLayout } from "@/lib/translationLayout";
import { useAppSession } from "./components/AppSessionProvider";

const MarkdownRenderer = lazy(() => import("./components/MarkdownRenderer"));
const KeywordGlossary = lazy(() => import("./components/KeywordGlossary"));
const DocumentMindmapPanel = lazy(() => import("./components/DocumentMindmapPanel"));
const DocumentQuizPanel = lazy(() => import("./components/DocumentQuizPanel"));
const ExportButton = lazy(() => import("./components/ExportButton"));
const TextbookTranslationRenderer = lazy(
  () => import("./components/TextbookTranslationRenderer")
);
import Header from "./components/Header";
import { ArrowDown, ArrowRight, BookOpen, FileText, Images, Languages, Loader2, MessageCircle, Mic, NotebookPen, Paperclip, Save, Send, Sparkles, Upload, X } from "lucide-react";
import { useLesson } from "@/hooks/useLesson";
import { saveLessonRecord } from "@/lib/db";
import { studySaveError, usesCloudStudy } from "@/lib/studyStorage";
import { buildLearningNoteMarkdown } from "@/lib/markdownExport";
import { IMAGE_MIME_TYPES, MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_MESSAGES, MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_SNIPPET_CHARS } from "@/lib/studyLimits";

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


const resultTabs = [
  { id: "translation", label: "译文" },
  { id: "analysis", label: "原理讲解" },
  { id: "terms", label: "专业术语" },
] as const;
type ResultView = (typeof resultTabs)[number]["id"];

const studyLinks = [
  { href: "/live", title: "随堂同传", description: "听课时查看双语字幕", Icon: Mic },
  { href: "/pdf", title: "文献精读", description: "读 PDF 并回到原文核对", Icon: FileText },
  { href: "/glossary", title: "专业名词库", description: "按教材查阅中英法术语", Icon: BookOpen },
  { href: "/notebook", title: "笔记本", description: "复习生词、错题和课堂笔记", Icon: NotebookPen },
];

function ResultNotice({ busy = false, title, description }: { busy?: boolean; title: string; description: string }) {
  return (
    <div role={busy ? "status" : undefined} className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-card-border bg-background/55 px-5 py-6 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-study-soft text-primary">
        {busy ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} aria-hidden="true" />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
    </div>
  );
}

export default function Home() {
  const { home } = useAppSession();
  const { ownerId, lesson, loading: authLoading } = useLesson();
  const {
    mode,
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
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("translation");
  const [loadingTask, setLoadingTask] = useState<TranslateTask | null>(null);
  const isLoading = loadingTask !== null;
  const [saveNotice, setSaveNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const translationRequest = useRef<AbortController | null>(null);
  const notes = useRef<Partial<Record<"snippet" | "document", string>>>({});
  useEffect(() => () => translationRequest.current?.abort(), []);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const snippetFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
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

  const handleModeChange = (nextMode: "snippet" | "document") => {
    if (mode === nextMode) return;
    translationRequest.current?.abort();
    setLoadingTask(null);
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

  const openSnippetUpload = () => snippetFileInputRef.current?.click();
  const openDocumentUpload = () => documentFileInputRef.current?.click();
  function changeSnippetText(value: string) {
    invalidateInput("snippet");
    setSnippetText(value);
  }
  const fillDemoSnippetText = () => changeSnippetText(DEMO_SNIPPET_TEXT);

  function acceptImages(files: File[], nextMode: "snippet" | "document") {
    if (!files.length) return;
    if (files.some((file) => !file.size || !IMAGE_MIME_TYPES.includes(file.type))) {
      setErrorMessage("请上传 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    const remaining = nextMode === "snippet" ? 1 : MAX_IMAGE_COUNT - documentFiles.length;
    if (remaining <= 0) {
      setErrorMessage("最多上传 5 张课件截图。");
      return;
    }
    const selected = files.slice(0, remaining);
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

  function handleSnippetFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    acceptImages(Array.from(event.target.files ?? []), "snippet");
    event.target.value = "";
  }

  function handleDocumentFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    acceptImages(Array.from(event.target.files ?? []), "document");
    event.target.value = "";
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
      const response = await fetch("/api/translate", {
        method: "POST", body: form,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]),
      });
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
      if (!request.signal.aborted) setLoadingTask(null);
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
        title: mode === "snippet" ? snippetFile?.name || "片段速译" : "课件截图精读",
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


  const hasResult = mode === "snippet"
    ? Boolean(translationResult || analysisResult || keywordsResult || keywordItemsResult.length)
    : Boolean(mermaidData || quizData?.length);

  function runTask(task: TranslateTask) {
    if (task === "quick") setResultView("translation");
    if (task === "study") setResultView("analysis");
    void handleTranslate(task);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="study-shell pb-24 pt-5 sm:pt-7">
        <section className="study-hero grid items-center gap-6 px-5 py-5 sm:px-8 sm:py-7 lg:grid-cols-[minmax(0,1fr)_23rem] lg:px-9">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-blue-100">
              <span className="size-1.5 rounded-full bg-amber-300" aria-hidden="true" />智译西电学习工作台
            </p>
            <h1 className="mt-3 text-[clamp(1.9rem,4.2vw,3rem)] font-semibold leading-[1.16] tracking-tight">外语课件学习台</h1>
            <p className="mt-3 max-w-lg text-sm leading-7 text-blue-50/90 sm:text-base">
              输入法语或英语课件，查看中文译文、公式讲解和专业术语。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <a href="#translation-workspace" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-primary-dark hover:bg-blue-50">
                <ArrowDown size={14} aria-hidden="true" />开始翻译
              </a>
              <span className="rounded-lg border border-white/25 px-3 py-2 text-xs font-medium text-blue-50">法语 · 英语 · 中文</span>
            </div>
          </div>

          <div aria-label="双语对照示例" className="hidden rounded-xl border border-white/25 bg-white/10 p-4 lg:block">
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-blue-50">
              <span className="flex items-center gap-1.5"><Languages size={15} aria-hidden="true" />双语对照示例</span>
              <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-950">基础电子</span>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-white/15 bg-slate-950/20 px-3 py-2.5">
                <p className="font-mono text-[10px] font-semibold tracking-widest text-blue-100">FR · 原文</p>
                <p lang="fr" className="mt-1 text-sm leading-5 text-white">Le condensateur stocke de l’énergie électrique.</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold tracking-wide text-primary">中文 · 译文</p>
                <p className="mt-1 text-sm font-medium leading-5 text-foreground">电容器储存电能。</p>
              </div>
            </div>
          </div>
        </section>

        <section id="translation-workspace" className="mt-7 scroll-mt-20">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">教材翻译</h2>
              <p className="mt-1 text-sm text-text-muted">支持文本、课件截图和多页截图精读。</p>
            </div>
            <div className="study-segment" role="group" aria-label="翻译模式">
              <button type="button" aria-pressed={mode === "snippet"} onClick={() => handleModeChange("snippet")}>
                <Languages size={15} aria-hidden="true" />片段速译
              </button>
              <button type="button" aria-pressed={mode === "document"} onClick={() => handleModeChange("document")}>
                <Images size={15} aria-hidden="true" />课件精读
              </button>
            </div>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
            <section className="study-card flex min-w-0 flex-col" aria-labelledby="input-heading">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-study-soft text-primary"><Paperclip size={16} aria-hidden="true" /></span>
                  <div>
                    <h3 id="input-heading" className="text-sm font-semibold">{mode === "snippet" ? "原文输入" : "课件截图"}</h3>
                    <p className="mt-0.5 text-xs text-text-muted">{mode === "snippet" ? "输入文本或上传一张图" : "最多 5 张，总计 4 MB"}</p>
                  </div>
                </div>
                {inputSummary && <span className="rounded-md bg-background px-2 py-1 text-xs text-text-muted">{inputSummary}</span>}
              </header>

              <div className="flex-1 space-y-3 p-4 sm:p-5">
                <input ref={snippetFileInputRef} type="file" accept={IMAGE_MIME_TYPES.join(",")} className="hidden" onChange={handleSnippetFileChange} />
                <input ref={documentFileInputRef} type="file" accept={IMAGE_MIME_TYPES.join(",")} multiple className="hidden" onChange={handleDocumentFileChange} />

                {mode === "snippet" && (
                  <>
                    <label htmlFor="input-textarea" className="sr-only">外文原文</label>
                    <textarea id="input-textarea" rows={4} value={snippetText}
                      onChange={(event) => changeSnippetText(event.target.value)} maxLength={MAX_SNIPPET_CHARS}
                      placeholder="粘贴法语或英语课件内容，也可以上传截图。"
                      className="w-full resize-y rounded-xl border border-card-border bg-background/60 px-3.5 py-3 text-sm leading-6 text-foreground placeholder:text-text-light sm:min-h-36" />
                    {snippetPreviewUrl && (
                      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-card-border p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={snippetPreviewUrl} alt="片段截图预览" className="h-14 w-20 rounded-md object-contain" />
                        <p className="min-w-0 flex-1 truncate text-xs font-medium text-text-muted">{snippetFile?.name || "课件截图"}</p>
                        <button type="button" className="study-icon-button" onClick={handleRemoveSnippetImage} aria-label="移除截图"><X size={16} /></button>
                      </div>
                    )}
                  </>
                )}

                {mode === "document" && documentPreviewUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {documentPreviewUrls.map((url, index) => (
                      <div key={url} id={"document-image-" + (index + 1)} className="relative min-w-0 scroll-mt-24 overflow-hidden rounded-xl border border-card-border bg-background">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={"课件预览 " + (index + 1)} className="h-24 w-full object-contain" />
                        <div className="truncate border-t border-card-border bg-white px-2 py-1.5 text-[11px] text-text-muted">
                          {documentFiles[index]?.name || "图 " + (index + 1)}
                        </div>
                        <button type="button" onClick={() => handleRemoveDocumentImage(index)} aria-label={"移除截图 " + (index + 1)}
                          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg border border-card-border bg-white text-text-muted hover:text-rose-700"><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {mode === "document" && !hasDocumentInput && (
                  <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-card-border bg-background px-3 py-4 text-center">
                    <Images size={23} className="text-primary-light" aria-hidden="true" />
                    <p className="text-sm font-medium">上传或粘贴课件截图</p>
                    <p className="text-xs text-text-muted">可以按页上传，再生成导图或小测。</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  {!(mode === "document" && documentFiles.length >= MAX_IMAGE_COUNT) && (
                    <button type="button" id="upload-button" className="study-button" onClick={mode === "snippet" ? openSnippetUpload : openDocumentUpload}>
                      <Upload size={15} aria-hidden="true" />{mode === "snippet" ? "上传课件截图" : "上传多张截图"}
                    </button>
                  )}
                  <span className="text-xs text-text-muted">支持 Ctrl+V 粘贴</span>
                  {mode === "snippet" && (
                    <button type="button" className="ml-auto text-xs font-semibold text-primary underline-offset-2 hover:underline" onClick={fillDemoSnippetText}>
                      填入演示文本
                    </button>
                  )}
                </div>
                {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{errorMessage}</p>}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border bg-background/45 px-4 py-3 sm:px-5">
                <div className="study-segment order-2 sm:order-1" role="group" aria-label="讲解方式">
                  <button type="button" aria-pressed={!deepMode} onClick={() => setDeepMode(false)}>简明讲解</button>
                  <button type="button" aria-pressed={deepMode} onClick={() => setDeepMode(true)}>深入讲解</button>
                </div>
                <div className="order-1 flex flex-wrap items-center gap-2 sm:order-2">
                  <button type="button" className="study-button order-2 sm:order-1" disabled={isLoading || (mode === "snippet" && !translationResult)}
                    onClick={() => runTask(mode === "snippet" ? "study" : "quiz")}>
                    {loadingTask === "study" || loadingTask === "quiz" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} aria-hidden="true" />}
                    {mode === "snippet" ? "讲原理和术语" : "生成三语小测"}
                  </button>
                  <button type="button" id="translate-button" className="study-button study-button-primary order-1 sm:order-2" disabled={isLoading}
                    onClick={() => runTask(mode === "snippet" ? "quick" : "mindmap")}>
                    {loadingTask === "quick" || loadingTask === "mindmap" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} aria-hidden="true" />}
                    {mode === "snippet" ? "开始速译" : "生成知识导图"}
                  </button>
                </div>
              </footer>
            </section>

            <section className="study-card flex min-w-0 flex-col overflow-hidden" aria-labelledby="result-heading">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-study-warm text-amber-800"><BookOpen size={16} aria-hidden="true" /></span>
                  <div>
                    <h3 id="result-heading" className="text-sm font-semibold">学习结果</h3>
                    <p className="mt-0.5 text-xs text-text-muted">{mode === "snippet" ? "在这里查看译文、讲解和术语" : "课件知识导图与三语小测"}</p>
                  </div>
                </div>
                {hasResult && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Suspense fallback={null}>
                      {mode === "snippet"
                        ? <ExportButton mode="snippet" originalText={originalTextResult} translation={translationResult} analysis={analysisResult} keywords={keywordsResult} />
                        : <ExportButton mode="document" mermaid={mermaidData} quiz={quizData} />}
                    </Suspense>
                    <button type="button" className="study-button" onClick={() => void saveStudyNote()} disabled={isSaving || authLoading}>
                      <Save size={15} aria-hidden="true" />{isSaving ? "保存中" : "保存到本节课"}
                    </button>
                  </div>
                )}
              </header>

              <div className="min-w-0 flex-1 space-y-3 p-4 sm:p-5">
                {saveNotice && <p role="status" className="rounded-lg bg-study-soft px-3 py-2 text-xs leading-5 text-primary">{saveNotice}</p>}
                {mode === "snippet" ? (
                  <>
                    <div className="study-segment" role="group" aria-label="结果类型">
                      {resultTabs.map((tab) => <button key={tab.id} type="button"
                        aria-pressed={resultView === tab.id} onClick={() => setResultView(tab.id)}>{tab.label}</button>)}
                    </div>
                    {resultView === "translation" && (
                      translationResult ? (
                        <div className="min-w-0 space-y-4">
                          <div className="rounded-xl border border-card-border bg-white p-4">
                            <p className="mb-2 text-xs font-semibold text-primary">中文译文</p>
                            <Suspense fallback={<p className="text-sm text-text-muted">正在加载译文…</p>}>
                              <TextbookTranslationRenderer layout={translationLayoutResult} fallbackContent={translationResult} />
                            </Suspense>
                          </div>
                          {originalTextResult && <details open className="rounded-xl border border-card-border bg-background/50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-primary">
                              {sourceLanguage === "en" ? "英语原文" : sourceLanguage === "fr" ? "法语原文" : "课件原文"}
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">{originalTextResult}</p>
                          </details>}
                        </div>
                      ) : <ResultNotice busy={loadingTask === "quick"} title={loadingTask === "quick" ? "正在生成译文" : "等待外文内容"}
                        description={loadingTask === "quick" ? "已用时 " + loadingElapsed + " 秒" : "输入原文或截图后，点击「开始速译」。"} />
                    )}
                    {resultView === "analysis" && (
                      analysisResult ? (
                        <Suspense fallback={<p className="text-sm text-text-muted">正在加载讲解…</p>}>
                          <MarkdownRenderer content={analysisResult} compact />
                        </Suspense>
                      ) : <ResultNotice busy={loadingTask === "study"} title={loadingTask === "study" ? "正在整理讲解" : "查看原理与公式"}
                        description={loadingTask === "study" ? "已用时 " + loadingElapsed + " 秒" : "速译后点击「讲原理和术语」。"} />
                    )}
                    {resultView === "terms" && (
                      keywordItemsResult.length || keywordsResult ? (
                        <Suspense fallback={<p className="text-sm text-text-muted">正在加载术语…</p>}>
                          <KeywordGlossary content={keywordsResult ?? undefined} items={keywordItemsResult} />
                        </Suspense>
                      ) : <ResultNotice busy={loadingTask === "study"} title={loadingTask === "study" ? "正在提取专业术语" : "查看本段的专业术语"}
                        description={loadingTask === "study" ? "已用时 " + loadingElapsed + " 秒" : "生成讲解后，这里会显示术语卡片。"} />
                    )}
                  </>
                ) : (
                  <>
                    {isLoading && <ResultNotice busy title={loadingTask === "quiz" ? "正在生成小测" : "正在生成导图"} description={"已用时 " + loadingElapsed + " 秒"} />}
                    {!isLoading && !hasResult && <ResultNotice title="等待课件截图" description="上传截图后，可以分别生成知识导图和三语小测。" />}
                    {mermaidData && <Suspense fallback={<p className="text-sm text-text-muted">正在加载导图…</p>}>
                      <DocumentMindmapPanel mermaidData={mermaidData} />
                    </Suspense>}
                    {!!quizData?.length && <Suspense fallback={<p className="text-sm text-text-muted">正在加载小测…</p>}>
                      <DocumentQuizPanel sourceImages={documentFiles.map((file) => file.name)} quizData={quizData} quizLang={quizLang} onQuizLangChange={setQuizLang} />
                    </Suspense>}
                  </>
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="other-tools-heading">
          <h2 id="other-tools-heading" className="mb-3 text-lg font-semibold tracking-tight">其他学习工具</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {studyLinks.map(({ href, title, description, Icon }) => (
              <Link key={href} href={href} className="study-card group flex min-w-0 items-start gap-3 p-4 hover:border-primary-lighter">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-study-soft text-primary"><Icon size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground group-hover:text-primary">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-text-muted">{description}</span>
                </span>
                <ArrowRight size={15} className="mt-0.5 shrink-0 text-text-light group-hover:text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </main>

      {!chatOpen && (
        <button type="button" id="ai-chat-button" className="study-button study-button-primary study-pill fixed bottom-5 right-4 z-50 shadow-lg sm:right-6"
          onClick={() => setChatOpen(true)}>
          <MessageCircle size={17} aria-hidden="true" />AI 助教
        </button>
      )}

      {chatOpen && (
        <section aria-label="AI 助教" className="study-card fixed inset-x-3 bottom-4 z-50 overflow-hidden shadow-2xl sm:left-auto sm:right-6 sm:bottom-6 sm:w-[26rem]">
          <header className="flex items-center gap-2.5 bg-primary-dark px-4 py-3 text-white">
            <MessageCircle size={17} className="shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">AI 助教</h2>
              <p className="text-xs text-white/75">{translationResult ? "可追问当前课件" : "解答术语和公式问题"}</p>
            </div>
            {chatMessages.length > 0 && <button type="button" className="px-2 text-xs text-white/80 hover:text-white" onClick={() => setChatMessages([])}>清空</button>}
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/15" aria-label="关闭助教" onClick={() => setChatOpen(false)}>
              <X size={17} />
            </button>
          </header>
          <div ref={chatBodyRef} className="max-h-[min(48dvh,22rem)] min-h-32 space-y-3 overflow-y-auto bg-background/70 p-4">
            <p className="rounded-xl border border-card-border bg-white p-3 text-sm leading-6 text-text-muted">
              {translationResult ? "我可以根据这次译文继续讲解。你想先了解哪个知识点？" : "你可以提问法语或英语术语，也可以让我解释课件里的公式。"}
            </p>
            {chatMessages.map((message, index) => (
              <div key={index} className={message.role === "user"
                ? "ml-auto w-fit max-w-full whitespace-pre-wrap break-words rounded-xl bg-study-soft px-3 py-2 text-sm leading-6 text-primary-dark"
                : "max-w-full overflow-x-auto rounded-xl border border-card-border bg-white px-3 py-2 text-sm text-foreground"}>
                {message.role === "assistant"
                  ? <Suspense fallback={<span>正在加载…</span>}><MarkdownRenderer content={message.content} /></Suspense>
                  : message.content}
              </div>
            ))}
            {isChatLoading && <p role="status" className="flex items-center gap-2 text-xs text-text-muted"><Loader2 size={14} className="animate-spin" />正在回答…</p>}
          </div>
          <div className="flex items-center gap-2 border-t border-card-border p-3">
            <input id="chat-input" aria-label="向助教提问" maxLength={MAX_CHAT_MESSAGE_CHARS} type="text" value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)} onKeyDown={handleChatKeyDown} placeholder="输入你的问题"
              disabled={isChatLoading} className="min-w-0 flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-sm" />
            <button type="button" className="study-button study-button-primary" aria-label="发送问题" onClick={() => void handleChatSend()}
              disabled={isChatLoading || !chatMessage.trim()}><Send size={15} /></button>
          </div>
        </section>
      )}
    </div>
  );
}
