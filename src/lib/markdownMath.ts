const LATEX_COMMAND_PATTERN =
  /\\(?:frac|dfrac|tfrac|int|lim|sum|sqrt|sin|cos|tan|ln|log|pi|nu|forall|exists|in|infty|alpha|beta|gamma|theta|phi|omega|mu|tau|mathbb|mathrm|mathcal|operatorname|cdot|times|leq?|geq?|neq|to|rightarrow|left|right|quad|qquad|begin|end)\b/u;

interface MarkdownSection {
  text: string;
  fenced: boolean;
}

function splitFencedMarkdown(content: string): MarkdownSection[] {
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];
  let textStart = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const codeFence = lines[index].match(/^[ \t]*(\x60{3,}|~{3,})/u)?.[1];
    const mathFence = lines[index].match(/^[ \t]*(\${2,})[ \t]*$/u)?.[1];
    const fence = codeFence ?? mathFence;
    if (!fence) continue;

    let end = index + 1;
    for (; end < lines.length; end += 1) {
      const candidate = lines[end].trim();
      if (candidate.startsWith(fence) && [...candidate].every((char) => char === fence[0])) break;
    }
    if (mathFence && end === lines.length) continue;

    if (textStart < index) sections.push({ text: lines.slice(textStart, index).join("\n"), fenced: false });
    sections.push({ text: lines.slice(index, end + 1).join("\n"), fenced: true });
    index = end;
    textStart = end + 1;
  }
  if (textStart < lines.length) sections.push({ text: lines.slice(textStart).join("\n"), fenced: false });
  return sections;
}

export function splitMarkdownRenderLines(content: string): string[] {
  return splitFencedMarkdown(content).flatMap(({ text, fenced }) => fenced ? [text] : text.split("\n"));
}

function repairFormulaBody(candidate: string) {
  return candidate
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\{2,}(?=[A-Za-z])/gu, "\\")
    .replace(/\\+\$/gu, "$")
    .replace(/\$\$/g, "")
    .replace(/^[$\s]+|[$\s]+$/g, "")
    .replace(/\{\$(?=\\?[A-Za-z])/gu, "{")
    .replace(/\$(?=\})/gu, "")
    .replace(/∀/g, "\\forall ")
    .replace(/∃/g, "\\exists ")
    .replace(/∈/g, "\\in ")
    .replace(/ℝ/g, "\\mathbb{R}")
    .replace(/α\s*([0-9]+)/g, "\\alpha_$1")
    .replace(/β\s*([0-9]+)/g, "\\beta_$1")
    .replace(/γ\s*([0-9]+)/g, "\\gamma_$1")
    .replace(/θ\s*([0-9]+)/g, "\\theta_$1")
    .replace(/φ\s*([0-9]+)/g, "\\phi_$1")
    .replace(/ω\s*([0-9]+)/g, "\\omega_$1")
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
    .replace(/(^|[^\\])frac(?=\s*\{)/gu, "$1\\frac")
    .replace(/(^|[^\\])int(?=\s*[_{])/gu, "$1\\int")
    .replace(/(^|[^\\])sum(?=\s*[_{])/gu, "$1\\sum")
    .replace(/(^|[^\\])sqrt(?=\s*[\[{])/gu, "$1\\sqrt")
    .replace(/(^|[\s(,，;；:：])sin(?=\s*[\[(\\])/gu, "$1\\sin")
    .replace(/(^|[\s(,，;；:：])cos(?=\s*[\[(\\])/gu, "$1\\cos")
    .replace(/(^|[\s(,，;；:：])tan(?=\s*[\[(\\])/gu, "$1\\tan")
    .replace(/(^|[\s(,，;；:：])ln(?=\s*[\[(\\])/gu, "$1\\ln")
    .replace(/(^|[\s(,，;；:：])log(?=\s*[\[(\\])/gu, "$1\\log")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFormula(candidate: string) {
  const text = candidate.trim();
  if (!/[\p{L}\p{N}\\]/u.test(text) || /[$\x60]|\]\(|:\/\/|\.[A-Za-z]{2,}\b/u.test(text) ||
      /^(?:<\/?[A-Za-z]|(?:const|let|var|return|import|export|def)\s)/u.test(text) ||
      /^(?:#{1,6}|[-*+]|[0-9]+[.)]|>)\s/u.test(text)) return false;

  const words = text.replace(/\\(?:text|mathrm|operatorname)\{[^{}]*\}/gu, "").replace(/\\[A-Za-z]+/gu, "");
  if (/\p{Script=Han}|\p{L}{2,}\s+\p{L}{2,}/u.test(words)) return false;

  return LATEX_COMMAND_PATTERN.test(text) ||
    /[=<>≤≥≈≠∀∃∈ℝ∫∑∞±√]/u.test(text) ||
    /[A-Za-z0-9α-ωΑ-Ω)\]}][_^](?:\{|[A-Za-z0-9α-ωΑ-Ω])/u.test(text) ||
    (/[/]/u.test(text) && /\d/u.test(text) && /[A-Za-zα-ωΑ-Ω]/u.test(text)) ||
    /^[A-Za-z]\w*\([A-Za-z0-9_+\-,\s]+\)$/u.test(text);
}

function displayFormula(body: string) {
  return "$$\n" + body.trim() + "\n$$";
}

function normalizeInlineDelimiters(line: string) {
  const tokens = /(\x60+)[^\n]*?\1|\\+(\${1,2})([^$\n]+?)\\+\2(?!\$)|(?<![\\$])(\${1,2})(?!\$)([^$\n]+?)(\${1,2})(?!\$)/gu;
  return line.replace(tokens, (match, codeFence, escaped, escapedBody, opening, body, closing) => {
    if (codeFence) return match;
    if (escaped) {
      return looksLikeFormula(escapedBody) || /^\p{L}$/u.test(escapedBody.trim())
        ? escaped + repairFormulaBody(escapedBody) + escaped
        : match;
    }
    if (opening !== closing && looksLikeFormula(body)) return "$" + repairFormulaBody(body) + "$";
    if (opening === closing && !/\\begin\b/u.test(body) && /\\{2,}(?=[A-Za-z])/u.test(body)) {
      return opening + repairFormulaBody(body) + closing;
    }
    return match;
  });
}

function normalizeFormulaLine(line: string) {
  const normalized = normalizeInlineDelimiters(line);
  const trimmed = normalized.trim();
  const display = trimmed.match(/^\$\$([^$\n]+)\$\$$/u);
  if (display) return "\n" + displayFormula(display[1]) + "\n";

  const list = normalized.match(/^([ \t]*(?:[-*+]|[0-9]+[.)])[ \t]+)(.+)$/u);
  if (list && looksLikeFormula(list[2])) return list[1] + "$" + repairFormulaBody(list[2]) + "$";

  const wrapped = /^\$[^$\n]+\$$/u.test(trimmed);
  const standalone = trimmed.replace(/^\$+|\$+$/gu, "").trim();
  if (!wrapped && looksLikeFormula(standalone)) {
    return "\n" + displayFormula(repairFormulaBody(standalone)) + "\n";
  }

  const label = normalized.match(/^(.+[：:])[ \t]*(.+)$/u);
  if (label) {
    const candidate = label[2].trim().replace(/^\$+|\$+$/gu, "").trim();
    if (!/^\$[^$\n]+\$$/u.test(label[2].trim()) && looksLikeFormula(candidate)) {
      return label[1] + " $" + repairFormulaBody(candidate) + "$";
    }
  }

  if ([...normalized.matchAll(/(?<!\\)\$/gu)].length % 2 === 1) {
    return normalized.replace(/(?<![\\$])\$(?!\$)([^$\n]+)$/u, (match, body: string) =>
      looksLikeFormula(body) ? "$" + repairFormulaBody(body) + "$" : match);
  }
  return normalized;
}

function mergeFormulaContinuations(lines: string[]) {
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = line.match(/^(.+[：:])[ \t]*\${1,2}[ \t]*([^$\n]*)$/u);
    const bareStart = looksLikeFormula(line) && (/[=<>+\-*/]\s*$/u.test(line) ||
      /^[ \t]*\{/u.test(lines[index + 1] ?? ""));
    if (!label && !bareStart) {
      result.push(line);
      continue;
    }

    const pieces = [label?.[2] ?? line];
    let end = index + 1;
    for (; end < lines.length; end += 1) {
      const continuation = lines[end].trim();
      const body = continuation.replace(/\$+$/u, "").trim();
      if (body && !looksLikeFormula(body) && !/^(?:\\[A-Za-z]+|[=+*/{([])/u.test(body)) break;
      if (!continuation) break;
      if (body) pieces.push(body);
      if (/\$$/u.test(continuation)) {
        end += 1;
        break;
      }
    }
    const candidate = pieces.join(" ").trim();
    if (end > index + 1 && looksLikeFormula(candidate)) {
      result.push(label ? label[1] + " $" + repairFormulaBody(candidate) + "$" : candidate);
      index = end - 1;
    } else {
      result.push(line);
    }
  }
  return result;
}

export function normalizeLatexContent(content: string) {
  const clean = content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").replace(/\r\n?/gu, "\n");
  return splitFencedMarkdown(clean).map((section) => {
    if (section.fenced) return section.text;
    const delimiters = /(\x60+)[^\n]*?\1|\\+\[([\s\S]*?)\\+\]|\\+\(([\s\S]*?)\\+\)|(^[ \t]*\\begin\{(aligned|alignedat|gathered|cases|[bpvVB]?matrix|array)\}[\s\S]*?\\end\{\5\}[ \t]*$)/gmu;
    const converted = section.text.replace(delimiters, (match, codeFence, display, inline, environment) => {
      if (codeFence) return match;
      if (inline !== undefined) return "$" + repairFormulaBody(inline) + "$";
      return "\n\n" + displayFormula(display ?? environment) + "\n\n";
    }).replace(/^([ \t]*)(?:\\+\${2}|(?:\\+\$){2})[ \t]*$/gmu, (_, indent: string) => indent + "$$");
    return splitFencedMarkdown(converted).map(({ text, fenced }) =>
      fenced ? text : mergeFormulaContinuations(text.split("\n")).map(normalizeFormulaLine).join("\n")
    ).join("\n");
  }).join("\n");
}
