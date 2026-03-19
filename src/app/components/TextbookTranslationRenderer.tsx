"use client";

import type { TranslationLayoutBlock } from "@/lib/translationLayout";
import MarkdownRenderer from "./MarkdownRenderer";

interface TextbookTranslationRendererProps {
  layout: TranslationLayoutBlock[];
  fallbackContent?: string | null;
  className?: string;
}

function renderBlock(block: TranslationLayoutBlock, index: number) {
  switch (block.type) {
    case "page_title":
      return (
        <div key={`layout-${index}`} className="mb-5">
          <MarkdownRenderer
            content={block.text || ""}
            compact
            className="[&>p]:mb-0 [&_p]:text-[28px] [&_p]:font-semibold [&_p]:tracking-[-0.02em] [&_p]:leading-[1.25]"
          />
        </div>
      );
    case "section_title":
      return (
        <div key={`layout-${index}`} className="mb-3 border-b border-slate-200/90 pb-1.5">
          <MarkdownRenderer
            content={block.text || ""}
            compact
            className="[&>p]:mb-0 [&_p]:text-[20px] [&_p]:font-semibold [&_p]:leading-[1.35]"
          />
        </div>
      );
    case "subtitle":
      return (
        <div key={`layout-${index}`} className="mb-3 pt-1">
          <MarkdownRenderer
            content={block.text || ""}
            compact
            className="[&>p]:mb-0 [&_p]:text-[16px] [&_p]:font-semibold [&_p]:leading-[1.45]"
          />
        </div>
      );
    case "paragraph":
      return (
        <div key={`layout-${index}`} className="mb-3">
          <MarkdownRenderer
            content={block.text || ""}
            compact
            className="[&>p]:mb-0 [&_p]:text-[15px] [&_p]:leading-[1.9] [&_li]:text-[15px] [&_li]:leading-[1.9]"
          />
        </div>
      );
    case "formula":
      return (
        <div key={`layout-${index}`} className="mb-4 flex justify-center">
          <div className="max-w-full overflow-x-auto px-2">
            <MarkdownRenderer
              content={block.text || ""}
              compact
              className="[&>p]:mb-0 [&_.math-display]:my-0 [&_.math-display]:py-0.5 [&_.katex-display]:margin-0"
            />
          </div>
        </div>
      );
    case "formula_box":
      return (
        <div key={`layout-${index}`} className="mb-4 flex justify-center">
          <div className="w-full max-w-[760px] rounded-[20px] border border-slate-300 bg-white px-5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="space-y-1.5 text-center">
              {(block.items || []).map((item, itemIndex) => (
                <MarkdownRenderer
                  key={`formula-box-${index}-${itemIndex}`}
                  content={item}
                  compact
                  className="[&>p]:mb-0 [&_.math-display]:my-0 [&_.math-display]:py-0.5 [&_.katex-display]:margin-0"
                />
              ))}
            </div>
          </div>
        </div>
      );
    case "bullet_list":
      return (
        <div key={`layout-${index}`} className="mb-3">
          <ul className="space-y-1.5 pl-6 text-[15px] leading-[1.8] text-slate-700 marker:text-slate-500 list-disc">
            {(block.items || []).map((item, itemIndex) => (
              <li key={`bullet-${index}-${itemIndex}`}>
                <MarkdownRenderer
                  content={item}
                  compact
                  className="[&>p]:mb-0 [&_p]:text-[15px] [&_p]:leading-[1.8] [&_.math-display]:my-0.5 [&_.math-display]:py-0.5"
                />
              </li>
            ))}
          </ul>
        </div>
      );
    case "key_value_list":
      return (
        <div key={`layout-${index}`} className="mb-3 space-y-1.5">
          {(block.pairs || []).map((pair, pairIndex) => (
            <div
              key={`pair-${index}-${pairIndex}`}
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px] leading-[1.8] text-slate-700"
            >
              <div className="font-semibold text-slate-900 whitespace-nowrap">
                <MarkdownRenderer
                  content={pair.label}
                  compact
                  className="[&>p]:mb-0 [&_p]:text-[15px] [&_p]:font-semibold [&_p]:leading-[1.8]"
                />
              </div>
              <div>
                <MarkdownRenderer
                  content={pair.value}
                  compact
                  className="[&>p]:mb-0 [&_p]:text-[15px] [&_p]:leading-[1.8]"
                />
              </div>
            </div>
          ))}
        </div>
      );
    case "note":
      return (
        <div
          key={`layout-${index}`}
          className="mb-3 rounded-[18px] border border-slate-200 bg-slate-50/85 px-4 py-3"
        >
          <MarkdownRenderer
            content={block.text || ""}
            compact
            className="[&>p]:mb-0 [&_p]:text-[14px] [&_p]:leading-[1.8] [&_p]:text-slate-600"
          />
        </div>
      );
    default:
      return null;
  }
}

export default function TextbookTranslationRenderer({
  layout,
  fallbackContent,
  className = "",
}: TextbookTranslationRendererProps) {
  if (!layout || layout.length === 0) {
    return (
      <div className={`mx-auto max-w-[860px] ${className}`}>
        <MarkdownRenderer
          content={fallbackContent || ""}
          preserveLineBreaks
          compact
          className="[&_p]:text-[15px] [&_p]:leading-[1.9] [&_li]:text-[15px] [&_li]:leading-[1.8]"
        />
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-[860px] text-slate-800 ${className}`}>
      {layout.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
