/**
 * PDF 文本提取工具 — 基于 pdfjs-dist
 */

import type { PDFDocumentProxy } from "pdfjs-dist";
import { inferPrintedPdfLabels } from "./pdfNavigation";
import { MAX_PDF_PAGES, MAX_PDF_TEXT_CHARS } from "./studyLimits";

export type PdfExtractStatus =
  | "text_ready"
  | "scan_like"
  | "worker_error"
  | "parse_error";

export interface PdfParseResult {
  pages: string[];
  labels: (string | null)[];
  fullText: string;
  pageCount: number;
  status: PdfExtractStatus;
  reason?: string;
  averageEffectiveCharsPerPage: number;
  nonEmptyPageCount: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
const documents = new WeakMap<File, Promise<PDFDocumentProxy>>();

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    }).catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }

  return pdfjsPromise;
}

async function openPdf(file: File) {
  let pending = documents.get(file);
  if (!pending) {
    pending = (async () => {
      const pdfjs = await getPdfJs();
      const data = await file.arrayBuffer();
      return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    })().catch((error) => {
      documents.delete(file);
      throw error;
    });
    documents.set(file, pending);
  }
  return pending;
}

export function releasePdf(file: File) {
  const pending = documents.get(file);
  documents.delete(file);
  void pending?.then((pdf) => pdf.destroy()).catch(() => {});
}

function normalizeEffectiveTextLength(value: string) {
  return value
    .replace(/\s+/gu, "")
    .replace(/[|[\]{}()<>~`^_=+*/\\.,;:!?'"，。！？；：、“”‘’（）【】《》·…—-]/gu, "")
    .length;
}

function classifyPdfError(error: unknown): {
  status: Extract<PdfExtractStatus, "worker_error" | "parse_error">;
  reason: string;
} {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "未知 PDF 解析错误";

  if (
    /worker|fake worker|workerSrc|Failed to fetch dynamically imported module|Loading chunk|import.*pdf\.worker|CORS|network/i.test(
      message
    )
  ) {
    return {
      status: "worker_error",
      reason: "PDF 预览正常，但文本提取器加载失败，可能与当前网络环境或外部 worker 资源有关。",
    };
  }

  return {
    status: "parse_error",
    reason: "PDF 可以打开，但文本层无法被当前解析器稳定提取，可能是受保护、编码异常或结构特殊的 PDF。",
  };
}

function determineExtractStatus(pages: string[], pageCount: number) {
  const effectiveLengths = pages.map(normalizeEffectiveTextLength);
  const totalEffectiveChars = effectiveLengths.reduce((sum, value) => sum + value, 0);
  const nonEmptyPageCount = effectiveLengths.filter((value) => value >= 20).length;
  const averageEffectiveCharsPerPage =
    pageCount > 0 ? totalEffectiveChars / pageCount : 0;

  const isScanLike =
    totalEffectiveChars === 0 ||
    nonEmptyPageCount === 0 ||
    (averageEffectiveCharsPerPage < 28 &&
      nonEmptyPageCount / Math.max(1, pageCount) < 0.4);

  return {
    status: (isScanLike ? "scan_like" : "text_ready") as Extract<
      PdfExtractStatus,
      "scan_like" | "text_ready"
    >,
    reason: isScanLike
      ? "PDF 可以预览，但文本层极少或为空，系统判定它更像扫描版/图片版 PDF。"
      : undefined,
    averageEffectiveCharsPerPage,
    nonEmptyPageCount,
  };
}

export async function extractTextFromPdf(
  file: File,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<PdfParseResult> {
  try {
    const pdf = await openPdf(file);
    signal?.throwIfAborted();
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new RangeError("课件超过 " + MAX_PDF_PAGES + " 页，请拆分后上传。");
    }
    onProgress?.(0, pdf.numPages);

    const pages: string[] = [];
    const footerCandidates: number[][] = [];
    let textLength = 0;

    for (let i = 1; i <= pdf.numPages; i += 1) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const footer: number[] = [];
      const pageText = textContent.items
        .map((item) => {
          if (!("str" in item)) return "";
          if (/^\d{1,4}$/u.test(item.str.trim())) {
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            if (x >= viewport.width * 0.55 && y >= viewport.height * 0.89) footer.push(Number(item.str));
          }
          return item.str + (item.hasEOL ? "\n" : " ");
        })
        .join("")
        .replace(/[ \t]+/gu, " ")
        .trim();
      textLength += pageText.length;
      if (textLength > MAX_PDF_TEXT_CHARS) throw new RangeError("课件文字过多，请拆分后上传。");
      pages.push(pageText);
      footerCandidates.push(footer);
      onProgress?.(i, pdf.numPages);
    }

    const documentLabels = await pdf.getPageLabels();
    const numericLabels = documentLabels?.map((label) => /^\d{1,5}$/u.test(label) ? label : null);
    const labels = numericLabels?.some((label, index) => label && label !== String(index + 1))
      ? numericLabels : inferPrintedPdfLabels(footerCandidates);
    const fullText = pages.filter(Boolean).join("\n\n");
    const metrics = determineExtractStatus(pages, pdf.numPages);

    return {
      pages,
      labels,
      fullText,
      pageCount: pdf.numPages,
      status: metrics.status,
      reason: metrics.reason,
      averageEffectiveCharsPerPage: metrics.averageEffectiveCharsPerPage,
      nonEmptyPageCount: metrics.nonEmptyPageCount,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    const classified = error instanceof RangeError
      ? { status: "parse_error" as const, reason: error.message }
      : classifyPdfError(error);
    return {
      pages: [],
      labels: [],
      fullText: "",
      pageCount: 0,
      status: classified.status,
      reason: classified.reason,
      averageEffectiveCharsPerPage: 0,
      nonEmptyPageCount: 0,
    };
  }
}

function dedupeAndClampPageNumbers(pageNumbers: number[], pageCount: number) {
  return Array.from(
    new Set(
      pageNumbers.filter(
        (pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount
      )
    )
  ).sort((a, b) => a - b);
}

export async function renderPdfPagesToImages(
  file: File,
  pageNumbers: number[],
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
) {
  const pdf = await openPdf(file);
  signal?.throwIfAborted();
  const safePageNumbers = dedupeAndClampPageNumbers(pageNumbers, pdf.numPages);

  const targetWidth = safePageNumbers.length > 3 ? 900 : 1280;
  const quality = safePageNumbers.length > 3 ? 0.72 : 0.86;
  let completed = 0;
  onProgress?.(completed, safePageNumbers.length);

  const renderedPages = await Promise.all(
    safePageNumbers.map(async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      signal?.throwIfAborted();
      const scale = Math.min(2, targetWidth / Math.max(1, baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("无法创建 Canvas 上下文");
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const task = page.render({ canvas, canvasContext: context, viewport });
      const cancel = () => task.cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        await task.promise;
        signal?.throwIfAborted();
        const imageUrl = canvas.toDataURL("image/jpeg", quality);
        onProgress?.(++completed, safePageNumbers.length);
        return { pageNumber, imageUrl };
      } finally {
        signal?.removeEventListener("abort", cancel);
        canvas.width = 0;
        canvas.height = 0;
      }
    })
  );

  return {
    pageCount: pdf.numPages,
    pages: renderedPages,
  };
}
