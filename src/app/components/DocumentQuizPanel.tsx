"use client";

import { useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { addWrongAnswer } from "@/lib/db";
import { useLesson } from "@/hooks/useLesson";

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
  answerIndex?: number;
  sourceImage?: number;
  explanation_fr?: string;
  explanation_zh?: string;
  explanation_en?: string;
  explanation?: string;
}

export type QuizLang = "zh" | "fr" | "en";

function QuizQuestion({ item, number, language, ownerId, lesson, sourceImages, disabled }: {
  item: QuizItem;
  number: number;
  language: QuizLang;
  ownerId: string;
  lesson: string;
  sourceImages: string[];
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "error" | null>(null);
  const correct = item.answerIndex ?? item.options_zh.indexOf(item.answer_zh);
  const options = item["options_" + language as "options_zh" | "options_fr" | "options_en"];
  const question = item["question_" + language as "question_zh" | "question_fr" | "question_en"];
  const explanation = item["explanation_" + language as "explanation_zh" | "explanation_fr" | "explanation_en"] ||
    item.explanation_zh || item.explanation;
  const source = item.sourceImage ? sourceImages[item.sourceImage - 1] : undefined;

  async function saveWrong(index: number) {
    try {
      await addWrongAnswer(ownerId, {
        question_fr: item.question_fr, question_zh: item.question_zh, question_en: item.question_en,
        options_fr: item.options_fr, options_zh: item.options_zh, options_en: item.options_en,
        answer_fr: item.options_fr[correct], answer_zh: item.options_zh[correct], answer_en: item.options_en[correct],
        answerIndex: correct, selectedIndex: index, wrongOption: options[index], language, lesson,
        explanation, source: source ? "截图 " + item.sourceImage + " · " + source : undefined,
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <article className="rounded-xl border border-card-border bg-background p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="pt-1 text-sm font-medium">{number}.</span>
        <MarkdownRenderer content={question} compact className="min-w-0 flex-1" />
      </div>
      <div className="space-y-2">
        {options.map((option, index) => (
          <button key={index} type="button"
            onClick={() => {
              if (selected !== null || correct < 0) return;
              setSelected(index);
              if (index !== correct) void saveWrong(index);
            }}
            disabled={disabled || selected !== null || correct < 0}
            className={"flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm " +
              (selected !== null && index === correct ? "border-green-400 bg-green-50" :
                selected === index ? "border-rose-400 bg-rose-50" : "border-card-border bg-white")}>
            <span className="pt-1 font-medium">{String.fromCharCode(65 + index)}.</span>
            <MarkdownRenderer content={option} compact className="min-w-0 flex-1" />
          </button>
        ))}
      </div>
      {selected !== null && <div className="mt-3 space-y-1.5 text-sm">
        <p className={selected === correct ? "text-green-700" : "text-rose-700"}>
          {selected === correct ? "答对了" : "正确选项 " + String.fromCharCode(65 + correct)}
        </p>
        {explanation && <MarkdownRenderer content={explanation} compact />}
        {source && <a href={"#document-image-" + item.sourceImage} className="block text-xs text-primary underline">
          查看来源截图 {item.sourceImage} · {source}
        </a>}
        {saveStatus === "saved" && <p className="text-xs text-text-muted">已加入错题本</p>}
        {saveStatus === "error" && <p role="alert" className="text-xs text-rose-700">错题保存失败。 <button
          className="underline" onClick={() => void saveWrong(selected)}>重试保存</button></p>}
      </div>}
    </article>
  );
}

export default function DocumentQuizPanel({ quizData, quizLang, onQuizLangChange, sourceImages = [] }: {
  quizData: QuizItem[];
  quizLang: QuizLang;
  onQuizLangChange: (language: QuizLang) => void;
  sourceImages?: string[];
}) {
  const { ownerId, lesson, loading } = useLesson();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-rose-600">随堂小测（{quizData.length} 题）</h3>
        <div className="flex gap-1 rounded-full border border-card-border bg-white p-1 text-xs">
          {([["zh", "中"], ["fr", "法"], ["en", "En"]] as const).map(([language, label]) => (
            <button key={language} aria-pressed={quizLang === language} onClick={() => onQuizLangChange(language)}
              className={"rounded-full px-3 py-1 " + (quizLang === language ? "bg-primary text-white" : "text-text-muted")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {quizData.map((item, index) => (
        <QuizQuestion key={ownerId + ":" + index + ":" + item.question_zh} item={item} number={index + 1}
          language={quizLang} ownerId={ownerId} lesson={lesson} sourceImages={sourceImages} disabled={loading} />
      ))}
    </div>
  );
}
