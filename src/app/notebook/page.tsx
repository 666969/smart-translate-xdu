"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  BookOpen,
  Star,
  RotateCcw,
  Check,
  X,
  Trash2,
  AlertCircle,
  BarChart3,
  Clock3,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Download,
  FileText,
} from "lucide-react";
import Header from "../components/Header";
import WorkspaceHeading from "../components/WorkspaceHeading";
import LessonArchive from "../components/LessonArchive";
import CloudStudyImport from "../components/CloudStudyImport";
import SpeakButton from "../components/SpeakButton";
import MarkdownRenderer from "../components/MarkdownRenderer";
import {
  getAllVocabs,
  getVocabsDueForReview,
  markVocabReviewed,
  removeVocab,
  getAllWrongAnswers,
  resolveWrongAnswer,
  removeWrongAnswer,
  resolveOwnerId,
  getLessonRecords,
  removeLessonRecord,
} from "@/lib/db";
import type { VocabItem, WrongAnswerItem, LessonRecord, StudyItemId } from "@/lib/db";
import { cloudStudyEnabled, usesCloudStudy } from "@/lib/studyStorage";
import {
  buildNotebookDashboardStats,
  buildSprintPack,
  buildSprintPackMarkdown,
} from "@/lib/notebookInsights";
import type { NotebookDashboardStats, SprintPackData } from "@/lib/notebookInsights";
import { useAppSession } from "../components/AppSessionProvider";
import { useAuth } from "@/hooks/useAuth";

/* ========== Flashcard Review Modal ========== */

function FlashcardReview({
  cards,
  ownerId,
  onClose,
  onReviewed,
}: {
  cards: VocabItem[];
  ownerId: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const current = cards[currentIndex];
  const isLast = currentIndex >= cards.length - 1;

  const handleResponse = async (remembered: boolean) => {
    if (!current?.id || reviewSaving) return;
    setReviewSaving(true);
    setReviewError("");
    try {
      await markVocabReviewed(ownerId, current.id, remembered);
    } catch {
      setReviewError("暂时无法保存复习进度，请重试。");
      return;
    } finally {
      setReviewSaving(false);
    }
    setReviewedCount((c) => c + 1);

    if (isLast) {
      onReviewed();
      onClose();
    } else {
      setFlipped(false);
      setCurrentIndex((i) => i + 1);
    }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 rounded-full"
            style={{
              width: `${((currentIndex + 1) / cards.length) * 100}%`,
            }}
          />
        </div>

        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <span className="text-sm font-medium text-text-muted">
            {currentIndex + 1} / {cards.length}
          </span>
          <span className="text-xs text-text-light">
            已复习 {reviewedCount} 个
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Card */}
        <div
          className="px-8 py-12 min-h-[280px] flex flex-col items-center justify-center cursor-pointer select-none"
          onClick={() => setFlipped(!flipped)}
        >
          {!flipped ? (
            <div className="text-center animate-fade-in">
              <p className="text-3xl font-bold text-blue-900 mb-4">
                {current.term_fr}
              </p>
              <SpeakButton
                text={current.term_fr}
                lang={current.language === "en" ? "en-US" : "fr-FR"}
                size={20}
                className="mx-auto"
              />
              <p className="text-sm text-text-light mt-6">点击卡片翻转查看释义 →</p>
            </div>
          ) : (
            <div className="text-center animate-fade-in">
              <p className="text-lg font-semibold text-amber-700 mb-2">
                {current.term_zh}
              </p>
              <div className="h-px w-20 bg-amber-200 mx-auto my-3" />
              <div className="text-base text-gray-700 leading-relaxed text-left inline-block">
                <MarkdownRenderer content={current.definition_zh} compact className="[&_p]:m-0" />
              </div>
            </div>
          )}
        </div>

        {reviewError && <p role="alert" className="px-6 pb-2 text-sm text-rose-700">{reviewError}</p>}
        {/* Action buttons */}
        {flipped && (
          <div className="px-6 pb-6 flex gap-3 animate-fade-in">
            <button
              onClick={() => handleResponse(false)}
              disabled={reviewSaving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors"
            >
              <RotateCcw size={18} />
              再看一次
            </button>
            <button
              onClick={() => handleResponse(true)}
              disabled={reviewSaving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-medium hover:shadow-lg transition-all"
            >
              <Check size={18} />
              记住了
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== Wrong Answer Re-quiz Modal ========== */

function ReQuizModal({ item, ownerId, onClose, onResolved }: {
  item: WrongAnswerItem;
  ownerId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const language = item.language ?? "zh";
  const question = item["question_" + language as "question_zh" | "question_fr" | "question_en"];
  const options = item["options_" + language as "options_zh" | "options_fr" | "options_en"];
  const answer = item["answer_" + language as "answer_zh" | "answer_fr" | "answer_en"];
  const correct = item.answerIndex ?? options.indexOf(answer);
  const isCorrect = selected === correct;

  const submit = async () => {
    setShowResult(true);
    if (isCorrect && item.id) {
      try {
        await resolveWrongAnswer(ownerId, item.id);
        onResolved();
      } catch {
        setSaveError(true);
      }
    }
  };

  return (
    <div role="dialog" aria-label="重新做题" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">重新做题</h3>
          <button aria-label="关闭" onClick={onClose}><X size={19} /></button>
        </div>
        {item.source && <p className="mb-2 text-xs text-text-muted">{item.source}</p>}
        <MarkdownRenderer content={question} />
        <div className="my-3 space-y-2">
          {options.map((option, index) => <button key={index} disabled={showResult}
            className={"flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-sm " +
              (showResult && index === correct ? "border-green-400 bg-green-50" :
                selected === index ? "border-primary bg-sky-50" : "border-card-border")}
            onClick={() => setSelected(index)}>
            <span>{String.fromCharCode(65 + index)}.</span>
            <MarkdownRenderer content={option} compact />
          </button>)}
        </div>
        {showResult ? (
          <div className="space-y-2">
            <p className={"text-sm font-medium " + (isCorrect ? "text-green-700" : "text-rose-700")}>
              {isCorrect ? "答对了" : correct >= 0 ? "正确选项 " + String.fromCharCode(65 + correct) : "正确答案 " + answer}
            </p>
            {item.explanation && <MarkdownRenderer content={item.explanation} compact />}
            {saveError && <p role="alert" className="text-sm text-rose-700">进度保存失败，请稍后重试。</p>}
          </div>
        ) : (
          <button className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={selected === null} onClick={() => void submit()}>提交答案</button>
        )}
      </div>
    </div>
  );
}

function formatSprintPackFilename(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `智译西电_考前冲刺包_${year}${month}${day}${hours}${minutes}.md`;
}

function getStatusSummaryClasses(tone: NotebookDashboardStats["statusSummary"]["tone"]) {
  if (tone === "amber") {
    return {
      wrapper: "border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,237,213,0.92))]",
      icon: "bg-amber-500 text-white shadow-lg shadow-amber-500/20",
      badge: "bg-amber-500/10 text-amber-700 border border-amber-200/80",
    };
  }

  if (tone === "rose") {
    return {
      wrapper: "border-rose-200/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,228,230,0.92))]",
      icon: "bg-rose-500 text-white shadow-lg shadow-rose-500/20",
      badge: "bg-rose-500/10 text-rose-700 border border-rose-200/80",
    };
  }

  return {
    wrapper: "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))]",
    icon: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-700 border border-emerald-200/80",
  };
}

function DashboardMetricCard({
  icon,
  label,
  value,
  accentClass,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accentClass: string;
}) {
  return (
    <div className="rounded-2xl border border-card-border bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-text-muted uppercase">
            {label}
          </p>
          <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accentClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ========== Main Page ========== */

export default function NotebookPage() {
  const { notebook } = useAppSession();
  const { uid } = useAuth();
  const {
    tab,
    setTab,
    isReviewing,
    setIsReviewing,
    requizItemId,
    setRequizItemId,
    flippedCardIds,
    setFlippedCardIds,
  } = notebook;
  const ownerId = resolveOwnerId(uid);
  const [allVocabs, setVocabs] = useState<VocabItem[]>([]);
  const [allDueVocabs, setDueVocabs] = useState<VocabItem[]>([]);
  const [allWrongAnswers, setWrongAnswers] = useState<WrongAnswerItem[]>([]);
  const [allRecords, setRecords] = useState<LessonRecord[]>([]);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [lessonFilter, setLessonFilter] = useState("all");
  const [loadError, setLoadError] = useState("");
  const loadId = useRef(0);
  const lessons = useMemo(() => loadedOwner === ownerId ? [...new Set(
    [...allVocabs, ...allWrongAnswers, ...allRecords].map((item) => item.lesson ?? ""),
  )].sort((a, b) => a.localeCompare(b, "zh")) : [], [loadedOwner, ownerId, allVocabs, allWrongAnswers, allRecords]);
  const matchesLesson = useCallback((item: { lesson?: string }) =>
    lessonFilter === "all" || "lesson:" + (item.lesson ?? "") === lessonFilter, [lessonFilter]);
  const vocabs = useMemo(() => loadedOwner === ownerId ? allVocabs.filter(matchesLesson) : [], [allVocabs, loadedOwner, matchesLesson, ownerId]);
  const dueVocabs = useMemo(() => loadedOwner === ownerId ? allDueVocabs.filter(matchesLesson) : [], [allDueVocabs, loadedOwner, matchesLesson, ownerId]);
  const wrongAnswers = useMemo(() => loadedOwner === ownerId ? allWrongAnswers.filter(matchesLesson) : [], [allWrongAnswers, loadedOwner, matchesLesson, ownerId]);
  const lessonRecords = useMemo(() => loadedOwner === ownerId ? allRecords.filter(matchesLesson) : [], [allRecords, loadedOwner, matchesLesson, ownerId]);
  const [isSprintPackOpen, setIsSprintPackOpen] = useState(false);
  const [sprintPackData, setSprintPackData] = useState<SprintPackData | null>(null);
  const [sprintPackOwnerId, setSprintPackOwnerId] = useState(ownerId);
  const [dashboardTimestamp, setDashboardTimestamp] = useState<number>(() => Date.now());

  const loadData = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const [vocabulary, due, wrong, records] = await Promise.all([
        getAllVocabs(ownerId), getVocabsDueForReview(ownerId),
        getAllWrongAnswers(ownerId), getLessonRecords(ownerId),
      ]);
      if (id !== loadId.current) return;
      setVocabs(vocabulary);
      setDueVocabs(due);
      setWrongAnswers(wrong);
      setRecords(records);
      setLoadedOwner(ownerId);
      setLoadError("");
      setDashboardTimestamp(Date.now());
    } catch {
      if (id === loadId.current) {
        setLoadError(usesCloudStudy(ownerId) ? "暂时无法读取云端笔记，请检查网络后刷新。" : "暂时无法读取本地笔记，请刷新后重试。");
      }
    }
  }, [ownerId]);

  useEffect(() => {
    queueMicrotask(() => {
      setLessonFilter("all");
      void loadData();
    });
  }, [loadData]);

  useEffect(() => {
    setFlippedCardIds([]);
    setRequizItemId(null);
    setIsReviewing(false);
  }, [ownerId, setFlippedCardIds, setIsReviewing, setRequizItemId]);

  const handleDeleteVocab = async (id: StudyItemId) => {
    try {
      await removeVocab(ownerId, id);
      await loadData();
    } catch {
      setLoadError("暂时无法移除生词，请重试。");
    }
  };

  const handleDeleteWrong = async (id: StudyItemId) => {
    try {
      await removeWrongAnswer(ownerId, id);
      await loadData();
    } catch {
      setLoadError("暂时无法移除错题，请重试。");
    }
  };

  const toggleFlip = (id: StudyItemId) => {
    setFlippedCardIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((itemId) => itemId !== id);
      }

      return [...prev, id];
    });
  };

  const unresolvedWrong = wrongAnswers.filter((w) => !w.resolved);
  const resolvedWrong = wrongAnswers.filter((w) => w.resolved);
  const flippedCards = useMemo(() => new Set(flippedCardIds), [flippedCardIds]);
  const dashboardStats = useMemo(
    () => buildNotebookDashboardStats(vocabs, wrongAnswers, dashboardTimestamp),
    [dashboardTimestamp, vocabs, wrongAnswers]
  );
  const maxActivityCount = useMemo(
    () => Math.max(...dashboardStats.activity7d.map((item) => item.totalCount), 0),
    [dashboardStats]
  );
  const requizItem = useMemo(
    () => loadedOwner === ownerId ? allWrongAnswers.find((item) => item.id === requizItemId) ?? null : null,
    [allWrongAnswers, loadedOwner, ownerId, requizItemId]
  );
  const activeSprintPackData =
    sprintPackOwnerId === ownerId ? sprintPackData : null;
  const isActiveSprintPackOpen = isSprintPackOpen && activeSprintPackData !== null;
  const isSprintPackTotallyEmpty = Boolean(
    activeSprintPackData &&
      activeSprintPackData.overview.totalVocabs === 0 &&
      activeSprintPackData.overview.unresolvedWrongAnswers === 0 &&
      activeSprintPackData.overview.resolvedWrongAnswers === 0
  );
  const sprintSummaryStyles = getStatusSummaryClasses(
    dashboardStats.statusSummary.tone
  );

  const handleGenerateSprintPack = useCallback(() => {
    const nextPack = buildSprintPack(vocabs, wrongAnswers);
    setSprintPackData(nextPack);
    setSprintPackOwnerId(ownerId);
    setIsSprintPackOpen(true);
  }, [ownerId, vocabs, wrongAnswers]);

  const handleExportSprintPack = useCallback(() => {
    if (!activeSprintPackData) {
      return;
    }

    const content = buildSprintPackMarkdown(activeSprintPackData);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = formatSprintPackFilename(activeSprintPackData.generatedAt);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [activeSprintPackData]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="study-shell flex-1 pb-12 pt-6 sm:pt-8">
        <WorkspaceHeading label="复习与归档" title="我的笔记本" icon={<Star size={23} />}
          description="在同一处查看生词、错题、课件笔记和课堂字幕。可以按课节筛选。">
          <span className="rounded-lg bg-study-warm px-3 py-2 text-xs font-semibold text-amber-900">{dueVocabs.length} 条待复习</span>
        </WorkspaceHeading>

        {usesCloudStudy(ownerId) && <CloudStudyImport key={ownerId} ownerId={ownerId} onImported={loadData} />}
        {cloudStudyEnabled && !usesCloudStudy(ownerId) && (
          <p className="mb-4 rounded-2xl border border-card-border bg-white p-4 text-sm text-text-muted">登录后可保存云端记录，并导入此浏览器的旧记录。</p>
        )}
        {loadError && <p role="alert" className="mb-3 text-sm text-rose-700">{loadError}</p>}
        <div className="study-card mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">学习记录</p>
          <label className="flex flex-wrap items-center gap-2 text-text-muted">
            按课节查看
            <select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}
              className="max-w-56 rounded-lg border border-card-border bg-white px-2 py-1.5 text-foreground">
              <option value="all">全部课节</option>
              {lessons.map((title) => <option key={title} value={"lesson:" + title}>{title || "未分类"}</option>)}
            </select>
          </label>
        </div>
<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="study-segment" role="group" aria-label="笔记本分类">
            <button type="button" aria-pressed={tab === "vocab"} onClick={() => setTab("vocab")}>
              生词本 <span className="text-[11px] opacity-70">{vocabs.length}</span>
            </button>
            <button type="button" aria-pressed={tab === "wrong"} onClick={() => setTab("wrong")}>
              错题本 <span className="text-[11px] opacity-70">{unresolvedWrong.length}</span>
            </button>
            <button type="button" aria-pressed={tab === "lessons"} onClick={() => setTab("lessons")}>
              课程档案 <span className="text-[11px] opacity-70">{lessonRecords.length}</span>
            </button>
          </div>
          {tab === "vocab" && dueVocabs.length > 0 && (
            <button type="button" className="study-button study-button-primary" onClick={() => setIsReviewing(true)}>
              <RotateCcw size={15} />开始复习
            </button>
          )}
        </div>

<details className="study-card mb-4">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-primary">学习统计与考前冲刺包</summary>
          <div className="px-3 pt-2 sm:px-5">

        <section className="mb-6 space-y-4 animate-fade-in-up-delay-1">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <DashboardMetricCard
              icon={<BookOpen size={18} />}
              label="生词总数"
              value={dashboardStats.totalVocabs}
              accentClass="bg-amber-500/10 text-amber-600"
            />
            <DashboardMetricCard
              icon={<Clock3 size={18} />}
              label="待复习数"
              value={dashboardStats.dueVocabs}
              accentClass="bg-sky-500/10 text-sky-600"
            />
            <DashboardMetricCard
              icon={<ShieldAlert size={18} />}
              label="待巩固错题"
              value={dashboardStats.unresolvedWrongAnswers}
              accentClass="bg-rose-500/10 text-rose-600"
            />
            <DashboardMetricCard
              icon={<ShieldCheck size={18} />}
              label="已掌握错题"
              value={dashboardStats.resolvedWrongAnswers}
              accentClass="bg-emerald-500/10 text-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-4">
            <div className="rounded-3xl border border-card-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] uppercase text-text-muted">
                    近 7 日学习活跃度
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    最近一周的新增学习节奏
                  </h2>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600">
                  <BarChart3 size={18} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-3">
                {dashboardStats.activity7d.map((item) => {
                  const rawHeight =
                    maxActivityCount > 0
                      ? Math.round((item.totalCount / maxActivityCount) * 100)
                      : 0;
                  const height =
                    item.totalCount > 0 ? Math.max(rawHeight, 18) : 10;

                  return (
                    <div key={item.dateKey} className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-medium text-text-muted">
                        {item.totalCount}
                      </span>
                      <div className="flex h-36 w-full items-end justify-center rounded-2xl bg-slate-50 px-2 py-2">
                        <div
                          className={`w-full rounded-xl transition-all duration-300 ${
                            item.totalCount > 0
                              ? "bg-gradient-to-t from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_12px_24px_-16px_rgba(99,102,241,0.6)]"
                              : "bg-slate-200"
                          }`}
                          style={{ height: `${height}%` }}
                          title={`新增生词 ${item.vocabCount}，新增错题 ${item.wrongCount}`}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-medium text-foreground">{item.label}</p>
                        <p className="text-[10px] text-text-light">
                          +{item.vocabCount}/{item.wrongCount}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className={`rounded-3xl border p-5 shadow-sm ${sprintSummaryStyles.wrapper}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] uppercase text-text-muted">
                    当前学习状态
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    {dashboardStats.statusSummary.title}
                  </h2>
                </div>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${sprintSummaryStyles.icon}`}
                >
                  <Sparkles size={18} />
                </div>
              </div>

              <div className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${sprintSummaryStyles.badge}`}>
                比赛展示模式
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-700">
                {dashboardStats.statusSummary.description}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-text-muted">待复习生词</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {dashboardStats.dueVocabs}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-text-muted">待巩固错题</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {dashboardStats.unresolvedWrongAnswers}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleGenerateSprintPack}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-dark to-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/30"
                >
                  <FileText size={16} />
                  {isActiveSprintPackOpen ? "重新生成考前冲刺包" : "生成考前冲刺包"}
                </button>
                <button
                  onClick={handleExportSprintPack}
                  disabled={!activeSprintPackData}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-5 py-3 text-sm font-medium text-foreground transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={16} />
                  导出 Markdown
                </button>
              </div>
            </div>
          </div>
        </section>

        {isActiveSprintPackOpen && activeSprintPackData && (
          <section className="mb-6 rounded-3xl border border-card-border bg-white shadow-sm animate-fade-in-up-delay-2 overflow-hidden">
            <div className="border-b border-card-border bg-[linear-gradient(135deg,rgba(30,58,95,0.98),rgba(37,99,235,0.94))] px-6 py-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.1em] uppercase text-white/70">
                    考前冲刺包
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    当前账号的考前快速总览
                  </h2>
                  <p className="mt-2 text-sm text-white/80">
                    生成时间：
                    {new Date(activeSprintPackData.generatedAt).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleGenerateSprintPack}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                  >
                    <RotateCcw size={15} />
                    重新生成
                  </button>
                  <button
                    onClick={handleExportSprintPack}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium text-primary-dark transition-colors hover:bg-slate-100"
                  >
                    <Download size={15} />
                    导出 Markdown
                  </button>
                  <button
                    onClick={() => setIsSprintPackOpen(false)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
                  >
                    <X size={15} />
                    收起
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {isSprintPackTotallyEmpty && activeSprintPackData && (
                <div className="rounded-3xl border border-dashed border-primary/20 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(240,253,250,0.94))] px-5 py-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/20">
                      <Sparkles size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-foreground">
                        当前还是零数据冲刺包
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        这说明你已经打开了冲刺包能力，但还没有积累可整理的术语或错题。先做一轮输入，下一次生成时这里就会变成真正可导出的考前资料。
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                          <p className="text-xs font-semibold tracking-[0.08em] uppercase text-primary">
                            1
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            在翻译结果里先收藏 5-10 个高频术语。
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                          <p className="text-xs font-semibold tracking-[0.08em] uppercase text-primary">
                            2
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            去课件精读做一轮随堂小测，沉淀第一批错题。
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                          <p className="text-xs font-semibold tracking-[0.08em] uppercase text-primary">
                            3
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            重新生成冲刺包，再导出成 Markdown 备考。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <DashboardMetricCard
                  icon={<BookOpen size={18} />}
                  label="总生词"
                  value={activeSprintPackData.overview.totalVocabs}
                  accentClass="bg-amber-500/10 text-amber-600"
                />
                <DashboardMetricCard
                  icon={<Clock3 size={18} />}
                  label="待复习"
                  value={activeSprintPackData.overview.dueVocabs}
                  accentClass="bg-sky-500/10 text-sky-600"
                />
                <DashboardMetricCard
                  icon={<ShieldAlert size={18} />}
                  label="待巩固错题"
                  value={activeSprintPackData.overview.unresolvedWrongAnswers}
                  accentClass="bg-rose-500/10 text-rose-600"
                />
                <DashboardMetricCard
                  icon={<ShieldCheck size={18} />}
                  label="已掌握错题"
                  value={activeSprintPackData.overview.resolvedWrongAnswers}
                  accentClass="bg-emerald-500/10 text-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
                <div className="rounded-3xl border border-card-border bg-slate-50/70 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                      <Star size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        高频术语清单
                      </h3>
                      <p className="text-sm text-text-muted">
                        待复习优先，其次按创建时间倒序，最多 12 条。
                      </p>
                    </div>
                  </div>

                  {activeSprintPackData.topTerms.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-card-border bg-white px-4 py-6 text-sm text-text-muted">
                      <p className="text-center font-medium text-foreground">
                        当前还没有术语进入冲刺包
                      </p>
                      <p className="mt-2 text-center leading-7">
                        可以先去翻译结果里的关键词区点击收藏，把核心法语术语沉淀进生词本。
                      </p>
                      <div className="mt-4 grid gap-2 text-left text-[13px] leading-6 text-slate-600">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          优先收藏课程高频概念、易混淆名词和公式相关术语。
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          新收藏的术语会在下一次生成时自动进入高频术语清单。
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {activeSprintPackData.topTerms.map((term, index) => (
                        <div
                          key={`${term.id ?? term.termFr}-${index}`}
                          className="rounded-2xl border border-card-border bg-white px-4 py-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-blue-900">
                                {term.termFr}
                              </p>
                              <p className="mt-1 text-sm font-medium text-amber-700">
                                {term.termZh}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                term.isDue
                                  ? "bg-amber-500/10 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {term.isDue ? "待复习优先" : "已入库"}
                            </span>
                          </div>
                          <div className="mt-3 text-sm leading-7 text-slate-700">
                            <MarkdownRenderer
                              content={term.definitionZh}
                              compact
                              className="[&_p]:m-0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="rounded-3xl border border-card-border bg-slate-50/70 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
                        <AlertCircle size={18} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          高风险错题清单
                        </h3>
                        <p className="text-sm text-text-muted">
                          未解决优先，最多 8 条。
                        </p>
                      </div>
                    </div>

                    {activeSprintPackData.highRiskWrongAnswers.length === 0 ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-card-border bg-white px-4 py-6 text-sm text-text-muted">
                        <p className="text-center font-medium text-foreground">
                          当前没有高风险错题
                        </p>
                        <p className="mt-2 text-center leading-7">
                          这通常意味着你最近错题不多，或者还没有开始积累测验数据。
                        </p>
                        <div className="mt-4 grid gap-2 text-left text-[13px] leading-6 text-slate-600">
                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            如果已经掌握得比较稳，可以把复习重点放在高频术语和章节框架。
                          </div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            如果还没做过小测，去课件精读完成一轮题目后再生成，错题区会更有价值。
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {activeSprintPackData.highRiskWrongAnswers.map((item, index) => (
                          <div
                            key={`${item.id ?? item.questionSummary}-${index}`}
                            className="rounded-2xl border border-card-border bg-white px-4 py-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium leading-6 text-foreground">
                                {item.questionSummary}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  item.resolved
                                    ? "bg-emerald-500/10 text-emerald-700"
                                    : "bg-rose-500/10 text-rose-700"
                                }`}
                              >
                                {item.resolved ? "已掌握" : "待巩固"}
                              </span>
                            </div>
                            <div className="mt-3 space-y-2 text-sm">
                              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-red-700">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-red-500">
                                  你的错误答案
                                </span>
                                <MarkdownRenderer
                                  content={item.wrongOption}
                                  compact
                                  className="[&_p]:m-0 [&_p]:text-sm"
                                />
                              </div>
                              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-emerald-700">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-emerald-500">
                                  正确答案
                                </span>
                                <MarkdownRenderer
                                  content={item.answerZh}
                                  compact
                                  className="[&_p]:m-0 [&_p]:text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-card-border bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(236,253,245,0.94))] p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/20">
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          临考建议
                        </h3>
                        <p className="text-sm text-text-muted">
                          按当前数据自动生成的稳定建议，不调用 AI。
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {activeSprintPackData.advice.map((item, index) => (
                        <div
                          key={`${index}-${item}`}
                          className="rounded-2xl bg-white/85 px-4 py-3 text-sm leading-7 text-slate-700 shadow-sm"
                        >
                          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {index + 1}
                          </span>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}


          </div>
        </details>

        {tab === "lessons" && <div className="mb-6">
          <LessonArchive records={lessonRecords} onRemove={async (id) => {
            await removeLessonRecord(ownerId, id);
            await loadData();
          }} />
        </div>}
        {/* Vocab Tab */}
        {tab === "vocab" && (
          <div className="animate-fade-in-up-delay-2">
            {vocabs.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                  <BookOpen size={28} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  生词本空空如也
                </h3>
                <p className="text-sm text-text-muted max-w-md mx-auto">
                  在翻译结果的「关键词速览」中点击 ⭐
                  即可收藏术语到生词本，系统会按艾宾浩斯记忆曲线提醒你复习。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {vocabs.map((vocab) => (
                  <div
                    key={vocab.id}
                    onClick={() => vocab.id && toggleFlip(vocab.id)}
                    className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden relative"
                  >
                    {/* Due badge */}
                    {vocab.nextReviewAt <= dashboardTimestamp && (
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                        待复习
                      </div>
                    )}

                    <div className="p-5 min-h-[140px] flex flex-col items-center justify-center">
                      {!flippedCards.has(vocab.id!) ? (
                        <div className="text-center">
                          <p className="text-xl font-bold text-blue-900 mb-2">
                            {vocab.term_fr}
                          </p>
                          <SpeakButton
                            text={vocab.term_fr}
                            lang={vocab.language === "en" ? "en-US" : "fr-FR"}
                            size={16}
                            className="mx-auto"
                          />
                          <p className="text-xs text-text-light mt-3">
                            点击翻转
                          </p>
                        </div>
                      ) : (
                        <div className="text-center animate-fade-in w-full">
                          <p className="text-base font-semibold text-amber-700 mb-1">
                            {vocab.term_zh}
                          </p>
                          <div className="h-px w-12 bg-amber-200 mx-auto my-2" />
                          <div className="text-sm text-gray-600 leading-relaxed text-left inline-block">
                            <MarkdownRenderer content={vocab.definition_zh} compact className="[&_p]:m-0" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <span className="text-[10px] text-text-light">
                        已复习 {vocab.reviewCount} 次
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (vocab.id) {
                            void handleDeleteVocab(vocab.id);
                          }
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wrong Answers Tab */}
        {tab === "wrong" && (
          <div className="space-y-6 animate-fade-in-up-delay-2">
            {unresolvedWrong.length === 0 && resolvedWrong.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                  <AlertCircle size={28} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  错题本空空如也
                </h3>
                <p className="text-sm text-text-muted max-w-md mx-auto">
                  在「课件精读」做随堂测验时，答错的题目会自动收录到这里。做对后可以标记为「已解决」。
                </p>
              </div>
            ) : (
              <>
                {/* Unresolved */}
                {unresolvedWrong.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-rose-600 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      待巩固 ({unresolvedWrong.length})
                    </h3>
                    <div className="space-y-3">
                      {unresolvedWrong.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5 hover:shadow-md transition-all"
                        >
                          <div className="text-base font-medium text-foreground mb-3">
                            <MarkdownRenderer content={item.question_zh} compact className="[&_p]:m-0" />
                          </div>
                          <div className="flex flex-col gap-2 text-sm mb-3">
                            <div className="text-red-500 bg-red-50 p-2.5 rounded-lg border border-red-100/50">
                              <span className="text-xs font-semibold block mb-1 opacity-80">你的答案:</span>
                              <MarkdownRenderer content={item.wrongOption} compact className="[&_p]:m-0 [&_p]:text-sm" />
                            </div>
                            <div className="text-green-600 bg-green-50 p-2.5 rounded-lg border border-green-100/50">
                              <span className="text-xs font-semibold block mb-1 opacity-80">正确答案:</span>
                              <MarkdownRenderer content={item.answer_zh} compact className="[&_p]:m-0 [&_p]:text-sm" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-text-light">
                              {new Date(item.createdAt).toLocaleDateString(
                                "zh-CN"
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setRequizItemId(item.id ?? null)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                              >
                                <RotateCcw size={12} />
                                重新做题
                              </button>
                              <button
                                onClick={() => {
                                  if (item.id) {
                                    void handleDeleteWrong(item.id);
                                  }
                                }}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="删除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved */}
                {resolvedWrong.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-600 mb-3 flex items-center gap-2">
                      <Check size={14} />
                      已掌握 ({resolvedWrong.length})
                    </h3>
                    <div className="space-y-2">
                      {resolvedWrong.map((item) => (
                        <div
                          key={item.id}
                          className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-center justify-between opacity-70"
                        >
                          <div className="text-sm text-gray-500 line-through flex-1 mr-4 min-w-0">
                            <MarkdownRenderer content={item.question_zh} compact className="[&_p]:truncate [&_p]:m-0" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-green-500 bg-green-50 px-2 py-0.5 rounded">
                              ✅ 已解决
                            </span>
                            <button
                              onClick={() => {
                                if (item.id) {
                                  void handleDeleteWrong(item.id);
                                }
                              }}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Flashcard Review Modal */}
      {isReviewing && dueVocabs.length > 0 && (
        <FlashcardReview
          cards={dueVocabs}
          ownerId={ownerId}
          onClose={() => setIsReviewing(false)}
          onReviewed={loadData}
        />
      )}

      {/* Re-quiz Modal */}
      {requizItem && (
        <ReQuizModal
          item={requizItem}
          ownerId={ownerId}
          onClose={() => setRequizItemId(null)}
          onResolved={loadData}
        />
      )}
    </div>
  );
}
