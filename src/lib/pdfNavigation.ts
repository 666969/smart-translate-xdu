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

export function findPdfPageRequest(text: string, bare = false): PdfPageRequest | null {
  const reference = text.match(/(?:(PDF(?:\s*物理)?|课件|讲义|幻灯片)\s*)?第\s*(\d+)\s*(?:页\s*)?(?:(?:-|~|—|–|到|至)\s*第?\s*(\d+)\s*)?页/iu);
  const english = text.match(/\b(?:page|pp?\.?)\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/iu);
  const input = bare ? text.trim().match(/^(\d+)(?:\s*[-~—–到至]\s*(\d+))?$/u) : null;
  if (reference) {
    const [, prefix, start, end = start] = reference;
    return {
      start: Number(start),
      end: Number(end),
      numbering: /^pdf/i.test(prefix ?? "") ? "pdf" : prefix ? "label" : "auto",
    };
  }
  const match = english ?? input;
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2] ?? match[1]), numbering: "auto" };
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
