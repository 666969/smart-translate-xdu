"use client";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { normalizeLatexContent, splitMarkdownRenderLines } from '@/lib/markdownMath';

interface MarkdownRendererProps {
  content: string;
  preserveLineBreaks?: boolean;
  compact?: boolean;
  className?: string;
}

export default function MarkdownRenderer({
  content,
  preserveLineBreaks = false,
  compact = false,
  className = "",
}: MarkdownRendererProps) {
  // 预处理内容，解决大模型漏掉 $...$、混入控制字符、或输出不标准 LaTeX 的情况。
  const processedContent = normalizeLatexContent(content);

  if (preserveLineBreaks) {
    const lines = splitMarkdownRenderLines(processedContent);
    const gapClass = compact ? "space-y-1.5" : "space-y-2";
    const blankLineClass = compact ? "h-1.5" : "h-3";
    const lineWrapperClass = compact
      ? "[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0"
      : "rounded-lg px-2.5 py-1.5 transition-colors hover:bg-primary/5 [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0";

    return (
      <div className={`text-sm leading-relaxed text-foreground font-sans ${gapClass} [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_.katex-display]:my-1 ${className}`}>
        {lines.map((line, index) => {
          if (!line.trim()) {
            return <div key={`gap-${index}`} className={blankLineClass} />;
          }

          return (
            <div key={`line-${index}`} className={lineWrapperClass}>
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {line}
              </ReactMarkdown>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`text-sm leading-relaxed text-foreground font-sans 
      ${compact ? "[&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&_li]:mb-0.5 [&_.katex-display]:py-1.5 [&_.katex-display]:my-1.5" : "[&>p]:mb-3 [&>ul]:mb-3 [&>ol]:mb-3 [&_li]:mb-1 [&_.katex-display]:py-2 [&_.katex-display]:my-2"}
      last:[&>p]:mb-0 
      [&>ul]:list-disc [&>ul]:pl-5 
      [&>ol]:list-decimal [&>ol]:pl-5 
      [&_li]:mb-1 
      [&_strong]:font-semibold [&_strong]:text-primary-dark
      [&_em]:italic
      [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded text-[13px] [&_code]:text-primary
      [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-sm
      [&_pre]:bg-gray-50 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-gray-200 [&_pre]:mb-3 [&_pre]:overflow-x-auto
      [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:mb-3
      [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden
    ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
