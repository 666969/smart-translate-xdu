export type TranslationLayoutBlockType =
  | "page_title"
  | "section_title"
  | "subtitle"
  | "paragraph"
  | "formula"
  | "formula_box"
  | "bullet_list"
  | "key_value_list"
  | "note";

export interface TranslationLayoutPair {
  label: string;
  value: string;
}

export interface TranslationLayoutBlock {
  type: TranslationLayoutBlockType;
  text?: string;
  items?: string[];
  pairs?: TranslationLayoutPair[];
}

const VALID_LAYOUT_TYPES = new Set<TranslationLayoutBlockType>([
  "page_title",
  "section_title",
  "subtitle",
  "paragraph",
  "formula",
  "formula_box",
  "bullet_list",
  "key_value_list",
  "note",
]);

const LATEX_OR_FORMULA_PATTERN =
  /\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log|alpha|beta|gamma|theta|phi|omega|mathbb|forall|exists)|[α-ωΑ-Ω∫∑∞]|[A-Za-z]\w*\([^)\n]+\)\s*=/u;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizePairs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = normalizeText(record.label);
      const valueText = normalizeText(record.value);

      if (!label || !valueText) {
        return null;
      }

      return { label, value: valueText };
    })
    .filter((item): item is TranslationLayoutPair => Boolean(item));
}

export function normalizeTranslationLayout(value: unknown): TranslationLayoutBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const blocks: TranslationLayoutBlock[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const record = item as Record<string, unknown>;
    const type = normalizeText(record.type) as TranslationLayoutBlockType;

    if (!VALID_LAYOUT_TYPES.has(type)) {
      return;
    }

    const text = normalizeText(record.text);
    const items = normalizeStringArray(record.items);
    const pairs = normalizePairs(record.pairs);

    if (
      (type === "bullet_list" || type === "formula_box") &&
      items.length === 0
    ) {
      return;
    }

    if (type === "key_value_list" && pairs.length === 0) {
      return;
    }

    if (
      type !== "bullet_list" &&
      type !== "formula_box" &&
      type !== "key_value_list" &&
      !text
    ) {
      return;
    }

    blocks.push({
      type,
      text: text || undefined,
      items: items.length > 0 ? items : undefined,
      pairs: pairs.length > 0 ? pairs : undefined,
    });
  });

  return blocks;
}

function looksLikeHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed || LATEX_OR_FORMULA_PATTERN.test(trimmed)) {
    return false;
  }

  if (/[。！？；;]$/u.test(trimmed)) {
    return false;
  }

  return trimmed.length <= 26;
}

function looksLikeFormulaLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/[\\$]/u.test(trimmed) && LATEX_OR_FORMULA_PATTERN.test(trimmed)) {
    return true;
  }

  return (
    /[=]/u.test(trimmed) &&
    (/^[A-Za-z]\w*\([^)\n]+\)/u.test(trimmed) ||
      /[α-ωΑ-Ω∫∑∞]/u.test(trimmed) ||
      /\\(?:frac|int|sum|sqrt|sin|cos|tan|ln|log)/u.test(trimmed))
  );
}

function splitKeyValueLine(line: string) {
  const match = line.trim().match(/^(.{1,24}?)\s*[:：]\s+(.+)$/u);
  if (!match) {
    return null;
  }

  return {
    label: match[1].trim(),
    value: match[2].trim(),
  };
}

function flushParagraph(
  buffer: string[],
  blocks: TranslationLayoutBlock[]
) {
  if (buffer.length === 0) {
    return;
  }

  const text = buffer.join(" ").replace(/\s+/g, " ").trim();
  if (text) {
    blocks.push({ type: "paragraph", text });
  }
  buffer.length = 0;
}

function flushBullets(
  buffer: string[],
  blocks: TranslationLayoutBlock[]
) {
  if (buffer.length === 0) {
    return;
  }

  blocks.push({ type: "bullet_list", items: [...buffer] });
  buffer.length = 0;
}

function flushPairs(
  buffer: TranslationLayoutPair[],
  blocks: TranslationLayoutBlock[]
) {
  if (buffer.length === 0) {
    return;
  }

  blocks.push({ type: "key_value_list", pairs: [...buffer] });
  buffer.length = 0;
}

export function synthesizeTranslationLayoutFromTranslation(
  content: string
): TranslationLayoutBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: TranslationLayoutBlock[] = [];
  const paragraphBuffer: string[] = [];
  const bulletBuffer: string[] = [];
  const pairBuffer: TranslationLayoutPair[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(paragraphBuffer, blocks);
      flushBullets(bulletBuffer, blocks);
      flushPairs(pairBuffer, blocks);
      return;
    }

    if (/^(?:[-*•▪◦■])\s+/u.test(trimmed)) {
      flushParagraph(paragraphBuffer, blocks);
      flushPairs(pairBuffer, blocks);
      bulletBuffer.push(trimmed.replace(/^(?:[-*•▪◦■])\s+/u, "").trim());
      return;
    }

    const maybePair = splitKeyValueLine(trimmed);
    if (maybePair) {
      flushParagraph(paragraphBuffer, blocks);
      flushBullets(bulletBuffer, blocks);
      pairBuffer.push(maybePair);
      return;
    }

    flushBullets(bulletBuffer, blocks);
    flushPairs(pairBuffer, blocks);

    if (looksLikeFormulaLine(trimmed)) {
      flushParagraph(paragraphBuffer, blocks);
      const type =
        /\\frac|=.+=/u.test(trimmed) || trimmed.length > 40
          ? "formula_box"
          : "formula";
      if (type === "formula_box") {
        blocks.push({ type, items: [trimmed] });
      } else {
        blocks.push({ type, text: trimmed });
      }
      return;
    }

    if (blocks.length === 0 && looksLikeHeading(trimmed)) {
      blocks.push({ type: "page_title", text: trimmed });
      return;
    }

    if (looksLikeHeading(trimmed)) {
      blocks.push({
        type: trimmed.length <= 18 ? "section_title" : "subtitle",
        text: trimmed,
      });
      return;
    }

    paragraphBuffer.push(trimmed);
  });

  flushParagraph(paragraphBuffer, blocks);
  flushBullets(bulletBuffer, blocks);
  flushPairs(pairBuffer, blocks);

  return blocks;
}
