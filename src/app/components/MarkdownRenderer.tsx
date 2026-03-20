"use client";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  preserveLineBreaks?: boolean;
  compact?: boolean;
  className?: string;
}

const LATEX_COMMAND_PATTERN =
  /\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log|forall|exists|infty|alpha|beta|gamma|theta|phi|omega|mathbb|mathrm|mathcal|operatorname|cdot|times|leq|geq|neq|to|rightarrow|left|right)\b/u;

function countUnescapedDollarSigns(text: string) {
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "$" && text[index - 1] !== "\\") {
      count += 1;
    }
  }

  return count;
}

function repairFormulaBody(candidate: string) {
  return candidate
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\$\$/g, "")
    .replace(/^[$\s]+|[$\s]+$/g, "")
    .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
    .replace(/\$(?=\})/gu, "")
    .replace(/∀/g, "\\forall ")
    .replace(/∃/g, "\\exists ")
    .replace(/∈/g, "\\in ")
    .replace(/ℝ/g, "\\mathbb{R}")
    .replace(/α\s*([0-9]+)/g, "\\alpha_$1")
    .replace(/β\s*([0-9]+)/g, "\\beta_$1")
    .replace(/γ\s*([0-9]+)/g, "\\gamma_$1")
    .replace(/θ\s*([0-9]+)/g, "\\theta_$1")
    .replace(/φ\s*([0-9]+)/g, "\\phi_$1")
    .replace(/ω\s*([0-9]+)/g, "\\omega_$1")
    .replace(/(^|[\s(,，;；:：])orall(?=\s+\\?[A-Za-z])/gu, "$1\\forall")
    .replace(/(^|[\s(,，;；:：])forall(?=\s+\\?[A-Za-z])/gu, "$1\\forall")
    .replace(/(^|[\s(,，;；:：])exists(?=\s+\\?[A-Za-z])/gu, "$1\\exists")
    .replace(/(^|[\s(,，;；:：])infty(?=[\s)}\]]|$)/gu, "$1\\infty")
    .replace(/(^|[\s(,，;；:：])alpha(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\alpha")
    .replace(/(^|[\s(,，;；:：])beta(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\beta")
    .replace(/(^|[\s(,，;；:：])gamma(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\gamma")
    .replace(/(^|[\s(,，;；:：])theta(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\theta")
    .replace(/(^|[\s(,，;；:：])phi(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\phi")
    .replace(/(^|[\s(,，;；:：])omega(?=[_^{\s.,，;；:：)}\]]|$)/gu, "$1\\omega")
    .replace(/(^|[^\\])frac(?=\s*\{)/gu, "$1\\frac")
    .replace(/(^|[^\\])int(?=\s*[_{])/gu, "$1\\int")
    .replace(/(^|[^\\])sum(?=\s*[_{])/gu, "$1\\sum")
    .replace(/(^|[^\\])sqrt(?=\s*[\[{])/gu, "$1\\sqrt")
    .replace(/(^|[\s(,，;；:：])sin(?=\s*[\[(\\])/gu, "$1\\sin")
    .replace(/(^|[\s(,，;；:：])cos(?=\s*[\[(\\])/gu, "$1\\cos")
    .replace(/(^|[\s(,，;；:：])tan(?=\s*[\[(\\])/gu, "$1\\tan")
    .replace(/(^|[\s(,，;；:：])ln(?=\s*[\[(\\])/gu, "$1\\ln")
    .replace(/(^|[\s(,，;；:：])log(?=\s*[\[(\\])/gu, "$1\\log")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeInlineFormulaCandidate(candidate: string) {
  const trimmed = repairFormulaBody(candidate);

  if (!trimmed || /[\u4e00-\u9fff]/u.test(trimmed)) {
    return false;
  }

  return (
    LATEX_COMMAND_PATTERN.test(trimmed) ||
    /[=^_{}|]/u.test(trimmed) ||
    /[∀∃∈ℝα-ωΑ-Ω∫∑∞≈≠≤≥±]/u.test(trimmed) ||
    /\b[A-Za-z]\w*\([^)\n]+\)/u.test(trimmed)
  );
}

function looksLikeStandaloneFormulaLine(line: string) {
  const trimmed = line.trim().replace(/^[$\s]+|[$\s]+$/g, "");

  if (!trimmed) {
    return false;
  }

  if (/[\u4e00-\u9fff]/u.test(trimmed)) {
    return false;
  }

  if (/^(#{1,6}|\*|-|\d+\.)\s/u.test(trimmed)) {
    return false;
  }

  const hasMathSignal =
    LATEX_COMMAND_PATTERN.test(trimmed) ||
    /[∀∃∈ℝα-ωΑ-Ω∫∑∞≈≠≤≥±]/u.test(trimmed) ||
    /\b[A-Za-z]\w*\([^)\n]+\)\s*=/u.test(trimmed);

  const hasFormulaShape =
    /=/u.test(trimmed) ||
    /\\(?:forall|exists|frac|int|sum|sqrt)/u.test(trimmed);

  return hasMathSignal && hasFormulaShape;
}

function normalizeStandaloneFormulaLine(line: string) {
  const repaired = repairFormulaBody(line);

  if (!repaired) {
    return "";
  }

  if (repaired.startsWith("$$") && repaired.endsWith("$$")) {
    return repaired;
  }

  if (repaired.startsWith("$") && repaired.endsWith("$")) {
    return repaired;
  }

  return `$$${repaired}$$`;
}

function closeDanglingInlineFormula(line: string) {
  if (countUnescapedDollarSigns(line) % 2 === 0) {
    return line;
  }

  return line.replace(/(?<!\\)\$([^$\n]+)$/u, (match, candidate: string) => {
    if (!looksLikeInlineFormulaCandidate(candidate)) {
      return match;
    }

    return `$${repairFormulaBody(candidate)}$`;
  });
}

function normalizeLatexContent(content: string) {
  const normalizeFormulaCandidate = (candidate: string) =>
    candidate
      .replace(/\$/g, "")
      .replace(/∀/g, "\\forall ")
      .replace(/∃/g, "\\exists ")
      .replace(/∈/g, "\\in ")
      .replace(/ℝ/g, "\\mathbb{R}")
      .replace(/α\s*([0-9]+)/g, "\\alpha_$1")
      .replace(/β\s*([0-9]+)/g, "\\beta_$1")
      .replace(/γ\s*([0-9]+)/g, "\\gamma_$1")
      .replace(/θ\s*([0-9]+)/g, "\\theta_$1")
      .replace(/φ\s*([0-9]+)/g, "\\phi_$1")
      .replace(/ω\s*([0-9]+)/g, "\\omega_$1")
      .replace(/\\alpha\s*([0-9]+)/g, "\\alpha_$1")
      .replace(/\\beta\s*([0-9]+)/g, "\\beta_$1")
      .replace(/\\gamma\s*([0-9]+)/g, "\\gamma_$1")
      .replace(/\\theta\s*([0-9]+)/g, "\\theta_$1")
      .replace(/\\phi\s*([0-9]+)/g, "\\phi_$1")
      .replace(/\\omega\s*([0-9]+)/g, "\\omega_$1")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim();

  const normalized = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
    .replace(/([^\n]+)\$\$([^$\n]+?)\$\$/gu, (match, prefix: string, inner: string) => {
      if (!prefix.trim() || prefix.trim().endsWith("$")) return match;
      return `${prefix}$${inner.trim()}$`;
    })
    .replace(/\$([^$\n]+)\$\$/g, (_, inner: string) => `$${inner.trim()}$`)
    .replace(/\$\$([^$\n]+)\$/g, (_, inner: string) => `$${inner.trim()}$`)
    .replace(
      /(?<!\$)(\\(?:forall|exists)\s+\\?[A-Za-z]+(?:_[0-9A-Za-z{}]+)?(?:\s*,\s*\\?[A-Za-z]+(?:_[0-9A-Za-z{}]+)?)?\s+\\in\s+\\mathbb\{[A-Za-z]+\})(?!\$)/gu,
      (match) => `$${match.trim()}$`
    )
    .replace(
      /(?:\$+)?((?:\\forall|∀)[^。；;\n]*?(?:\\mathbb\{R\}|ℝ))\$*/gu,
      (_, candidate: string) => `$${normalizeFormulaCandidate(candidate)}$`
    );

  return normalized
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      // 修复大模型常见错误：行尾有孤立的 $$ 但行首没有对应的 $$
      // 例如："s(t) =\int_{-\infty}^{\infty} h(\theta) d\theta$$"
      // 先剥除行尾多余的 $$，再让 looksLikeStandaloneFormulaLine 正常识别
      const lineWithoutTrailingDollar = line
        .replace(/\$\$\s*$/, "")
        .replace(/\$\s*$/, "")
        .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
        .replace(/\$(?=\})/gu, "");

      if (looksLikeStandaloneFormulaLine(lineWithoutTrailingDollar)) {
        return normalizeStandaloneFormulaLine(lineWithoutTrailingDollar);
      }

      return closeDanglingInlineFormula(lineWithoutTrailingDollar).replace(
        /((?:[A-Za-z]\w*\([^)\n]+\)|[A-Za-z]\w*)\s*=\s*[^$\n]*?(?:\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log|alpha|beta|gamma|theta|phi|omega|mathbb)|[α-ωΑ-Ω∫∑∞])[^$\n]*)\$\$?$/gu,
        (_, candidate: string) => `$${repairFormulaBody(candidate)}$`
      );
    })
    .join("\n");
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
    const lines = processedContent.split(/\r?\n/);
    const gapClass = compact ? "space-y-1.5" : "space-y-2";
    const blankLineClass = compact ? "h-1.5" : "h-3";
    const lineWrapperClass = compact
      ? "[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0"
      : "rounded-lg px-2.5 py-1.5 transition-colors hover:bg-primary/5 [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0";

    return (
      <div className={`text-sm leading-relaxed text-foreground font-sans ${gapClass} [&_.math-display]:overflow-x-auto [&_.math-display]:py-1 [&_.math-display]:my-1 ${className}`}>
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
      ${compact ? "[&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&_li]:mb-0.5 [&_.math-display]:py-1.5 [&_.math-display]:my-1.5" : "[&>p]:mb-3 [&>ul]:mb-3 [&>ol]:mb-3 [&_li]:mb-1 [&_.math-display]:py-2 [&_.math-display]:my-2"}
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
      [&_.math-display]:overflow-x-auto
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
