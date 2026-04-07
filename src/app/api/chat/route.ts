import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * /api/chat — AI 助教对话 API
 *
 * 支持多轮对话，自动注入翻译/解析上下文，
 * 让学生可以针对刚才的翻译结果继续追问。
 *
 * 请求体 (JSON)：
 *   {
 *     messages: Array<{ role: "user" | "assistant", content: string }>,
 *     context?: {
 *       originalText?: string,   // 用户原始输入的外文
 *       translation?: string,    // 翻译结果
 *       analysis?: string,       // 名词解析结果
 *     }
 *   }
 */

const CHAT_SYSTEM_PROMPT = `你是「智译西电 AI 助教」，一位精通法语、英语以及西安电子科技大学（西电）理工科专业知识的资深助教。

你正在帮助中外合作办学的学生理解外文教材。在对话开始前，系统可能会向你提供用户刚刚翻译过的教材内容及其解析结果作为上下文。

你的职责：
- 用通俗易懂的语言为学生答疑解惑
- 如果学生的问题和之前翻译的内容相关，结合上下文回答
- 可以举生动的例子帮助学生理解抽象概念
- 对于数学公式，用直觉化的语言解释物理意义
- 回答要简洁精炼，避免冗余

请用中文回答。如果涉及专业术语，附上英文/法文原文。`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

const LATEX_COMMAND_PATTERN =
  /\\(?:frac|int|lim|sum|sqrt|sin|cos|tan|ln|log|pi|nu|forall|exists|infty|alpha|beta|gamma|theta|phi|omega|mathbb|mathrm|mathcal|operatorname|cdot|times|leq|geq|neq|to|rightarrow|left|right)\b/u;

function countUnescapedDollarSigns(text: string) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i - 1] !== "\\") count++;
  }
  return count;
}

function repairFormulaBody(candidate: string) {
  return candidate
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\{2,}(?=[A-Za-z])/gu, "\\")
    .replace(/\\+\$/gu, "$")
    .replace(/\$\$/g, "")
    .replace(/^[$\s]+|[$\s]+$/g, "")
    .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
    .replace(/\$(?=\})/gu, "")
    .replace(/∀/g, "\\forall ")
    .replace(/∃/g, "\\exists ")
    .replace(/∈/g, "\\in ")
    .replace(/ℝ/g, "\\mathbb{R}")
    .replace(/(^|[^\\])frac(?=\s*\{)/gu, "$1\\frac")
    .replace(/(^|[^\\])int(?=\s*[_{])/gu, "$1\\int")
    .replace(/(^|[^\\])sum(?=\s*[_{])/gu, "$1\\sum")
    .replace(/(^|[^\\])sqrt(?=\s*[\\[{])/gu, "$1\\sqrt")
    .replace(/(^|[\\s(,])sin(?=\s*[\\[(\\\\])/gu, "$1\\sin")
    .replace(/(^|[\\s(,])cos(?=\s*[\\[(\\\\])/gu, "$1\\cos")
    .replace(/(^|[\\s(,])tan(?=\s*[\\[(\\\\])/gu, "$1\\tan")
    .replace(/(^|[\\s(,])ln(?=\s*[\\[(\\\\])/gu, "$1\\ln")
    .replace(/(^|[\\s(,])log(?=\s*[\\[(\\\\])/gu, "$1\\log")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeInlineFormula(candidate: string) {
  const trimmed = repairFormulaBody(candidate);
  if (!trimmed || /[\u4e00-\u9fff]/u.test(trimmed)) return false;
  return (
    LATEX_COMMAND_PATTERN.test(trimmed) ||
    /[=^_{}|]/u.test(trimmed) ||
    /[∀∃∈ℝα-ωΑ-Ω∫∑∞≈≠≤≥±]/u.test(trimmed) ||
    /\b[A-Za-z]\w*\([^)\n]+\)/u.test(trimmed)
  );
}

function sanitizeChatReplyMath(text: string) {
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
    .replace(/\$([^$\n]+)\$\$/g, (_: string, inner: string) => `$${inner.trim()}$`)
    .replace(/\$\$([^$\n]+)\$/g, (_: string, inner: string) => `$${inner.trim()}$`)
    .replace(
      /([：:]\s*)\$\$?([^$\n]+?)(?=(?:\n|$))/gu,
      (_: string, prefix: string, formula: string) => {
        if (!looksLikeInlineFormula(formula)) return `${prefix}${formula}`;
        return `${prefix}$${repairFormulaBody(formula)}$`;
      }
    )
    .replace(
      /([：:]\s*)((?:\\(?:int|frac|lim|sum|sqrt|sin|cos|tan|ln|log|alpha|beta|gamma|theta|phi|omega|mathbb)|[∀∃∈ℝα-ωΑ-Ω∫∑∞]).*)$/gmu,
      (_: string, prefix: string, formula: string) => {
        if (!looksLikeInlineFormula(formula)) return `${prefix}${formula}`;
        return `${prefix}$${repairFormulaBody(formula)}$`;
      }
    );

  return normalized
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      const cleaned = line
        .replace(/\$\$\s*$/, "")
        .replace(/\$\s*$/, "")
        .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
        .replace(/\$(?=\})/gu, "");
      if (countUnescapedDollarSigns(cleaned) % 2 === 1) {
        return cleaned.replace(/(?<!\\)\$([^$\n]+)$/u, (match, candidate: string) => {
          if (!looksLikeInlineFormula(candidate)) return match;
          return `$${repairFormulaBody(candidate)}$`;
        });
      }
      return cleaned;
    })
    .join("\n");
}

const CHAT_FLASH_MODEL =
  process.env.OPENAI_MODEL_FLASH ||
  process.env.OPENAI_MODEL ||
  "gpt-4o";
const CHAT_PRO_MODEL =
  process.env.OPENAI_MODEL_PRO ||
  process.env.OPENAI_MODEL ||
  "gpt-4o";

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
    const { messages, context } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: {
        originalText?: string;
        translation?: string;
        analysis?: string;
      };
      deepMode?: boolean;
    };
    const deepMode = Boolean((body as { deepMode?: boolean }).deepMode);

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "消息不能为空" },
        { status: 400 }
      );
    }

    // --- 构建系统消息：注入翻译上下文 ---
    let systemContent = CHAT_SYSTEM_PROMPT;

    if (context && (context.originalText || context.translation || context.analysis)) {
      systemContent += "\n\n--- 以下是用户刚才翻译的教材内容，供你参考 ---\n";

      if (context.originalText) {
        systemContent += `\n【原文】\n${context.originalText}\n`;
      }
      if (context.translation) {
        systemContent += `\n【翻译结果】\n${context.translation}\n`;
      }
      if (context.analysis) {
        systemContent += `\n【名词解析与公式推导】\n${context.analysis}\n`;
      }

      systemContent += "\n--- 上下文结束 ---";
    }

    // --- 构建完整的 messages 数组 ---
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    console.log(
      `[Chat] 发起对话请求 — 消息数: ${messages.length}, 有上下文: ${!!context}, 深度模式: ${deepMode ? "on" : "off"}`
    );

    // --- 调用大模型 ---
    const completion = await openai.chat.completions.create({
      model: deepMode ? CHAT_PRO_MODEL : CHAT_FLASH_MODEL,
      messages: apiMessages,
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      throw new Error("AI 助教返回了空响应");
    }

    console.log(
      `[Chat] 回复完成 — Token 用量: ${completion.usage?.total_tokens || "未知"}`
    );

    return NextResponse.json({ reply: sanitizeChatReplyMath(reply) });
  } catch (error) {
    console.error("[Chat] 对话请求失败:", error);

    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: "API Key 无效" },
          { status: 401 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: "请求过于频繁，请稍后再试" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `AI 助教暂时不可用: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 500 }
    );
  }
}
