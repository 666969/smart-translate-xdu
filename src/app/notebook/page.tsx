"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  Star,
  RotateCcw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertCircle,
} from "lucide-react";
import Header from "../components/Header";
import SpeakButton from "../components/SpeakButton";
import {
  getAllVocabs,
  getVocabsDueForReview,
  markVocabReviewed,
  removeVocab,
  getAllWrongAnswers,
  resolveWrongAnswer,
  removeWrongAnswer,
} from "@/lib/db";
import type { VocabItem, WrongAnswerItem } from "@/lib/db";
import { useAppSession } from "../components/AppSessionProvider";

type TabMode = "vocab" | "wrong";

/* ========== Flashcard Review Modal ========== */

function FlashcardReview({
  cards,
  onClose,
  onReviewed,
}: {
  cards: VocabItem[];
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const current = cards[currentIndex];
  const isLast = currentIndex >= cards.length - 1;

  const handleResponse = async (remembered: boolean) => {
    if (!current?.id) return;
    await markVocabReviewed(current.id, remembered);
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
                lang="fr-FR"
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
              <p className="text-base text-gray-700 leading-relaxed">
                {current.definition_zh}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {flipped && (
          <div className="px-6 pb-6 flex gap-3 animate-fade-in">
            <button
              onClick={() => handleResponse(false)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors"
            >
              <RotateCcw size={18} />
              再看一次
            </button>
            <button
              onClick={() => handleResponse(true)}
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

function ReQuizModal({
  item,
  onClose,
  onResolved,
}: {
  item: WrongAnswerItem;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const isCorrect = selectedOption === item.answer_zh;

  const handleSubmit = async () => {
    setShowResult(true);
    if (isCorrect && item.id) {
      await resolveWrongAnswer(item.id);
      setTimeout(() => {
        onResolved();
        onClose();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">重新做题</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-base font-medium text-foreground leading-relaxed">
            {item.question_zh}
          </p>

          <div className="space-y-2">
            {item.options_zh.map((option, idx) => (
              <button
                key={idx}
                onClick={() => !showResult && setSelectedOption(option)}
                disabled={showResult}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm ${
                  showResult
                    ? option === item.answer_zh
                      ? "border-green-400 bg-green-50 text-green-800"
                      : option === selectedOption
                        ? "border-red-400 bg-red-50 text-red-800"
                        : "border-gray-100 text-gray-400"
                    : selectedOption === option
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 hover:border-primary/30 hover:bg-gray-50"
                }`}
              >
                <span className="font-medium mr-2">
                  {String.fromCharCode(65 + idx)}.
                </span>
                {option}
              </button>
            ))}
          </div>

          {showResult && (
            <div
              className={`px-4 py-3 rounded-xl text-sm font-medium ${
                isCorrect
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {isCorrect
                ? "✅ 回答正确！已从错题本中移除。"
                : "❌ 回答错误，请继续复习该知识点。"}
            </div>
          )}
        </div>

        {!showResult && selectedOption && (
          <div className="px-6 pb-6">
            <button
              onClick={handleSubmit}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white font-medium hover:shadow-lg transition-all"
            >
              确认答案
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== Main Page ========== */

export default function NotebookPage() {
  const { notebook } = useAppSession();
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
  const [vocabs, setVocabs] = useState<VocabItem[]>([]);
  const [dueVocabs, setDueVocabs] = useState<VocabItem[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [allVocabs, due, allWrong] = await Promise.all([
        getAllVocabs(),
        getVocabsDueForReview(),
        getAllWrongAnswers(),
      ]);
      setVocabs(allVocabs);
      setDueVocabs(due);
      setWrongAnswers(allWrong);
    } catch (e) {
      console.error("Failed to load notebook data:", e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteVocab = async (id: number) => {
    await removeVocab(id);
    loadData();
  };

  const handleDeleteWrong = async (id: number) => {
    await removeWrongAnswer(id);
    loadData();
  };

  const toggleFlip = (id: number) => {
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
  const requizItem = useMemo(
    () => wrongAnswers.find((item) => item.id === requizItemId) ?? null,
    [wrongAnswers, requizItemId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Star size={20} />
            </div>
            我的笔记本
          </h1>
          <p className="text-sm text-text-muted mt-2">
            收藏的术语和做错的题目都在这里，利用艾宾浩斯记忆曲线帮你记得更牢。
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mb-6 animate-fade-in-up-delay-1">
          <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setTab("vocab")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "vocab"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              📚 生词本
              {vocabs.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
                  {vocabs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("wrong")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "wrong"
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              ❌ 错题本
              {unresolvedWrong.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
                  {unresolvedWrong.length}
                </span>
              )}
            </button>
          </div>

          {tab === "vocab" && dueVocabs.length > 0 && (
            <button
              onClick={() => setIsReviewing(true)}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-medium hover:shadow-lg hover:shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <RotateCcw size={16} />
              开始复习 ({dueVocabs.length} 个待复习)
            </button>
          )}
        </div>

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
                  在翻译结果的"关键词速览"中点击 ⭐
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
                    {vocab.nextReviewAt <= Date.now() && (
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
                            lang="fr-FR"
                            size={16}
                            className="mx-auto"
                          />
                          <p className="text-xs text-text-light mt-3">
                            点击翻转
                          </p>
                        </div>
                      ) : (
                        <div className="text-center animate-fade-in">
                          <p className="text-base font-semibold text-amber-700 mb-1">
                            {vocab.term_zh}
                          </p>
                          <div className="h-px w-12 bg-amber-200 mx-auto my-2" />
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {vocab.definition_zh}
                          </p>
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
                          vocab.id && handleDeleteVocab(vocab.id);
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
                  在"课件精读"做随堂测验时，答错的题目会自动收录到这里。做对后可以标记为"已解决"。
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
                          <p className="text-base font-medium text-foreground mb-3">
                            {item.question_zh}
                          </p>
                          <div className="flex items-center gap-2 text-sm mb-3">
                            <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-md text-xs">
                              你的答案: {item.wrongOption}
                            </span>
                            <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-md text-xs">
                              正确答案: {item.answer_zh}
                            </span>
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
                                onClick={() =>
                                  item.id && handleDeleteWrong(item.id)
                                }
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
                          <p className="text-sm text-gray-500 line-through truncate flex-1 mr-4">
                            {item.question_zh}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-green-500 bg-green-50 px-2 py-0.5 rounded">
                              ✅ 已解决
                            </span>
                            <button
                              onClick={() =>
                                item.id && handleDeleteWrong(item.id)
                              }
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
          onClose={() => setIsReviewing(false)}
          onReviewed={loadData}
        />
      )}

      {/* Re-quiz Modal */}
      {requizItem && (
        <ReQuizModal
          item={requizItem}
          onClose={() => setRequizItemId(null)}
          onResolved={loadData}
        />
      )}
    </div>
  );
}
