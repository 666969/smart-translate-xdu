import { MAX_SCAN_PAGES } from "./studyLimits";

export interface PdfSource {
  page: number;
  label?: string;
  quote?: string;
}

export interface PdfCoverage {
  pages: number[];
  total: number;
  excerpted: boolean;
}

interface PdfPageRequest {
  start: number;
  end: number;
  numbering: "pdf" | "label" | "auto";
}

const pageNumber = "[0-9零〇一二两兩三四五六七八九十百千万萬]+";
const pageRange = "[-~—–到至]";
const pageReference = new RegExp(
  "(?:(PDF(?:\\s*物理)?|课件|課件|讲义|講義|幻灯片|幻燈片)\\s*)?第\\s*(" + pageNumber +
  ")\\s*(?:[页頁]\\s*)?(?:" + pageRange + "\\s*第?\\s*(" + pageNumber + ")\\s*)?[页頁]",
  "iu",
);
const barePageReference = new RegExp("^(" + pageNumber + ")(?:\\s*" + pageRange + "\\s*(" + pageNumber + "))?$", "u");
const chineseDigits = new Map([..."零一二三四五六七八九"].map((digit, index) => [digit, index]));
chineseDigits.set("〇", 0).set("两", 2).set("兩", 2);
const chineseUnits = new Map([["十", 10], ["百", 100], ["千", 1000], ["万", 10000], ["萬", 10000]]);

function parsePageNumber(value: string) {
  if (/^\d+$/u.test(value)) return Number(value);
  const symbols = Array.from(value);
  if (symbols.every((symbol) => chineseDigits.has(symbol))) {
    return Number(symbols.map((symbol) => chineseDigits.get(symbol)).join(""));
  }
  let result = 0;
  let section = 0;
  let digit: number | undefined;
  let previousUnit = 10000;
  for (const symbol of symbols) {
    const number = chineseDigits.get(symbol);
    if (number !== undefined) {
      if (digit) return NaN;
      digit = number;
      continue;
    }
    const unit = chineseUnits.get(symbol);
    if (unit === 10000 && !result && section + (digit ?? 0) > 0) {
      result = (section + (digit ?? 0)) * unit;
      section = 0;
      previousUnit = 10000;
    } else if (unit && unit < previousUnit) {
      section += (digit ?? 1) * unit;
      previousUnit = unit;
    } else {
      return NaN;
    }
    digit = undefined;
  }
  return result + section + (digit ?? 0);
}

export function findPdfPageRequest(text: string, bare = false): PdfPageRequest | null {
  const normalized = text.normalize("NFKC");
  const reference = normalized.match(pageReference);
  const english = normalized.match(/\b(?:page|pp?\.?)\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/iu);
  const input = bare ? normalized.trim().match(barePageReference) : null;
  if (reference) {
    const [, prefix, start, end = start] = reference;
    return {
      start: parsePageNumber(start),
      end: parsePageNumber(end),
      numbering: /^pdf/i.test(prefix ?? "") ? "pdf" : prefix ? "label" : "auto",
    };
  }
  const match = english ?? input;
  if (!match) return null;
  return { start: parsePageNumber(match[1]), end: parsePageNumber(match[2] ?? match[1]), numbering: "auto" };
}

export function resolvePdfPages(request: PdfPageRequest, pageCount: number, labels: (string | null)[]) {
  const { start, end, numbering } = request;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
    throw new Error("页码范围无效。");
  }
  if (end - start + 1 > MAX_SCAN_PAGES) {
    throw new Error("单次最多选 " + MAX_SCAN_PAGES + " 页，请缩小范围。");
  }

  const byLabel = labels.some(Boolean) && (numbering === "label" ||
    (numbering === "auto" && (start > pageCount || end > pageCount)));
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const requested = start + index;
    const page = byLabel ? labels.indexOf(String(requested)) + 1 : requested;
    if (page < 1 || page > pageCount) {
      throw new Error("找不到指定页。PDF 共 " + pageCount + " 页，请核对 PDF 页码或课件页码。");
    }
    return page;
  });
}

export function inferPrintedPdfLabels(candidates: number[][]): (string | null)[] {
  if (candidates.length < 3) return [];
  const offsets = new Map<number, number>();
  candidates.forEach((values, index) => {
    for (const offset of new Set(values.map((value) => value - index - 1))) {
      if (offset > 0) offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
    }
  });
  const ranked = Array.from(offsets).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  if (!best || best[1] < Math.max(3, Math.ceil(candidates.length * 0.75)) || ranked[1]?.[1] === best[1]) return [];
  return candidates.map((values, index) => {
    const label = index + 1 + best[0];
    return values.includes(label) ? String(label) : null;
  });
}

export function pdfPageTitle(page: number, label?: string | null) {
  return "PDF 第 " + page + " 页" + (label && label !== String(page) ? " · 课件 " + label + " 页" : "");
}
