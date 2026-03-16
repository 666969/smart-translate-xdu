"use client";

import MarkdownRenderer from "./MarkdownRenderer";

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

      {quizData.map((q, idx) => {
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
              {options.map((opt, optIdx) => (
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
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
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
  );
}
