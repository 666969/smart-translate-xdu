/**
 * PDF 文本提取工具 — 基于 pdfjs-dist
 */

export interface PdfParseResult {
  pages: string[];
  fullText: string;
  pageCount: number;
}

export async function extractTextFromPdf(file: File): Promise<PdfParseResult> {
  const pdfjs = await import("pdfjs-dist");

  // Set worker source
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if ("str" in item) {
          return item.str;
        }
        return "";
      })
      .join(" ");
    pages.push(pageText);
  }

  return {
    pages,
    fullText: pages.join("\n\n"),
    pageCount: pdf.numPages,
  };
}
