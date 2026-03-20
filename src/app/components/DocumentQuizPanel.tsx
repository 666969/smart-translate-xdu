"use client";

import { useState, useCallback } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { addWrongAnswer } from "@/lib/db";

export interface QuizItem {
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

export type QuizLang = "zh" | "fr" | "en";

interface DocumentQuizPanelProps {
  quizData: QuizItem[];
  quizLang: QuizLang;
  onQuizLangChange: (lang: QuizLang) => void;
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
  const localizedAnswer =
    lang === "fr"
      ? item.answer_fr.trim()
      : lang === "en"
        ? item.answer_en.trim()
        : item.answer_zh.trim();

  if (localizedAnswer) {
    return localizedAnswer;
  }

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

/* ========== Interactive Quiz Question ========== */

function QuizQuestion({
  q,
  idx,
  quizLang,
}: {
  q: QuizItem;
  idx: number;
  quizLang: QuizLang;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [wrongSaved, setWrongSaved] = useState(false);

  const options = getQuizOptions(q, quizLang);
  const explanation = getQuizExplanation(q, quizLang);
  const correctAnswer = getQuizAnswer(q, quizLang);

  const handleOptionClick = useCallback(
    async (option: string) => {
      if (showAnswer) return;
      setSelectedOption(option);
      setShowAnswer(true);

      // If wrong, auto-save to wrong answer book
      if (option !== correctAnswer && !wrongSaved) {
        try {
          await addWrongAnswer({
            question_fr: q.question_fr,
            question_zh: q.question_zh,
            question_en: q.question_en,
            options_fr: q.options_fr,
            options_zh: q.options_zh,
            options_en: q.options_en,
            answer_fr: q.answer_fr,
            answer_zh: q.answer_zh,
            answer_en: q.answer_en,
            wrongOption: option,
          });
          setWrongSaved(true);
        } catch (e) {
          console.error("Failed to save wrong answer:", e);
        }
      }
    },
    [showAnswer, correctAnswer, wrongSaved, q]
  );

  return (
    <div className="p-4 rounded-xl bg-background border border-card-border shadow-sm">
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
        {options.map((opt, optIdx) => {
          const isCorrect = showAnswer && opt === correctAnswer;
          const isWrong = showAnswer && opt === selectedOption && opt !== correctAnswer;

          return (
            <button
              key={optIdx}
              onClick={() => handleOptionClick(opt)}
              disabled={showAnswer}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all duration-200 ${
                isCorrect
                  ? "border-green-400 bg-green-50 ring-1 ring-green-300"
                  : isWrong
                    ? "border-red-400 bg-red-50 ring-1 ring-red-300"
                    : showAnswer
                      ? "border-card-border/50 opacity-50"
                      : "border-card-border/50 bg-card-bg hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`pt-0.5 font-medium ${isCorrect ? "text-green-600" : isWrong ? "text-red-600" : "text-foreground"}`}>
                  {String.fromCharCode(65 + optIdx)}.
                </span>
                <div className="min-w-0 flex-1">
                  <MarkdownRenderer
                    content={opt}
                    className="[&>p]:mb-0 [&_p]:text-sm [&_p]:leading-6 [&_.math-display]:my-1 [&_.math-display]:py-1"
                  />
                </div>
                {isCorrect && <span className="text-green-500 text-xs mt-0.5">✅</span>}
                {isWrong && <span className="text-red-500 text-xs mt-0.5">❌</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Wrong answer saved notification */}
      {showAnswer && selectedOption !== correctAnswer && wrongSaved && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-600 flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          已自动收录到错题本，可前往"笔记本"页面复习
        </div>
      )}

      {/* Explanation (show after answering) */}
      {showAnswer && (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-sm animate-fade-in">
          <div className="mb-2 flex items-start gap-1.5 text-emerald-600">
            <span className="pt-0.5 text-sm font-semibold">
              {getQuizAnswerLabel(quizLang)}：
            </span>
            <div className="min-w-0 flex-1">
              <MarkdownRenderer
                content={correctAnswer}
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
      )}

      {/* Prompt to click if not yet answered */}
      {!showAnswer && (
        <p className="text-[10px] text-text-light text-center">
          点击选项作答 · 答错自动收录错题本
        </p>
      )}
    </div>
  );
}

export default function DocumentQuizPanel({
  quizData,
  quizLang,
  onQuizLangChange,
}: DocumentQuizPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-rose-500 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-rose-500/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          随堂小测 ({quizData.length}题)
        </h3>
        <div className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-1 py-1 text-[11px]">
          <button
            onClick={() => onQuizLangChange("zh")}
            className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "zh" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
          >
            中
          </button>
          <button
            onClick={() => onQuizLangChange("fr")}
            className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "fr" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
          >
            法
          </button>
          <button
            onClick={() => onQuizLangChange("en")}
            className={`px-2.5 py-1 rounded-full transition-all ${quizLang === "en" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-foreground"}`}
          >
            En
          </button>
        </div>
      </div>

      {quizData.map((q, idx) => (
        <QuizQuestion key={idx} q={q} idx={idx} quizLang={quizLang} />
      ))}
    </div>
  );
}
