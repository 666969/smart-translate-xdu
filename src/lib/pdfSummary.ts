import { splitMarkdownRenderLines } from "./markdownMath";

const noticeLabel = /^[ \t]{0,3}(?:>[ \t]*)?(?:#{1,6}[ \t]+)?(?:\*\*|__)?(?:说明|备注|注)(?:\*\*|__)?[ \t]*[：:]/u;
const sourceNotice = /摘录|乱码|符号缺失|图片页|无文字信息|可辨[认识]的(?:内容|文字)|(?:可提取|提取到)的?(?:文字|文本)|(?:文字|文本)(?:提取|识别)/u;

export function cleanPdfSummary(summary: string) {
  const lines = splitMarkdownRenderLines(summary.replace(/\r\n?/gu, "\n"));
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (noticeLabel.test(line)) {
      let end = index + 1;
      if (/^[ \t]{0,3}>/u.test(line)) {
        while (/^[ \t]{0,3}>/u.test(lines[end] ?? "")) end += 1;
      }
      if (sourceNotice.test(lines.slice(index, end).join("\n"))) {
        index = end - 1;
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n").trim();
}
