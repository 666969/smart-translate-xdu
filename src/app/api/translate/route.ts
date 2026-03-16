import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface DocumentQuizItem {
  question_fr: string;
  question_zh: string;
  question_en: string;
  options_fr: string[];
  options_zh: string[];
  options_en: string[];
  answer_fr: string;
  answer_zh: string;
  answer_en: string;
  answer?: string;
  explanation_fr?: string;
  explanation_zh?: string;
  explanation_en?: string;
  explanation?: string;
}

interface SnippetKeywordItem {
  term_fr: string;
  term_zh: string;
  definition_zh: string;
}

type SnippetOverlayAlign = "left" | "center" | "right";

interface SnippetOverlayBlock {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  align: SnippetOverlayAlign;
}

interface SnippetResponse {
  translation: string;
  analysis: string;
  keywords: string;
  keyword_items: SnippetKeywordItem[];
  overlay_blocks: SnippetOverlayBlock[];
}

interface DocumentResponse {
  mermaid: string;
  quiz: DocumentQuizItem[];
}

interface ValidateSnippetOptions {
  requireAnalysis?: boolean;
}

type UserContent =
  | string
  | OpenAI.Chat.Completions.ChatCompletionContentPart[];

const STRICT_JSON_PREFIX = `你是一个无情的、顶级的理工科翻译专家。
【最高指令】：除必要的数学公式和原专有名词外，所有输出的文本内容（包括翻译和解析）必须、绝对、强制使用简体中文！ 不要输出任何废话，只输出合法的 JSON 数据。
禁止输出 Markdown 代码块、解释性前后缀、注释、标题、寒暄、道歉，禁止输出任何 JSON 之外的文本。`;

const SNIPPET_KEYWORD_LINE_PATTERN = /^[^:\n()]+ \([^)]+\) : .+$/u;
const FRENCH_TERM_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç' -]+$/u;
const FRENCH_STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "ou", "est",
  "sont", "dans", "par", "pour", "avec", "sur", "sous", "au", "aux", "en",
  "suivant", "suivante", "defini", "definie", "definis", "definies",
  "presente", "presentes", "cours",
]);
const ENGLISH_TO_FRENCH_KEYWORD_MAP: Record<string, string> = {
  "differential system": "systeme differentiel",
  system: "systeme",
  integral: "integrale",
  constant: "constante",
  function: "fonction",
  "f(t)": "fonction",
  f: "fonction",
  signal: "signal",
  "linear system": "systeme lineaire",
  "linear systems": "systemes lineaires",
  equation: "equation",
  "differential equation": "equation differentielle",
  matrix: "matrice",
  vector: "vecteur",
  derivative: "derivee",
  frequency: "frequence",
  phase: "phase",
  amplitude: "amplitude",
  variable: "variable",
  alpha: "alpha",
  beta: "beta",
};
const TERM_TO_CHINESE_LABEL_MAP: Record<string, string> = {
  "differential system": "微分系统",
  system: "系统",
  integral: "积分",
  constant: "常数",
  function: "函数",
  "f(t)": "函数",
  f: "函数",
  signal: "信号",
  "linear system": "线性系统",
  "linear systems": "线性系统",
  equation: "方程",
  "differential equation": "微分方程",
  matrix: "矩阵",
  vector: "向量",
  derivative: "导数",
  frequency: "频率",
  phase: "相位",
  amplitude: "振幅",
  variable: "变量",
  alpha: "阿尔法",
  beta: "贝塔",
};

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || "180000");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const FLASH_MODEL = process.env.OPENAI_MODEL_FLASH || DEFAULT_MODEL;
const PRO_MODEL = process.env.OPENAI_MODEL_PRO || DEFAULT_MODEL;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  timeout: OPENAI_TIMEOUT_MS,
});

function usesGeminiOpenAICompatibility() {
  return (process.env.OPENAI_BASE_URL || "").includes(
    "generativelanguage.googleapis.com"
  );
}

function usesZhipuCompatibility() {
  return (process.env.OPENAI_BASE_URL || "").includes("open.bigmodel.cn");
}

function hasImageInMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) {
  return messages.some((message) => {
    const content = message.content;
    if (!Array.isArray(content)) {
      return false;
    }

    return content.some(
      (part) => part.type === "image_url"
    );
  });
}

function buildImageUrlPayload(file: File, base64: string) {
  if (usesZhipuCompatibility()) {
    return base64;
  }

  const mimeType = file.type || "image/png";
  return `data:${mimeType};base64,${base64}`;
}

function getLiveSystemPrompt() {
  return `你是一位顶级同声传译员。请将下面输入的英语或法语语音文本实时翻译成中文。
要求：
1. 只返回最准确、最自然的中文翻译结果。
2. 绝对不要包含任何原理解析、关键词、或者模块标题。
  3. 保持极低的延迟风格，遇到专业学术词汇，请凭借电子工程领域知识进行精准翻译。直接输出译文文本。`;
}

function getSnippetTranslationSystemPrompt(hasImageInput: boolean) {
  return `${STRICT_JSON_PREFIX}

你正在执行完整的 Snippet（片段速译）任务。
你必须返回且只能返回一个合法 JSON 对象，结构如下：
{
  "translation": "...",
  "analysis": "...",
  "keywords": "...",
  "keyword_items": [
    {
      "term_fr": "...",
      "term_zh": "...",
      "definition_zh": "..."
    }
  ],
  "overlay_blocks": [
    {
      "id": "block-1",
      "x": 120,
      "y": 180,
      "width": 680,
      "height": 96,
      "text": "...",
      "align": "left"
    }
  ]
}

硬性规则：
1. "translation" 必须是完整中文翻译文本，保持原图的段落、换行、层级、编号、列表和公式顺序。
2. 你只翻译自然语言文本。对于公式、变量、函数名、微积分表达式、矩阵、向量、图号、元件符号、电路图图形、坐标轴、波形、表格线和纯符号结构，请不要改写成中文句子。
3. 所有数学公式、数学符号、变量、上下标、希腊字母、积分、微分、极限、求和、向量、矩阵、不等式等内容，必须严格使用 LaTeX 语法包裹。行内公式必须使用单个 $...$，独立公式必须使用 $$...$$。
4. "analysis" 必须是纯中文深度解析，要解释核心原理、逻辑关系、公式含义与适用场景；禁止输出法语整句，禁止空话套话。
5. "keyword_items" 必须严格输出 3 到 5 个对象。每个对象必须采用 {"term_fr":"法语词汇","term_zh":"中文解释","definition_zh":"中文定义"} 结构。
6. "keywords" 必须是 "keyword_items" 的逐行串联结果，格式严格为：法语词汇 (中文解释) : 具体的中文定义。不要编号，不要项目符号。
7. ${hasImageInput
    ? `"overlay_blocks" 必须基于原图的 1000x1000 归一化坐标系输出，只覆盖需要翻译的自然语言文本区域。x、y、width、height 都必须是 0 到 1000 的整数。不要覆盖纯公式、纯图形、电路图元件、坐标轴或非自然语言结构。`
    : `"overlay_blocks" 必须返回空数组 []。`}
8. 如果一个文本区域里既有自然语言又有公式，请尽量只覆盖自然语言部分，保留公式在底图中继续可见。
9. "overlay_blocks" 的 "text" 字段必须是简体中文，允许夹带 LaTeX 公式；"align" 只能是 left、center、right 之一。
10. 不要输出任何 JSON 之外的内容。`;
}

function getDocumentSystemPrompt() {
  return `${STRICT_JSON_PREFIX}

你现在正在执行完整的 Document（课件精读）任务。
你必须返回且只能返回以下 JSON：
{
  "mermaid": "flowchart TD\\nA[\\"...\\" ] --> B[\\"...\\"]",
  "quiz": [
    {
      "question_fr": "...",
      "question_zh": "...",
      "question_en": "...",
      "options_fr": ["...", "...", "...", "..."],
      "options_zh": ["...", "...", "...", "..."],
      "options_en": ["...", "...", "...", "..."],
      "answer": "...",
      "answer_fr": "...",
      "answer_zh": "...",
      "answer_en": "..."
    }
  ]
}

硬性规则：
1. mermaid 必须可以被前端直接渲染，推荐使用 flowchart TD。
2. 节点文本如果包含括号、加号、减号、等号、积分号、希腊字母、箭头、冒号、分号、上下标、分数、绝对值符号或任何非字母数字的特殊字符，必须使用双引号包裹，例如 A["s(t) = sin(e(t))"]。
3. mermaid 字段中绝对不要包含 \`\`\`mermaid、\`\`\` 或任何代码块标记，节点说明文字必须用简体中文。
4. quiz 必须严格返回 3 道单选题。
5. 每道题必须严格采用 {"question_fr":"...","question_zh":"...","question_en":"...","options_fr":["...","...","...","..."],"options_zh":["...","...","...","..."],"options_en":["...","...","...","..."],"answer":"...","answer_fr":"...","answer_zh":"...","answer_en":"..."} 结构。
6. question_fr、question_zh、question_en 必须分别用法语、简体中文、英文表达同一道题，三者语义必须完全对应。
7. options_fr、options_zh、options_en 必须一一对应、顺序一致，并且每题必须恰好 4 个选项。
8. answer、answer_fr、answer_zh、answer_en 不允许填写 A/B/C/D 字母，必须填写该题正确选项对应的完整具体内容，并与三组 options 中的同一位置选项语义一致。
9. 题目必须围绕课件核心知识点，三语内容都要准确自然。
10. 不要输出任何 JSON 之外的内容。`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildJsonErrorContext(value: string, error: unknown) {
  if (!(error instanceof Error)) {
    return "";
  }

  const match = error.message.match(/position (\d+)/i);
  if (!match) {
    return "";
  }

  const position = Number(match[1]);
  if (!Number.isFinite(position)) {
    return "";
  }

  const start = Math.max(0, position - 80);
  const end = Math.min(value.length, position + 80);
  return value
    .slice(start, end)
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function repairJsonStringContent(value: string) {
  let result = "";
  let inString = false;
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (!inString) {
      result += char;
      if (char === "\"") {
        inString = true;
      }
      index += 1;
      continue;
    }

    if (char === "\"") {
      let backslashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
        backslashCount += 1;
      }

      result += char;
      if (backslashCount % 2 === 0) {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === "\\") {
      const next = value[index + 1];

      if (!next) {
        result += "\\\\";
        index += 1;
        continue;
      }

      if (`"\\/bfnrt`.includes(next)) {
        result += `\\${next}`;
        index += 2;
        continue;
      }

      if (next === "u") {
        const unicodeDigits = value.slice(index + 2, index + 6);
        if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
          result += `\\u${unicodeDigits}`;
          index += 6;
          continue;
        }
      }

      result += "\\\\";
      index += 1;
      continue;
    }

    if (char === "\n") {
      result += "\\n";
      index += 1;
      continue;
    }

    if (char === "\r") {
      result += "\\r";
      index += 1;
      continue;
    }

    if (char === "\t") {
      result += "\\t";
      index += 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function parseJsonObject(text: string) {
  const normalized = stripCodeFence(text);

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("大模型返回的 JSON 不是对象");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const repaired = repairJsonStringContent(normalized);

    if (repaired !== normalized) {
      try {
        const reparsed = JSON.parse(repaired);
        if (!reparsed || Array.isArray(reparsed) || typeof reparsed !== "object") {
          throw new Error("大模型返回的 JSON 不是对象");
        }
        return reparsed as Record<string, unknown>;
      } catch (repairError) {
        console.error(
          "[Translate] JSON 修复后仍解析失败:",
          repairError,
          buildJsonErrorContext(repaired, repairError)
        );
      }
    }

    console.error(
      "[Translate] 原始 JSON 解析失败:",
      error,
      buildJsonErrorContext(normalized, error)
    );
    throw error;
  }
}

function parseJsonArrayLike(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(stripCodeFence(value));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      try {
        const repaired = repairJsonStringContent(stripCodeFence(value));
        const reparsed = JSON.parse(repaired);
        return Array.isArray(reparsed) ? reparsed : [];
      } catch {
        return [];
      }
    }
  }

  return [];
}

function hasChineseText(value: string) {
  return /[\u4e00-\u9fff]/u.test(value);
}

function stripLatexBlocks(value: string) {
  return value
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ");
}

function containsLikelyBareFormula(value: string) {
  const plain = stripLatexBlocks(value);

  return (
    /[α-ωΑ-Ω∫∑∞≈≠≤≥±→←↔∂∇√]/u.test(plain) ||
    /\b[a-zA-Z]\w*\([^)\n]+\)\s*=\s*[^，。；：:\n]+/u.test(plain) ||
    /\b(?:sin|cos|tan|cot|log|ln|exp|max|min)\s*\([^)\n]+\)/u.test(plain) ||
    /\b[a-zA-Z]\s*=\s*[-+*/() a-zA-Z0-9α-ωΑ-Ω]+/u.test(plain)
  );
}

function wrapObviousInlineMath(text: string) {
  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

  return segments
    .map((segment) => {
      if (segment.startsWith("$$") || segment.startsWith("$")) {
        return segment;
      }

      return segment.replace(
        /([A-Za-z]\w*\([^)\n]+\)\s*=\s*[A-Za-z0-9α-ωΑ-Ω+\-*/^=() .]+)(?=([^A-Za-z0-9α-ωΑ-Ω+\-*/^=() .]|$))/gu,
        (match) => `$${match.trim()}$`
      );
    })
    .join("");
}

function repairMathBody(body: string) {
  return body
    .replace(/\bmathbbb\b/gu, "\\mathbb")
    .replace(/\bmathcal\b/gu, "\\mathcal")
    .replace(/\bmathrm\b/gu, "\\mathrm")
    .replace(/\boperatorname\b/gu, "\\operatorname")
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
    .replace(/(^|[\s(,，;；:：])sum(?=\s|_|[{(\\])/gu, "$1\\sum")
    .replace(/(^|[\s(,，;；:：])int(?=\s|_|[{(\\])/gu, "$1\\int")
    .replace(/(^|[\s(,，;；:：])sin(?=\s*[\[(\\])/gu, "$1\\sin")
    .replace(/(^|[\s(,，;；:：])cos(?=\s*[\[(\\])/gu, "$1\\cos")
    .replace(/(^|[\s(,，;；:：])tan(?=\s*[\[(\\])/gu, "$1\\tan")
    .replace(/(^|[\s(,，;；:：])ln(?=\s*[\[(\\])/gu, "$1\\ln")
    .replace(/(^|[\s(,，;；:：])log(?=\s*[\[(\\])/gu, "$1\\log")
    .replace(/(^|[\s(,，;；:：])in(?=\s+\\mathbb)/gu, "$1\\in");
}

function repairLatexArtifacts(text: string) {
  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

  return segments
    .map((segment) => {
      if (segment.startsWith("$$")) {
        return `$$${repairMathBody(segment.slice(2, -2))}$$`;
      }

      if (segment.startsWith("$")) {
        return `$${repairMathBody(segment.slice(1, -1))}$`;
      }

      const repairedSegment = repairMathBody(segment);
      return repairedSegment.replace(
        /(?<!\$)(\\(?:forall|exists)\s+\\?[A-Za-z]+(?:_[0-9A-Za-z{}]+)?(?:\s*,\s*\\?[A-Za-z]+(?:_[0-9A-Za-z{}]+)?)?\s+\\in\s+\\mathbb\{[A-Za-z]+\})(?!\$)/gu,
        (match) => `$${match.trim()}$`
      );
    })
    .join("");
}

function hasChineseInsideMathBlock(value: string) {
  const blocks = value.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) ?? [];
  return blocks.some((block) => hasChineseText(block));
}

function isStrictKeywordLine(line: string) {
  if (!SNIPPET_KEYWORD_LINE_PATTERN.test(line)) {
    return false;
  }

  const [left, definition] = line.split(" : ");
  if (!left || !definition) {
    return false;
  }

  const match = left.match(/^(.*) \((.*)\)$/u);
  if (!match) {
    return false;
  }

  const [, term, explanation] = match;
  return (
    FRENCH_TERM_PATTERN.test(term.trim()) &&
    hasChineseText(explanation.trim()) &&
    hasChineseText(definition.trim())
  );
}

function normalizeKeywordItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const term_fr = normalizeText(record.term_fr).replace(/\s+/g, " ");
      const term_zh = normalizeText(record.term_zh);
      const definition_zh = normalizeText(record.definition_zh);

      if (
        !term_fr ||
        !term_zh ||
        !definition_zh ||
        !FRENCH_TERM_PATTERN.test(term_fr) ||
        !hasChineseText(term_zh) ||
        !hasChineseText(definition_zh)
      ) {
        return null;
      }

      const key = term_fr.toLowerCase();
      if (seen.has(key)) {
        return null;
      }

      seen.add(key);
      return { term_fr, term_zh, definition_zh };
    })
    .filter((item): item is SnippetKeywordItem => Boolean(item))
    .slice(0, 5);
}

function parseKeywordItemsFromText(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?) \((.*?)\) : (.*)$/u);
      if (!match) {
        return null;
      }

      const [, term_fr, term_zh, definition_zh] = match;
      const normalized = {
        term_fr: term_fr.trim().replace(/\s+/g, " "),
        term_zh: term_zh.trim(),
        definition_zh: definition_zh.trim(),
      };

      if (
        !FRENCH_TERM_PATTERN.test(normalized.term_fr) ||
        !hasChineseText(normalized.term_zh) ||
        !hasChineseText(normalized.definition_zh)
      ) {
        return null;
      }

      return normalized;
    })
    .filter((item): item is SnippetKeywordItem => Boolean(item))
    .slice(0, 5);
}

function buildKeywordString(items: SnippetKeywordItem[]) {
  return items
    .map((item) => `${item.term_fr} (${item.term_zh}) : ${item.definition_zh}`)
    .join("\n");
}

function clampNormalizedValue(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1000, Math.max(0, Math.round(numeric)));
}

function normalizeOverlayBlocks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const x = clampNormalizedValue(record.x, 0);
      const y = clampNormalizedValue(record.y, 0);
      const maxWidth = Math.max(1, 1000 - x);
      const maxHeight = Math.max(1, 1000 - y);
      const width = Math.min(maxWidth, Math.max(Math.min(48, maxWidth), clampNormalizedValue(record.width, 120)));
      const height = Math.min(maxHeight, Math.max(Math.min(36, maxHeight), clampNormalizedValue(record.height, 72)));
      const text = repairLatexArtifacts(wrapObviousInlineMath(normalizeText(record.text)));
      const alignValue = normalizeText(record.align).toLowerCase();
      const align: SnippetOverlayAlign =
        alignValue === "center" || alignValue === "right" ? alignValue : "left";

      if (!text || !hasChineseText(stripLatexBlocks(text))) {
        return null;
      }

      return {
        id: normalizeText(record.id) || `block-${index + 1}`,
        x,
        y,
        width,
        height,
        text,
        align,
      };
    })
    .filter((item): item is SnippetOverlayBlock => Boolean(item))
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .slice(0, 14);
}

function normalizeSnippetResponse(raw: Record<string, unknown>): SnippetResponse {
  const keywordItemsFromArray = normalizeKeywordItems(raw.keyword_items);
  const normalizedKeywordItems =
    keywordItemsFromArray.length > 0
      ? keywordItemsFromArray
      : parseKeywordItemsFromText(normalizeText(raw.keywords));

  return {
    translation: repairLatexArtifacts(wrapObviousInlineMath(normalizeText(raw.translation))),
    analysis: normalizeText(raw.analysis),
    keywords:
      normalizedKeywordItems.length > 0
        ? buildKeywordString(normalizedKeywordItems)
        : normalizeText(raw.keywords),
    keyword_items: normalizedKeywordItems,
    overlay_blocks: normalizeOverlayBlocks(raw.overlay_blocks),
  };
}

function normalizeQuizItem(raw: unknown): DocumentQuizItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const answer = normalizeText(record.answer);
  const item: DocumentQuizItem = {
    question_fr: normalizeText(record.question_fr),
    question_zh: normalizeText(record.question_zh),
    question_en: normalizeText(record.question_en),
    options_fr: normalizeStringArray(record.options_fr),
    options_zh: normalizeStringArray(record.options_zh),
    options_en: normalizeStringArray(record.options_en),
    answer_fr: normalizeText(record.answer_fr),
    answer_zh: normalizeText(record.answer_zh),
    answer_en: normalizeText(record.answer_en),
    answer: answer || undefined,
    explanation_fr: normalizeText(record.explanation_fr) || undefined,
    explanation_zh: normalizeText(record.explanation_zh) || undefined,
    explanation_en: normalizeText(record.explanation_en) || undefined,
    explanation: normalizeText(record.explanation) || undefined,
  };

  const legacyLetterIndex = ["A", "B", "C", "D"].indexOf(answer.toUpperCase());
  const legacyMatchedIndex =
    legacyLetterIndex >= 0
      ? legacyLetterIndex
      : [item.options_zh, item.options_fr, item.options_en]
          .map((options) => options.findIndex((option) => option.trim() === answer))
          .find((index) => index >= 0) ?? -1;

  if (legacyMatchedIndex >= 0) {
    if (!item.answer_fr) {
      item.answer_fr = item.options_fr[legacyMatchedIndex] || "";
    }
    if (!item.answer_zh) {
      item.answer_zh = item.options_zh[legacyMatchedIndex] || "";
    }
    if (!item.answer_en) {
      item.answer_en = item.options_en[legacyMatchedIndex] || "";
    }
  }

  if (
    !item.question_fr ||
    !item.question_zh ||
    !item.question_en ||
    item.options_fr.length !== 4 ||
    item.options_zh.length !== 4 ||
    item.options_en.length !== 4 ||
    item.options_fr.length !== item.options_zh.length ||
    item.options_fr.length !== item.options_en.length ||
    !item.answer_fr ||
    !item.answer_zh ||
    !item.answer_en
  ) {
    return null;
  }

  return item;
}

function normalizeDocumentResponse(raw: Record<string, unknown>): DocumentResponse {
  const response = {
    mermaid: stripCodeFence(normalizeText(raw.mermaid)),
    quiz: parseJsonArrayLike(raw.quiz)
      .map(normalizeQuizItem)
      .filter((item): item is DocumentQuizItem => Boolean(item))
      .slice(0, 3),
  };

  if (!response.mermaid) {
    throw new Error("Document 模式缺少可渲染的 mermaid");
  }

  if (response.quiz.length !== 3) {
    throw new Error("Document 模式的 quiz 必须严格返回 3 道题");
  }

  return response;
}

function validateSnippetResponse(
  response: SnippetResponse,
  options: ValidateSnippetOptions = {}
) {
  const issues: string[] = [];
  const keywordLines = response.keywords
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const requireAnalysis = options.requireAnalysis !== false;

  if (!response.translation) {
    issues.push("translation 字段缺失或为空");
  } else if (!hasChineseText(response.translation)) {
    issues.push("translation 必须包含简体中文翻译内容");
  }

  if (requireAnalysis && !response.analysis) {
    issues.push("analysis 字段缺失或为空");
  } else if (response.analysis && !hasChineseText(response.analysis)) {
    issues.push("analysis 必须是纯中文深度解析");
  }

  if (response.translation && containsLikelyBareFormula(response.translation)) {
    issues.push("translation 中存在未使用 LaTeX $...$ 或 $$...$$ 包裹的公式");
  }

  if (response.translation && hasChineseInsideMathBlock(response.translation)) {
    issues.push("translation 的 LaTeX 数学块中不能包裹中文说明文字");
  }

  if (response.keyword_items.length < 3 || response.keyword_items.length > 5) {
    issues.push("keyword_items 必须严格输出 3 到 5 个词条");
  }

  if (response.keywords && keywordLines.some((line) => !isStrictKeywordLine(line))) {
    issues.push("keywords 的每一行都必须符合“法语词汇 (中文解释) : 具体的中文定义”格式");
  }

  return issues;
}

function extractTextFromUserContent(userContent: UserContent) {
  if (typeof userContent === "string") {
    return userContent;
  }

  return userContent
    .filter((part): part is OpenAI.Chat.Completions.ChatCompletionContentPartText => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function extractFrenchCandidates(sourceText: string) {
  const normalized = sourceText
    .replace(/['’]/g, " ")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s-]/g, " ");

  const rawTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const candidates: string[] = [];

  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    const lower = token.toLowerCase();

    if (
      token.length <= 1 ||
      FRENCH_STOPWORDS.has(lower) ||
      /^[A-Za-z]$/.test(token)
    ) {
      continue;
    }

    const next = rawTokens[index + 1];
    const nextLower = next?.toLowerCase() ?? "";

    if (
      next &&
      next.length > 1 &&
      !FRENCH_STOPWORDS.has(nextLower) &&
      !/^[A-Za-z]$/.test(next)
    ) {
      candidates.push(`${lower} ${nextLower}`);
    }

    candidates.push(lower);
  }

  return Array.from(new Set(candidates));
}

function synthesizeKeywordsLocally(userContent: UserContent, rawKeywords: string) {
  const sourceText = extractTextFromUserContent(userContent);
  if (!sourceText) {
    return rawKeywords;
  }

  const candidates = extractFrenchCandidates(sourceText);
  const usedTerms = new Set<string>();

  const lines = rawKeywords
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  const normalizedLines = lines.map((line) => {
    const [left, definition] = line.split(" : ");
    if (!left || !definition) {
      return line;
    }

    const match = left.match(/^(.*) \((.*)\)$/u);
    if (!match) {
      return line;
    }

    const [, outerTerm, innerTerm] = match;
    const leftSeed = outerTerm.trim();
    const rightSeed = innerTerm.trim();
    const normalizedLeftSeed = leftSeed.toLowerCase();
    const normalizedRightSeed = rightSeed.toLowerCase();
    const englishOrFallback = hasChineseText(leftSeed) ? rightSeed : leftSeed;
    const normalizedEnglishOrFallback = englishOrFallback.toLowerCase();
    const mappedFrench =
      ENGLISH_TO_FRENCH_KEYWORD_MAP[normalizedEnglishOrFallback] ||
      ENGLISH_TO_FRENCH_KEYWORD_MAP[normalizedRightSeed] ||
      ENGLISH_TO_FRENCH_KEYWORD_MAP[normalizedLeftSeed] ||
      candidates.find((candidate) => !usedTerms.has(candidate)) ||
      normalizedEnglishOrFallback;
    const chineseLabel =
      (hasChineseText(leftSeed) ? leftSeed : "") ||
      (hasChineseText(rightSeed) ? rightSeed : "") ||
      TERM_TO_CHINESE_LABEL_MAP[normalizedEnglishOrFallback] ||
      TERM_TO_CHINESE_LABEL_MAP[normalizedRightSeed] ||
      TERM_TO_CHINESE_LABEL_MAP[normalizedLeftSeed] ||
      "术语";

    usedTerms.add(mappedFrench);
    return `${mappedFrench} (${chineseLabel}) : ${definition.trim()}`;
  });

  return normalizedLines.join("\n");
}

async function requestJsonCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  temperature: number,
  model = DEFAULT_MODEL
) {
  const requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model,
    messages,
    temperature,
  };

  // Gemini 的 OpenAI 兼容视觉请求在携带 image_url 时，
  // 对 response_format: { type: "json_object" } 的兼容性不稳定，
  // 这里改为仅依赖 prompt 约束和后端 JSON 解析校验。
  if (!(usesGeminiOpenAICompatibility() && hasImageInMessages(messages))) {
    requestPayload.response_format = { type: "json_object" };
  }

  return openai.chat.completions.create(requestPayload);
}

async function repairSnippetResponse(
  userContent: UserContent,
  invalidResponse: string,
  issues: string[],
  hasImageInput: boolean,
  includeAnalysis: boolean,
  model = FLASH_MODEL
) {
  const repairPrompt = `${STRICT_JSON_PREFIX}

你现在处于 Snippet 输出纠错模式。你会收到原始输入、上一次不合格的 JSON 和错误列表。
你的任务不是解释错误，而是重新输出一个完全合格的 JSON。

必须严格返回以下结构：
{
  "translation": "...",
  ${includeAnalysis ? `"analysis": "...",` : ""}
  "keywords": "...",
  "keyword_items": [
    {
      "term_fr": "...",
      "term_zh": "...",
      "definition_zh": "..."
    }
  ],
  "overlay_blocks": [
    {
      "id": "block-1",
      "x": 120,
      "y": 180,
      "width": 680,
      "height": 96,
      "text": "...",
      "align": "left"
    }
  ]
}

纠错硬性规则：
1. translation 必须是中文，且必须保持原始排版层级。
2. 所有数学公式、数学符号、变量、上下标、希腊字母、积分、微分、极限、求和、向量、矩阵、不等式都必须严格使用 LaTeX 包裹。行内公式用 $...$，独立公式用 $$...$$。
3. ${includeAnalysis ? "analysis 必须是纯中文，不得输出法语整句。" : "本次不要返回 analysis 字段。"}
4. keyword_items 必须严格为 3 到 5 个词条，keywords 必须是它们的逐行串联文本。
5. ${hasImageInput
    ? `overlay_blocks 必须基于原图的 1000x1000 归一化坐标，只覆盖自然语言文本区域，不要覆盖纯公式和图形。`
    : `overlay_blocks 必须返回空数组 []。`}
6. 不要输出任何 JSON 之外的文本。`;

  const completion = await requestJsonCompletion(
    [
      { role: "system", content: repairPrompt },
      { role: "user", content: userContent },
      { role: "assistant", content: invalidResponse },
      {
        role: "user",
        content: `上一个 JSON 不合格，问题如下：\n- ${issues.join("\n- ")}\n请重新输出完整且合法的 JSON。`,
      },
    ],
    0.1,
    model
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("纠错阶段返回了空响应");
  }

  return content;
}

async function repairSnippetKeywords(
  userContent: UserContent,
  invalidKeywords: string,
  model = FLASH_MODEL
) {
  const completion = await requestJsonCompletion(
    [
      {
        role: "system",
        content: `${STRICT_JSON_PREFIX}

你现在只负责修复 Snippet 模式中的关键词。
你必须只返回一个 JSON 对象，结构如下：
{
  "keyword_items": [
    {
      "term_fr": "...",
      "term_zh": "...",
      "definition_zh": "..."
    }
  ]
}

硬性规则：
1. 必须输出 3 到 5 个词条。
2. term_fr 必须是原始内容中的法语词或法语短语。
3. term_zh 必须是简体中文解释。
4. definition_zh 必须是简体中文定义。
5. 不要输出任何 JSON 之外的文本。`,
      },
      { role: "user", content: userContent },
      {
        role: "user",
        content: `下面是上一次不合格的关键词文本，仅供你理解主题，不要沿用其错误格式：
${invalidKeywords}

请重新输出合法 JSON。`,
      },
    ],
    0,
    model
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("关键词纠错阶段返回了空响应");
  }

  const parsed = parseJsonObject(content);
  const keywordItems = normalizeKeywordItems(parsed.keyword_items);

  if (keywordItems.length >= 3 && keywordItems.length <= 5) {
    return {
      keyword_items: keywordItems,
      keywords: buildKeywordString(keywordItems),
    };
  }

  const synthesizedKeywords = synthesizeKeywordsLocally(userContent, invalidKeywords);
  const synthesizedItems = parseKeywordItemsFromText(synthesizedKeywords);
  return {
    keyword_items: synthesizedItems,
    keywords: synthesizedItems.length > 0 ? buildKeywordString(synthesizedItems) : synthesizedKeywords,
  };
}

async function repairSnippetOverlayBlocks(
  userContent: UserContent,
  translation: string,
  model = FLASH_MODEL
) {
  const completion = await requestJsonCompletion(
    [
      {
        role: "system",
        content: `${STRICT_JSON_PREFIX}

你现在只负责 Snippet 模式中的 overlay_blocks。
你必须只返回一个 JSON 对象：
{
  "overlay_blocks": [
    {
      "id": "block-1",
      "x": 120,
      "y": 180,
      "width": 680,
      "height": 96,
      "text": "...",
      "align": "left"
    }
  ]
}

硬性规则：
1. 坐标系统一使用原图的 1000x1000 归一化坐标系。
2. 只覆盖需要翻译的自然语言文本区域，不要覆盖纯公式、图形、电路图元件、坐标轴或非自然语言结构。
3. text 必须是简体中文，允许包含 LaTeX 公式。
4. align 只能是 left、center、right。
5. 不要输出任何 JSON 之外的文本。`,
      },
      { role: "user", content: userContent },
      {
        role: "user",
        content: `下面是已经确认的完整中文译文，请用它来辅助定位文本块：
${translation}`,
      },
    ],
    0.1,
    model
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("overlay_blocks 纠错阶段返回了空响应");
  }

  const parsed = parseJsonObject(content);
  return normalizeOverlayBlocks(parsed.overlay_blocks);
}

async function parseAndValidateSnippetResponse(
  aiResponse: string,
  userContent: UserContent,
  hasImageInput: boolean,
  options: {
    includeAnalysis?: boolean;
    model?: string;
  } = {}
) {
  const includeAnalysis = options.includeAnalysis !== false;
  const model = options.model || FLASH_MODEL;
  let parsed = normalizeSnippetResponse(parseJsonObject(aiResponse));
  let issues = validateSnippetResponse(parsed, {
    requireAnalysis: includeAnalysis,
  });

  if (issues.length > 0) {
    console.warn("[Translate] Snippet 输出未通过校验，准备自动纠错:", issues);
    const repairedResponse = await repairSnippetResponse(
      userContent,
      JSON.stringify(parsed, null, 2),
      issues,
      hasImageInput,
      includeAnalysis,
      model
    );
    parsed = normalizeSnippetResponse(parseJsonObject(repairedResponse));
    issues = validateSnippetResponse(parsed, {
      requireAnalysis: includeAnalysis,
    });
  }

  if (parsed.keyword_items.length < 3 || parsed.keyword_items.length > 5) {
    try {
      const repairedKeywords = await repairSnippetKeywords(
        userContent,
        parsed.keywords,
        model
      );
      parsed = {
        ...parsed,
        keywords: repairedKeywords.keywords,
        keyword_items: repairedKeywords.keyword_items,
      };
      issues = validateSnippetResponse(parsed, {
        requireAnalysis: includeAnalysis,
      });
    } catch (error) {
      console.warn("[Translate] 关键词自动修复失败:", error);
    }
  }

  if (hasImageInput && parsed.overlay_blocks.length === 0) {
    try {
      const repairedOverlays = await repairSnippetOverlayBlocks(
        userContent,
        parsed.translation,
        model
      );
      if (repairedOverlays.length > 0) {
        parsed = {
          ...parsed,
          overlay_blocks: repairedOverlays,
        };
      }
    } catch (error) {
      console.warn("[Translate] overlay_blocks 自动修复失败:", error);
    }
  }

  issues = validateSnippetResponse(parsed, {
    requireAnalysis: includeAnalysis,
  });
  if (issues.length > 0) {
    throw new Error(`Snippet 输出校验失败：${issues.join("；")}`);
  }

  return parsed;
}

async function generateDocumentResponse(
  userContent: UserContent,
  useDeepModel: boolean
) {
  const documentModel = useDeepModel ? PRO_MODEL : FLASH_MODEL;
  const completion = await requestJsonCompletion(
    [
      { role: "system", content: getDocumentSystemPrompt() },
      { role: "user", content: userContent },
    ],
    0.1,
    documentModel
  );

  const aiResponse = completion.choices[0]?.message?.content;
  if (!aiResponse) {
    throw new Error("Document 模式返回了空响应");
  }

  return normalizeDocumentResponse(parseJsonObject(aiResponse));
}

export async function POST(request: NextRequest) {
  try {
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "在此填入你的API Key"
    ) {
      return NextResponse.json(
        { error: "尚未配置 API Key，请在 .env.local 文件中填入 OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const mode = (formData.get("mode") as string) || "snippet";
    const deepMode =
      String(formData.get("deep_mode") || "").toLowerCase() === "true" ||
      String(formData.get("deep_mode") || "") === "1";
    const text = formData.get("text") as string | null;
    const imageFiles = formData.getAll("image") as File[];
    const hasImageInput = imageFiles.length > 0;

    if (!text && imageFiles.length === 0) {
      return NextResponse.json(
        { error: "请提供文本内容或上传课件图片" },
        { status: 400 }
      );
    }

    let userContent: UserContent;

    if (hasImageInput) {
      const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: "text",
          text: text
            ? `以下是待解析内容。严格遵守 system prompt，只返回合法 JSON，不得输出任何额外文字：\n\n${text}`
            : "以下是待解析截图。严格遵守 system prompt，只返回合法 JSON，不得输出任何额外文字。",
        },
      ];

      for (const file of imageFiles) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");

        if (buffer.length > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: `图片文件 ${file.name} 过大，请上传 10MB 以内的图片` },
            { status: 400 }
          );
        }

        parts.push({
          type: "image_url",
          image_url: { url: buildImageUrlPayload(file, base64) },
        });
      }

      userContent = parts;
    } else {
      userContent = `以下是待解析内容。严格遵守 system prompt，只返回合法 JSON，不得输出任何额外文字：\n\n${text}`;
    }

    console.log(
      `[Translate] 发起请求 — Mode: ${mode}, ` +
        `深度模式: ${deepMode ? "on" : "off"}, ` +
        `默认模型: ${DEFAULT_MODEL}, Flash: ${FLASH_MODEL}, Pro: ${PRO_MODEL}, ` +
        `文本: ${text ? `${text.length}字符` : "无"}, ` +
        `图片: ${imageFiles.length}张`
    );

    let responsePayload: SnippetResponse | DocumentResponse | { translation: string };

    if (mode === "snippet") {
      const snippetModel = deepMode ? PRO_MODEL : FLASH_MODEL;
      const completion = await requestJsonCompletion(
        [
          { role: "system", content: getSnippetTranslationSystemPrompt(hasImageInput) },
          { role: "user", content: userContent },
        ],
        0.15,
        snippetModel
      );

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("大模型返回了空响应");
      }

      console.log(
        `[Translate] 完成 — Token: prompt=${completion.usage?.prompt_tokens}, ` +
          `completion=${completion.usage?.completion_tokens}, ` +
          `total=${completion.usage?.total_tokens}`
      );

      responsePayload = await parseAndValidateSnippetResponse(
        aiResponse,
        userContent,
        hasImageInput,
        {
          includeAnalysis: true,
          model: snippetModel,
        }
      );
    } else if (mode === "document") {
      responsePayload = await generateDocumentResponse(userContent, deepMode);
    } else {
      const completion = await openai.chat.completions.create({
        model: FLASH_MODEL,
        messages: [
          { role: "system", content: getLiveSystemPrompt() },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("大模型返回了空响应");
      }

      responsePayload = { translation: aiResponse.trim() };
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("[Translate] 请求失败:", error);

    if (error instanceof OpenAI.APIError) {
      const statusMessages: Record<number, string> = {
        401: "API Key 无效或已过期，请检查 .env.local 中的 OPENAI_API_KEY",
        403: "API Key 权限不足，请确认账户已开通对应模型的访问权限",
        429: "API 调用频率超限或余额不足，请稍后再试或检查账户余额",
        400: `请求格式错误：${error.message}`,
        404: "模型不存在，请检查 .env.local 中的 OPENAI_MODEL 是否正确",
        500: "大模型服务器内部错误，请稍后重试",
        503: "大模型服务暂时不可用，请稍后再试",
      };
      const message = statusMessages[error.status ?? 0] || `API 调用失败: ${error.message}`;
      return NextResponse.json({ error: message }, { status: error.status || 500 });
    }

    if (
      error instanceof Error &&
      (error.message.includes("timeout") || error.message.includes("ETIMEDOUT"))
    ) {
      return NextResponse.json(
        { error: "网络请求超时，请检查网络连接后重试" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? `服务异常: ${error.message}` : "服务器内部错误" },
      { status: 500 }
    );
  }
}
