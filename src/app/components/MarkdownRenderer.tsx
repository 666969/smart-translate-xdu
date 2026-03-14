"use client";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  preserveLineBreaks?: boolean;
  className?: string;
}

export default function MarkdownRenderer({
  content,
  preserveLineBreaks = false,
  className = "",
}: MarkdownRendererProps) {
  // 预处理内容，解决大模型有时候输出的 LaTeX 公式符号不标准的问题
  // 例如大模型有时输出 \[ \\int \] 作为独立块，或者 \( x \) 作为行内公式
  const processedContent = content
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$') // 将 \[ ... \] 转换为 $$ ... $$ (需要多加 $ 转义)
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');   // 将 \( ... \) 转换为 $ ... $

  if (preserveLineBreaks) {
    const lines = processedContent.split(/\r?\n/);

    return (
      <div className={`text-sm leading-relaxed text-foreground font-sans space-y-2 [&_.math-display]:overflow-x-auto [&_.math-display]:py-1 [&_.math-display]:my-1 ${className}`}>
        {lines.map((line, index) => {
          if (!line.trim()) {
            return <div key={`gap-${index}`} className="h-3" />;
          }

          return (
            <div
              key={`line-${index}`}
              className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-primary/5 [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0"
            >
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
      [&>p]:mb-3 last:[&>p]:mb-0 
      [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3 
      [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-3 
      [&_li]:mb-1 
      [&_strong]:font-semibold [&_strong]:text-primary-dark
      [&_em]:italic
      [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded text-[13px] [&_code]:text-primary
      [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-sm
      [&_pre]:bg-gray-50 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-gray-200 [&_pre]:mb-3 [&_pre]:overflow-x-auto
      [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:mb-3
      [&_.math-display]:overflow-x-auto [&_.math-display]:py-2 [&_.math-display]:my-2
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
