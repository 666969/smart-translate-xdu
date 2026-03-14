"use client";

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
    .replace(/：/g, " : ")
    .replace(/\s+/g, " ")
    .replace(
      /([^\n])\s+([A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç][A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç' -]{0,80}\s+\([^)]+\)\s+:)/gu,
      "$1\n$2"
    );
}

function parseKeywordItems(content?: string) {
  if (!content) {
    return [] as KeywordItem[];
  }

  return normalizeKeywordContent(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)\s+\((.*?)\)\s+:\s+(.*)$/u);
      if (!match) {
        return null;
      }

      return {
        term_fr: match[1].trim(),
        term_zh: match[2].trim(),
        definition_zh: match[3].trim(),
      };
    })
    .filter((item): item is KeywordItem => Boolean(item));
}

export default function KeywordGlossary({
  content,
  items,
}: KeywordGlossaryProps) {
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
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[12px] font-medium text-amber-700">
              {item.term_zh}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-7 text-slate-600">
            {item.definition_zh}
          </p>
        </div>
      ))}
    </div>
  );
}
