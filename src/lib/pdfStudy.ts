import { glossaryData } from "@/data/glossaryData";
import { pdfPageTitle, type PdfCoverage, type PdfSource } from "./pdfNavigation";

const MAX_SUMMARY_TEXT = 36_000;
const MAX_PASSAGE_TEXT = 2_000;
const stopwords = new Set([
  "comment", "quel", "quelle", "quels", "quelles", "est", "sont", "dans", "les", "des", "une", "avec",
  "what", "when", "where", "which", "does", "and", "the", "how", "for", "from", "this", "page", "pdf",
]);

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

const aliases = [
  ...glossaryData.flatMap((book) => book.modules.flatMap((section) => section.words.map((word) =>
    [word.term_zh, word.term_fr, word.term_en]))),
  ["米勒效应", "effet miller", "miller effect"],
  ["截止频率", "fréquence de coupure", "cutoff frequency", "cut-off frequency"],
  ["双极型晶体管", "双极性晶体管", "transistor bipolaire", "bipolar junction transistor", "bjt"],
  ["偏置", "polarisation", "biasing", "bias point"],
  ["饱和区", "饱和状态", "régime saturé", "saturation"],
  ["放大区", "有源区", "régime actif", "active region"],
].map((group) => group.map(normalize).filter((term) => term.length > 1));

function containsTerm(text: string, term: string) {
  const index = text.indexOf(term);
  if (index < 0) return false;
  if (/\p{Script=Han}/u.test(term)) return true;
  return new RegExp("(?<![\\p{L}\\p{N}])" + term.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&") +
    "(?![\\p{L}\\p{N}])", "u").test(text);
}

function questionTerms(question: string) {
  const normalized = normalize(question);
  const dictionary = aliases.filter((group) => group.some((term) => containsTerm(normalized, term))).flat();
  const words = (normalized.match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((term) => !stopwords.has(term));
  const chinese = normalized.match(/[\u4e00-\u9fff]{2,}/gu) ?? [];
  return {
    dictionary: [...new Set(dictionary)],
    other: [...new Set([...words, ...chinese])].filter((term) => !dictionary.includes(term)).slice(0, 20),
  };
}

function excerpt(text: string, anchor: number, length: number) {
  const start = Math.max(0, Math.min(anchor - Math.floor(length / 3), text.length - length));
  return text.slice(start, start + length).trim();
}

export function selectPdfSources(
  question: string,
  pages: string[],
  labels: (string | null)[],
  selected: number[] = [],
): PdfSource[] {
  const terms = questionTerms(question);
  const candidates = (selected.length ? selected : pages.map((_, index) => index + 1))
    .flatMap((page) => {
      const text = pages[page - 1]?.trim();
      if (!text) return [];
      const normalized = normalize(text);
      const strong = terms.dictionary.filter((term) => containsTerm(normalized, term));
      const weak = terms.other.filter((term) => containsTerm(normalized, term));
      const anchorTerm = [...strong, ...weak].sort((a, b) => b.length - a.length)[0];
      const quote = excerpt(text, anchorTerm ? normalized.indexOf(anchorTerm) : 0, MAX_PASSAGE_TEXT);
      return [{ page, label: labels[page - 1] ?? undefined, quote, score: strong.length * 5 + weak.length }];
    });

  const relevant = selected.length ? candidates : candidates
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, 4);
  return relevant.map(({ page, label, quote }) => ({ page, label, quote }));
}

export function buildPdfSummaryContext(pages: string[], labels: (string | null)[]) {
  const available = pages.flatMap((text, index) => text.trim() ? [{ text: text.trim(), page: index + 1 }] : []);
  const totalLength = available.reduce((sum, { text }) => sum + text.length, 0);
  const excerpted = totalLength > MAX_SUMMARY_TEXT;
  const pageBudget = Math.floor(MAX_SUMMARY_TEXT / Math.max(1, available.length));
  const coverage: PdfCoverage = { pages: available.map(({ page }) => page), total: pages.length, excerpted };
  const context = available.map(({ text, page }) => {
    const content = excerpted && text.length > pageBudget
      ? text.slice(0, Math.ceil(pageBudget * 0.7)) + " […] " + text.slice(-Math.floor(pageBudget * 0.3))
      : text;
    return pdfPageTitle(page, labels[page - 1]) + "\n" + content;
  }).join("\n\n");
  return { context, coverage };
}
