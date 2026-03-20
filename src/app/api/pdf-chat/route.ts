import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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
3. 所有数学公式必须使用规范 LaTeX 语法，行内公式用成对的 $...$，独立公式用成对的 $$...$$。
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

const SUMMARY_PROMPT = `你是"智译西电"平台的课件摘要助手。请为以下外语课件文本生成一份简洁、完整的中文全文摘要。

要求：
1. 只输出一份面向整本文档的整体摘要，不要逐页总结，不要输出“第 X 页：...”。
2. 用中文概括文档的主题、核心知识点、章节结构与主要公式/方法。
3. 优先帮助理工科学生快速抓住整篇文档的学习重点。
4. 如果文档中含有重要公式或模型，请用规范的成对 $...$ / $$...$$ 表示，不要裸输出 LaTeX 命令。
5. 输出可以使用简洁的小标题或分点，但必须保持为“全文摘要”，不能退化成页级列表。`;

const PDF_SCAN_CHAT_PROMPT = `你是"智译西电"平台的扫描版 PDF 文献解读助教。你将收到若干页扫描版 PDF 的页图，以及用户的问题。

你的工作：
1. 只根据提供的页图内容回答，不要假装理解整本文献。
2. 用简体中文回答，并适合理工科学生阅读。
3. 遇到公式、定理、电路、信号处理等内容时，做专业解释。
4. 所有数学公式必须使用规范 LaTeX 语法，行内公式用成对的 $...$，独立公式用成对的 $$...$$。
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

const PDF_LATEX_COMMAND_PATTERN =
  /\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log|forall|exists|infty|alpha|beta|gamma|theta|phi|omega|mathbb|mathrm|mathcal|operatorname|cdot|times|leq|geq|neq|to|rightarrow|left|right)\b/u;

function usesZhipuCompatibility() {
  return (process.env.OPENAI_BASE_URL || "").includes("open.bigmodel.cn");
}

function normalizeScanImageUrl(url: string) {
  if (usesZhipuCompatibility()) {
    return url.replace(/^data:[^;]+;base64,/i, "");
  }

  return url;
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

function sanitizePdfReplyMath(text: string) {
  const normalized = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$ $1 $$$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$")
    .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
    .replace(/\$(?=\})/gu, "")
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

  return normalized
    .split(/\r?\n/)
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
    const { pdfText, messages, action, deepMode, mode, pageImages, pageNumbers } = body as {
      pdfText?: string;
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
      return NextResponse.json({ reply });
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
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
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
