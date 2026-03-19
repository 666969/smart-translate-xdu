/**
 * PDF 文本提取工具 — 基于 pdfjs-dist
 */

export type PdfExtractStatus =
  | "text_ready"
  | "scan_like"
  | "worker_error"
  | "parse_error";

export interface PdfParseResult {
  pages: string[];
  fullText: string;
  pageCount: number;
  status: PdfExtractStatus;
  reason?: string;
  averageEffectiveCharsPerPage: number;
  nonEmptyPageCount: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }

  return pdfjsPromise;
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

export async function extractTextFromPdf(file: File): Promise<PdfParseResult> {
  try {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
      pages.push(pageText);
    }

    const fullText = pages.filter(Boolean).join("\n\n");
    const metrics = determineExtractStatus(pages, pdf.numPages);

    return {
      pages,
      fullText,
      pageCount: pdf.numPages,
      status: metrics.status,
      reason: metrics.reason,
      averageEffectiveCharsPerPage: metrics.averageEffectiveCharsPerPage,
      nonEmptyPageCount: metrics.nonEmptyPageCount,
    };
  } catch (error) {
    const classified = classifyPdfError(error);
    return {
      pages: [],
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
  pageNumbers: number[]
) {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const safePageNumbers = dedupeAndClampPageNumbers(pageNumbers, pdf.numPages);

  const targetWidth = safePageNumbers.length > 3 ? 900 : 1100;
  const quality = safePageNumbers.length > 3 ? 0.72 : 0.8;

  const renderedPages = await Promise.all(
    safePageNumbers.map(async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        1.85,
        Math.max(1.1, targetWidth / Math.max(1, baseViewport.width))
      );
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

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      return {
        pageNumber,
        imageUrl: canvas.toDataURL("image/jpeg", quality),
      };
    })
  );

  return {
    pageCount: pdf.numPages,
    pages: renderedPages,
  };
}
