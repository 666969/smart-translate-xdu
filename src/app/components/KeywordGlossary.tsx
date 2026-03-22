"use client";

import { useState, useCallback, useEffect } from "react";
import { Star } from "lucide-react";
import SpeakButton from "./SpeakButton";
import MarkdownRenderer from "./MarkdownRenderer";
import { addVocab, isVocabExists, resolveOwnerId } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";

export interface KeywordItem {
  term_fr: string;
  term_zh: string;
  definition_zh: string;
}

interface KeywordGlossaryProps {
  content?: string;
  items?: KeywordItem[];
}

function normalizeKeywordContent(content: string) {
  return content
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/：/g, " : ")
    .replace(/^\s*(?:[-*•]\s+|\d+[.)、]\s+)/gmu, "")
    .replace(/\s+/g, " ")
    .replace(
      /([^\n])\s+([A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç][A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç' -]{0,80}\s*\([^)]+\)\s*:)/gu,
      "$1\n$2"
    )
    .replace(/\n{2,}/g, "\n");
}

function parseKeywordItems(content?: string) {
  if (!content) {
    return [] as KeywordItem[];
  }

  const lines = normalizeKeywordContent(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedItems: KeywordItem[] = [];
  let currentItem: KeywordItem | null = null;

  const pushCurrentItem = () => {
    if (
      currentItem?.term_fr &&
      currentItem.term_zh &&
      currentItem.definition_zh
    ) {
      parsedItems.push({
        term_fr: currentItem.term_fr.trim(),
        term_zh: currentItem.term_zh.trim(),
        definition_zh: currentItem.definition_zh.trim(),
      });
    }
  };

  for (const line of lines) {
    const match = line.match(/^(.*?)\s*\((.*?)\)\s*:\s*(.*)$/u);
    if (match) {
      pushCurrentItem();
      currentItem = {
        term_fr: match[1].trim(),
        term_zh: match[2].trim(),
        definition_zh: match[3].trim(),
      };
      continue;
    }

    if (currentItem) {
      currentItem.definition_zh = `${currentItem.definition_zh} ${line}`.trim();
    }
  }

  pushCurrentItem();
  return parsedItems;
}

function CollectButton({ item, ownerId }: { item: KeywordItem; ownerId: string }) {
  const [saved, setSaved] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void isVocabExists(ownerId, item.term_fr)
      .then((exists) => {
        if (isMounted) {
          setSaved(exists);
        }
      })
      .catch((error) => {
        console.error("Failed to check vocab exists:", error);
      });

    return () => {
      isMounted = false;
    };
  }, [item.term_fr, ownerId]);

  const handleCollect = useCallback(async () => {
    if (saved) return;
    try {
      const exists = await isVocabExists(ownerId, item.term_fr);
      if (exists) {
        setSaved(true);
        return;
      }
      await addVocab(ownerId, {
        term_fr: item.term_fr,
        term_zh: item.term_zh,
        definition_zh: item.definition_zh,
        source: "snippet",
      });
      setSaved(true);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (e) {
      console.error("Failed to save vocab:", e);
    }
  }, [item, ownerId, saved]);

  return (
    <div className="relative">
      <button
        onClick={handleCollect}
        className={`transition-all duration-200 ${
          saved
            ? "text-amber-500"
            : "text-gray-300 hover:text-amber-500 hover:scale-110"
        }`}
        title={saved ? "已收藏" : "收藏到生词本"}
      >
        <Star size={15} fill={saved ? "currentColor" : "none"} />
      </button>
      {showToast && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-medium shadow-lg animate-fade-in z-10">
          已收藏到生词本 ⭐
        </div>
      )}
    </div>
  );
}

export default function KeywordGlossary({
  content,
  items,
}: KeywordGlossaryProps) {
  const { uid } = useAuth();
  const ownerId = resolveOwnerId(uid);
  const normalizedItems = items && items.length > 0 ? items : parseKeywordItems(content);

  if (normalizedItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-5 text-sm text-amber-700">
        关键词暂未整理成功，请重新解析一次。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {normalizedItems.map((item, index) => (
        <div
          key={`${item.term_fr}-${index}`}
          className="rounded-[22px] border border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.72))] px-4 py-3.5 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm leading-7">
            <span className="font-semibold text-slate-900">{item.term_fr}</span>
            <SpeakButton text={item.term_fr} lang="fr-FR" size={14} />
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[12px] font-medium text-amber-700">
              {item.term_zh}
            </span>
            <div className="ml-auto">
              <CollectButton item={item} ownerId={ownerId} />
            </div>
          </div>
          <div className="mt-1.5 text-sm leading-7 text-slate-600">
            <MarkdownRenderer
              content={item.definition_zh}
              compact
              className="[&_p]:m-0 [&_p]:text-sm [&_p]:leading-7 [&_.math-display]:my-1 [&_.math-display]:py-0.5"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
