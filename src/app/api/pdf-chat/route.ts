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
3. 所有数学公式使用 LaTeX 语法，行内公式用 $...$，独立公式用 $$...$$。
4. 回答要精炼、条理清晰、符合中国大学生的理解水平。
5. 不要重复用户的问题，直接给出解答。`;

const SUMMARY_PROMPT = `你是"智译西电"平台的课件摘要助手。请为以下外语课件文本生成一份简洁的中文章节摘要。

要求：
1. 输出每一页/章节的单行中文摘要（1-2 句话）
2. 格式为"第 X 页：摘要内容"
3. 只输出摘要列表，不要输出其他内容
4. 如果内容是数学公式或图表为主的页面，简要描述其主题`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
    const { pdfText, messages, action, deepMode } = body as {
      pdfText?: string;
      messages?: ChatMessage[];
      action?: "chat" | "summarize";
      deepMode?: boolean;
    };

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

      const summary = completion.choices[0]?.message?.content || "";
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

    const reply = completion.choices[0]?.message?.content || "抱歉，无法生成回复。";
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
