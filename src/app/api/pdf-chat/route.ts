import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { formatPageReferences } from "@/lib/notebookInsights";

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || "180000");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const FLASH_MODEL = process.env.OPENAI_MODEL_FLASH || DEFAULT_MODEL;
const PRO_MODEL = process.env.OPENAI_MODEL_PRO || DEFAULT_MODEL;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  timeout: OPENAI_TIMEOUT_MS,
});

const PDF_SYSTEM_PROMPT = `你是"智译西电"平台的理工科 PDF 文献解读助教。你会收到一篇完整的外语（法语/英语）课件或教材的全文文本。

你的工作：
1. 用简体中文回答用户对该文献的任何追问。
2. 对公式、定理、电路、信号处理等理工科内容做专业级讲解。
3. 所有数学公式、变量、函数表达式（如 P_x(t)、x(t)）、物理量符号都必须使用规范 LaTeX 语法包裹。行内公式用成对的 $...$，独立公式用成对的 $$...$$。绝对禁止裸写即使是最简单的数学变量。
4. 任何包含 \\int、\\frac、\\sum、\\sqrt、\\sin、\\cos、\\tan、\\alpha、\\beta、\\gamma、\\theta、\\phi、\\omega、\\mathbb 等命令的内容，绝对不能裸输出。
5. 不允许输出不成对的 $ 或 $$；如果某个公式开始使用了 $ 或 $$，必须正确闭合。
6. 回答要精炼、条理清晰、符合中国大学生的理解水平。
7. 不要重复用户的问题，直接给出解答。
8. 在输出最终答案前先自检：
   - 是否存在裸露的 LaTeX 命令；
   - 是否存在不成对的 $ 或 $$；
   - 是否把整行公式误写成普通文本；
   - 是否出现“标签 + 半截公式”的坏格式，例如“总能量：$E_x...”或“平均功率：$$P_x...”。
   如果存在，必须先修正再输出。`;

const PDF_PAGE_CHAT_PROMPT = `你是"智译西电"平台的理工科 PDF 文献解读助教。你会收到若干个与当前问题最相关的 PDF 候选页文本。

你的工作：
1. 只基于提供的候选页内容回答当前问题，不要假装读过整本文献。
2. 如果候选页信息不足，可以明确说明“当前候选页信息有限”，但不要编造不存在的内容或页码。
3. 用简体中文回答，保持精炼、条理清晰，适合理工科学生理解。
4. 对公式、定理、电路、信号处理等理工科内容做专业级讲解。
5. 所有数学公式、变量、函数表达式都必须使用规范 LaTeX 语法包裹。行内公式用成对的 $...$，独立公式用成对的 $$...$$。绝对禁止裸写公式。
6. 不允许输出不成对的 $ 或 $$；如果某个公式开始使用了 $ 或 $$，必须正确闭合。
7. 不要在正文里自行声明页码引用，系统会在回答后统一追加参考页码。
8. 不要重复用户问题，直接给出解答。
9. 输出前先自检：是否存在裸露的 LaTeX 命令、是否存在不成对的数学分隔符、是否出现“标签 + 半截公式”的坏格式，如果有必须先修正。`;

const SUMMARY_PROMPT = `你是"智译西电"平台的课件摘要助手。请为以下外语课件文本生成一份简洁、完整的中文全文摘要。

要求：
1. 只输出一份面向整本文档的整体摘要，不要逐页总结，不要输出“第 X 页：...”。
2. 用中文概括文档的主题、核心知识点、章节结构与主要公式/方法。
3. 优先帮助理工科学生快速抓住整篇文档的学习重点。
4. 即使是最简单的公式、数学变量（如 P_x(t)），也必须用规范的成对 $...$ / $$...$$ 表示，不要裸输出。如果文档中含有重要公式或模型，独立占行使用 $$...$$。
5. 输出可以使用简洁的小标题或分点，但必须保持为“全文摘要”，不能退化成页级列表。`;

const PDF_SCAN_CHAT_PROMPT = `你是"智译西电"平台的扫描版 PDF 文献解读助教。你将收到若干页扫描版 PDF 的页图，以及用户的问题。

你的工作：
1. 只根据提供的页图内容回答，不要假装理解整本文献。
2. 用简体中文回答，并适合理工科学生阅读。
3. 遇到公式、定理、电路、信号处理等内容时，做专业解释。
4. 所有数学公式、单独的代数变量、函数表达式（例如 P_x(t)）必须使用规范 LaTeX 语法，行内用成对的 $...$，独立公式用成对的 $$...$$。坚决禁止裸写公式。
5. 任何包含 \\int、\\frac、\\sum、\\sqrt、\\sin、\\cos、\\tan、\\alpha、\\beta、\\gamma、\\theta、\\phi、\\omega、\\mathbb 等命令的内容，绝对不能裸输出。
6. 不允许输出不成对的 $ 或 $$；如果公式开始使用了 $ 或 $$，必须正确闭合。
7. 如果用户的问题超出当前页或当前页码范围，请明确说明需要用户切换页码范围。
8. 不要重复用户问题，直接回答。
9. 在输出前先自检是否存在裸露的 LaTeX 命令或不成对的数学分隔符，若有必须先修正。
10. 特别注意列表项中的公式，禁止出现“瞬时功率：$P_x...”“定义：$$X(ω)...”这类半截公式。`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RankedPdfPage {
  pageNumber: number;
  content: string;
  score: number;
}

const PDF_LATEX_COMMAND_PATTERN =
  /\\(?:frac|int|lim|sum|sqrt|sin|cos|tan|ln|log|pi|nu|forall|exists|infty|alpha|beta|gamma|theta|phi|omega|mathbb|mathrm|mathcal|operatorname|cdot|times|leq|geq|neq|to|rightarrow|left|right)\b/u;
const PDF_QUERY_STOPWORDS = new Set([
  "请问",
  "请帮我",
  "帮我",
  "解释",
  "说明",
  "分析",
  "总结",
  "一下",
  "什么",
  "为什么",
  "怎么",
  "如何",
  "这个",
  "那个",
  "这些",
  "那些",
  "关于",
  "以及",
  "可以",
  "一下子",
  "问题",
  "内容",
  "文中",
  "文献",
  "课件",
  "教材",
  "一下吗",
  "please",
  "explain",
  "about",
  "what",
  "why",
  "how",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
]);

function usesZhipuCompatibility() {
  return (process.env.OPENAI_BASE_URL || "").includes("open.bigmodel.cn");
}

function normalizeScanImageUrl(url: string) {
  if (usesZhipuCompatibility()) {
    return url.replace(/^data:[^;]+;base64,/i, "");
  }

  return url;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCompactSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function countOccurrences(source: string, keyword: string) {
  if (!source || !keyword) {
    return 0;
  }

  let count = 0;
  let searchStart = 0;

  while (searchStart < source.length) {
    const index = source.indexOf(keyword, searchStart);
    if (index === -1) {
      break;
    }

    count += 1;
    searchStart = index + keyword.length;
  }

  return count;
}

function extractQuestionKeywords(question: string) {
  const normalized = normalizeSearchText(question);
  const chineseTerms = normalized.match(/[\u4e00-\u9fff]{2,}/gu) ?? [];
  const latinTerms = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/gu) ?? [];

  return Array.from(new Set([...chineseTerms, ...latinTerms])).filter(
    (term) => !PDF_QUERY_STOPWORDS.has(term)
  );
}

function truncatePageContent(value: string, maxLength = 1800) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function rankRelevantPdfPages(question: string, pdfPages: string[]) {
  const normalizedQuestion = normalizeSearchText(question);
  const compactQuestion = normalizeCompactSearchText(question);
  const keywords = extractQuestionKeywords(question);

  if (!normalizedQuestion || keywords.length === 0) {
    return [] as RankedPdfPage[];
  }

  return pdfPages
    .map((content, index) => {
      const normalizedPage = normalizeSearchText(content);
      const compactPage = normalizeCompactSearchText(content);

      if (!normalizedPage) {
        return null;
      }

      let distinctHits = 0;
      let totalHits = 0;

      for (const keyword of keywords) {
        const hits = countOccurrences(normalizedPage, keyword);
        if (hits > 0) {
          distinctHits += 1;
          totalHits += hits;
        }
      }

      let score = distinctHits + totalHits;

      if (
        normalizedQuestion.length >= 6 &&
        normalizedPage.includes(normalizedQuestion)
      ) {
        score += 4;
      }

      if (
        compactQuestion.length >= 6 &&
        compactPage.includes(compactQuestion)
      ) {
        score += 4;
      }

      if (score <= 0) {
        return null;
      }

      return {
        pageNumber: index + 1,
        content: truncatePageContent(content),
        score,
      } satisfies RankedPdfPage;
    })
    .filter((item): item is RankedPdfPage => item !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.pageNumber - right.pageNumber;
    })
    .slice(0, 3);
}

function appendPageReferences(reply: string, pageNumbers: number[]) {
  const reference = formatPageReferences(pageNumbers);
  if (!reference) {
    return reply;
  }

  return `${reply.trimEnd()}\n\n${reference}`;
}

function countUnescapedDollarSigns(text: string) {
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "$" && text[index - 1] !== "\\") {
      count += 1;
    }
  }

  return count;
}

function repairPdfFormulaBody(candidate: string) {
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

function looksLikePdfInlineFormula(candidate: string) {
  const trimmed = repairPdfFormulaBody(candidate);

  if (!trimmed || /[\u4e00-\u9fff]/u.test(trimmed)) {
    return false;
  }

  return (
    PDF_LATEX_COMMAND_PATTERN.test(trimmed) ||
    /[=^_{}|]/u.test(trimmed) ||
    /[∀∃∈ℝα-ωΑ-Ω∫∑∞≈≠≤≥±]/u.test(trimmed) ||
    /\b[A-Za-z]\w*\([^)\n]+\)/u.test(trimmed)
  );
}

function normalizePdfLabelPrefixedFormulaLine(line: string) {
  const formulaWithDelimiters = line.match(/^(\s*.*[：:])\s*\$\$?([^$\n]+?)\$\$?\s*$/u);
  if (formulaWithDelimiters) {
    const [, prefix, candidate] = formulaWithDelimiters;
    if (looksLikePdfInlineFormula(candidate)) {
      return `${prefix} $${repairPdfFormulaBody(candidate)}$`;
    }
  }

  const bareFormulaAfterLabel = line.match(/^(\s*.*[：:])\s*((?:\\[A-Za-z]+|[A-Za-z]\w*\([^)\n]+\)|[∀∃∈ℝα-ωΑ-Ω∫∑∞≈≠≤≥±]).*)$/u);
  if (bareFormulaAfterLabel) {
    const [, prefix, candidate] = bareFormulaAfterLabel;
    if (looksLikePdfInlineFormula(candidate)) {
      return `${prefix} $${repairPdfFormulaBody(candidate)}$`;
    }
  }

  return line;
}

function looksLikePdfFormulaContinuationLine(line: string) {
  const trimmed = line.trim().replace(/^[$\s]+|[$\s]+$/g, "");

  if (!trimmed) {
    return false;
  }

  if (/^(#{1,6}|\*|-|\d+\.)\s/u.test(trimmed)) {
    return false;
  }

  if (/^[\u4e00-\u9fff].*[：:]/u.test(trimmed)) {
    return false;
  }

  return (
    looksLikePdfInlineFormula(trimmed) ||
    /^(?:\\[A-Za-z]+|[A-Za-z]\w*\([^)\n]+\)|[=^_{}|()[\]/+\-])/u.test(trimmed)
  );
}

function normalizePdfLabelPrefixedFormulaLines(lines: string[]) {
  const normalizedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      normalizedLines.push(line);
      continue;
    }

    const normalizedSingleLine = normalizePdfLabelPrefixedFormulaLine(line);
    if (normalizedSingleLine !== line) {
      normalizedLines.push(normalizedSingleLine);
      continue;
    }

    const startMatch = line.match(/^(\s*.*[：:])\s*\$\$?\s*([^$\n]*)$/u);
    if (!startMatch) {
      normalizedLines.push(line);
      continue;
    }

    const [, prefix, firstChunk] = startMatch;
    const chunks = [firstChunk.trim()];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const nextLine = lines[cursor];

      if (!nextLine.trim()) {
        break;
      }

      if (!looksLikePdfFormulaContinuationLine(nextLine)) {
        break;
      }

      chunks.push(nextLine.trim());

      if (/\$\$?\s*$/.test(nextLine.trim())) {
        cursor += 1;
        break;
      }

      cursor += 1;
    }

    const candidate = chunks.join(" ").replace(/^[$\s]+|[$\s]+$/g, "");
    if (!candidate || !looksLikePdfInlineFormula(candidate)) {
      normalizedLines.push(line);
      continue;
    }

    normalizedLines.push(`${prefix} $${repairPdfFormulaBody(candidate)}$`);
    index = cursor - 1;
  }

  return normalizedLines;
}

function sanitizePdfReplyMath(text: string) {
  const normalized = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$ $1 $$$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$")
    .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
    .replace(/\$(?=\})/gu, "")
    .replace(/([^\n]+)\$\$([^$\n]+?)\$\$/gu, (match, prefix: string, inner: string) => {
      if (!prefix.trim() || prefix.trim().endsWith("$")) return match;
      return `${prefix}$${inner.trim()}$`;
    })
    .replace(/\$([^$\n]+)\$\$/g, (_, inner: string) => `$${inner.trim()}$`)
    .replace(/\$\$([^$\n]+)\$/g, (_, inner: string) => `$${inner.trim()}$`)
    .replace(
      /([：:]\s*)\$\$?([^$\n]+?)(?=(?:\n|$))/gu,
      (_, prefix: string, formula: string) => {
        if (!looksLikePdfInlineFormula(formula)) {
          return `${prefix}${formula}`;
        }

        return `${prefix}$${repairPdfFormulaBody(formula)}$`;
      }
    )
    .replace(
      /([：:]\s*)((?:\\(?:int|frac|lim|sum|sqrt|sin|cos|tan|ln|log|alpha|beta|gamma|theta|phi|omega|mathbb)|[∀∃∈ℝα-ωΑ-Ω∫∑∞]).*)$/gmu,
      (_, prefix: string, formula: string) => {
        if (!looksLikePdfInlineFormula(formula)) {
          return `${prefix}${formula}`;
        }

        return `${prefix}$${repairPdfFormulaBody(formula)}$`;
      }
    );

  return normalizePdfLabelPrefixedFormulaLines(normalized.split(/\r?\n/))
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      const lineWithoutTrailingDollar = line
        .replace(/\$\$\s*$/, "")
        .replace(/\$\s*$/, "")
        .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
        .replace(/\$(?=\})/gu, "");

      const wrappedInline = countUnescapedDollarSigns(lineWithoutTrailingDollar) % 2 === 1
        ? lineWithoutTrailingDollar.replace(/(?<!\\)\$([^$\n]+)$/u, (match, candidate: string) => {
            if (!looksLikePdfInlineFormula(candidate)) {
              return match;
            }

            return `$${repairPdfFormulaBody(candidate)}$`;
          })
        : lineWithoutTrailingDollar;

      return wrappedInline.replace(
        /((?:[A-Za-z]\w*\([^)\n]+\)|[A-Za-z]\w*)\s*=\s*[^$\n]*?(?:\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log|alpha|beta|gamma|theta|phi|omega|mathbb)|[α-ωΑ-Ω∫∑∞])[^$\n]*)$/gu,
        (_, candidate: string) => {
          if (!looksLikePdfInlineFormula(candidate)) {
            return candidate;
          }

          return `$${repairPdfFormulaBody(candidate)}$`;
        }
      );
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "在此填入你的API Key"
    ) {
      return NextResponse.json(
        { error: "尚未配置 API Key" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { pdfText, pdfPages, messages, action, deepMode, mode, pageImages, pageNumbers } = body as {
      pdfText?: string;
      pdfPages?: string[];
      messages?: ChatMessage[];
      action?: "chat" | "summarize";
      deepMode?: boolean;
      mode?: "text" | "scan_pages";
      pageImages?: string[];
      pageNumbers?: number[];
    };

    if (mode === "scan_pages") {
      if (!messages || messages.length === 0) {
        return NextResponse.json(
          { error: "缺少扫描版 PDF 的对话消息" },
          { status: 400 }
        );
      }

      if (!Array.isArray(pageImages) || pageImages.length === 0) {
        return NextResponse.json(
          { error: "缺少扫描版 PDF 页图" },
          { status: 400 }
        );
      }

      const model = deepMode ? PRO_MODEL : FLASH_MODEL;
      const pageLabel =
        Array.isArray(pageNumbers) && pageNumbers.length > 0
          ? `第 ${pageNumbers[0]}${pageNumbers.length > 1 ? `-${pageNumbers[pageNumbers.length - 1]}` : ""} 页`
          : "当前页范围";

      const scanMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: PDF_SCAN_CHAT_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `以下是扫描版 PDF 的 ${pageLabel} 页图。请只基于这些页的内容回答后续问题，不要假装阅读过整本文献。`,
            },
            ...pageImages.map((imageUrl) => ({
              type: "image_url" as const,
              image_url: { url: normalizeScanImageUrl(imageUrl) },
            })),
          ],
        },
        {
          role: "assistant",
          content: `我已加载 ${pageLabel} 的页图，请围绕这些页面内容提问。`,
        },
        ...messages.map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages: scanMessages,
        temperature: 0.3,
      });

      const reply = sanitizePdfReplyMath(
        completion.choices[0]?.message?.content || "抱歉，无法生成回复。"
      );
      return NextResponse.json({
        reply: appendPageReferences(reply, pageNumbers || []),
      });
    }

    if (!pdfText) {
      return NextResponse.json(
        { error: "缺少 PDF 文本内容" },
        { status: 400 }
      );
    }

    const model = deepMode ? PRO_MODEL : FLASH_MODEL;

    // Truncate PDF text to avoid token limits (approx ~60k chars ≈ ~15k tokens)
    const truncatedText =
      pdfText.length > 60000
        ? pdfText.slice(0, 60000) + "\n\n[... 内容过长，已截断 ...]"
        : pdfText;

    if (action === "summarize") {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          {
            role: "user",
            content: truncatedText,
          },
        ],
        temperature: 0.2,
      });

      const summary = sanitizePdfReplyMath(
        completion.choices[0]?.message?.content || ""
      );
      return NextResponse.json({ summary });
    }

    // Default: chat mode
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "缺少对话消息" },
        { status: 400 }
      );
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const rankedPages =
      latestUserMessage && Array.isArray(pdfPages) && pdfPages.length > 0
        ? rankRelevantPdfPages(latestUserMessage.content, pdfPages)
        : [];

    if (rankedPages.length > 0) {
      const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: PDF_PAGE_CHAT_PROMPT },
        {
          role: "user",
          content: `以下是与当前问题最相关的候选页内容，请只基于这些页面回答：\n\n${rankedPages
            .map((page) => `第 ${page.pageNumber} 页：\n${page.content}`)
            .join("\n\n")}`,
        },
        {
          role: "assistant",
          content:
            "我已加载候选页内容，会严格基于这些页面回答；如果信息不足，我会明确说明。",
        },
        ...messages.map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages: chatMessages,
        temperature: 0.3,
      });

      const reply = sanitizePdfReplyMath(
        completion.choices[0]?.message?.content || "抱歉，无法生成回复。"
      );

      return NextResponse.json({
        reply: appendPageReferences(
          reply,
          rankedPages.map((page) => page.pageNumber)
        ),
      });
    }

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: PDF_SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是要解读的文献全文：\n\n${truncatedText}`,
      },
      {
        role: "assistant",
        content:
          "我已仔细阅读了这篇文献的全部内容。请你就其中任何部分提问。",
      },
      ...messages.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: 0.3,
    });

    const reply = sanitizePdfReplyMath(
      completion.choices[0]?.message?.content || "抱歉，无法生成回复。"
    );
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[PDF-Chat] Error:", error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `API 错误: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `服务异常: ${error.message}`
            : "服务器内部错误",
      },
      { status: 500 }
    );
  }
}
