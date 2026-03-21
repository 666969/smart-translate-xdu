import type { VocabItem, WrongAnswerItem } from "@/lib/db";

export interface NotebookDashboardActivityDay {
  dateKey: string;
  label: string;
  vocabCount: number;
  wrongCount: number;
  totalCount: number;
}

export interface NotebookDashboardStats {
  totalVocabs: number;
  dueVocabs: number;
  unresolvedWrongAnswers: number;
  resolvedWrongAnswers: number;
  activity7d: NotebookDashboardActivityDay[];
  statusSummary: {
    tone: "amber" | "rose" | "emerald";
    title: string;
    description: string;
  };
}

export interface SprintPackTerm {
  id: number | null;
  termFr: string;
  termZh: string;
  definitionZh: string;
  isDue: boolean;
  createdAt: number;
}

export interface SprintPackWrongAnswer {
  id: number | null;
  questionSummary: string;
  wrongOption: string;
  answerZh: string;
  resolved: boolean;
  createdAt: number;
}

export interface SprintPackData {
  generatedAt: number;
  overview: {
    totalVocabs: number;
    dueVocabs: number;
    unresolvedWrongAnswers: number;
    resolvedWrongAnswers: number;
  };
  topTerms: SprintPackTerm[];
  highRiskWrongAnswers: SprintPackWrongAnswer[];
  advice: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TEXT_FALLBACK = "暂无补充说明";

function resolveNow(now?: Date | number) {
  if (now instanceof Date) {
    return new Date(now);
  }

  if (typeof now === "number") {
    return new Date(now);
  }

  return new Date();
}

function startOfLocalDay(input: Date) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDisplayDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cleanMarkdownToPlainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function getStatusSummary(
  dueVocabs: number,
  unresolvedWrongAnswers: number
): NotebookDashboardStats["statusSummary"] {
  if (dueVocabs >= 5 && dueVocabs >= unresolvedWrongAnswers) {
    return {
      tone: "amber",
      title: "优先复习生词",
      description: `当前有 ${dueVocabs} 个待复习术语，先完成一轮艾宾浩斯复习更划算。`,
    };
  }

  if (unresolvedWrongAnswers >= 3 && unresolvedWrongAnswers > dueVocabs) {
    return {
      tone: "rose",
      title: "优先清理错题",
      description: `当前有 ${unresolvedWrongAnswers} 道待巩固错题，建议先回看错因与正确答案。`,
    };
  }

  return {
    tone: "emerald",
    title: "可以开始冲刺",
    description: "当前学习压力不高，适合生成考前冲刺包并做一次快速总览。",
  };
}

function buildActivityDays(
  vocabs: VocabItem[],
  wrongAnswers: WrongAnswerItem[],
  now: Date
) {
  const today = startOfLocalDay(now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * DAY_MS);
    return {
      date,
      dateKey: formatDateKey(date),
      label: formatDayLabel(date),
      vocabCount: 0,
      wrongCount: 0,
      totalCount: 0,
    };
  });

  const dayMap = new Map(days.map((item) => [item.dateKey, item]));

  for (const vocab of vocabs) {
    const key = formatDateKey(new Date(vocab.createdAt));
    const target = dayMap.get(key);
    if (target) {
      target.vocabCount += 1;
      target.totalCount += 1;
    }
  }

  for (const wrongAnswer of wrongAnswers) {
    const key = formatDateKey(new Date(wrongAnswer.createdAt));
    const target = dayMap.get(key);
    if (target) {
      target.wrongCount += 1;
      target.totalCount += 1;
    }
  }

  return days.map((item) => ({
    dateKey: item.dateKey,
    label: item.label,
    vocabCount: item.vocabCount,
    wrongCount: item.wrongCount,
    totalCount: item.totalCount,
  }));
}

function buildSprintAdvice(
  overview: SprintPackData["overview"],
  hasTopTerms: boolean,
  hasWrongAnswers: boolean
) {
  if (
    overview.totalVocabs === 0 &&
    overview.unresolvedWrongAnswers === 0 &&
    overview.resolvedWrongAnswers === 0
  ) {
    return [
      "先在翻译结果里收藏 5-10 个高频术语，冲刺包会优先帮你整理这些核心词。",
      "做一轮课件精读小测，把第一批错题积累起来，后续就能形成高风险错题清单。",
      "当前适合先完成输入和首轮练习，等数据积累后再导出正式冲刺包。",
    ];
  }

  const advice: string[] = [];

  if (overview.dueVocabs > 0) {
    advice.push(`先完成 ${overview.dueVocabs} 个待复习生词，优先把记忆曲线拉回正轨。`);
  }

  if (overview.unresolvedWrongAnswers > 0) {
    advice.push(
      `逐题回看 ${overview.unresolvedWrongAnswers} 道待巩固错题，重点记住错因和正确答案。`
    );
  }

  if (overview.totalVocabs >= 12) {
    advice.push("优先过一遍高频术语清单，考前先确保核心词汇不过夜。");
  }

  if (overview.dueVocabs <= 3 && overview.unresolvedWrongAnswers <= 1) {
    advice.push("当前欠账不多，可以进入考前快速总览，重点做查漏补缺。");
  }

  const fallbacks = [
    hasTopTerms
      ? "术语清单建议采用“法语词形 -> 中文含义 -> 使用场景”三步速记法。"
      : "如果术语还不多，先把今天新增内容过一遍，保持输入不断档。",
    hasWrongAnswers
      ? "错题不要只背答案，至少用一句话复述为什么会错。"
      : "当前错题压力较低，可以把时间分配给术语巩固和章节框架回顾。",
    "考前最后一轮复习以高频、易混、刚错过的内容为主，不建议再大范围扩张新内容。",
  ];

  for (const item of fallbacks) {
    if (advice.length >= 4) {
      break;
    }

    if (!advice.includes(item)) {
      advice.push(item);
    }
  }

  return advice.slice(0, advice.length > 3 ? 4 : 3);
}

export function formatPageReferences(pageNumbers: number[]) {
  const normalized = Array.from(
    new Set(
      pageNumbers.filter(
        (pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0
      )
    )
  ).sort((a, b) => a - b);

  if (normalized.length === 0) {
    return "";
  }

  const segments: string[] = [];
  let start = normalized[0];
  let previous = normalized[0];

  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    segments.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = current;
    previous = current;
  }

  segments.push(start === previous ? `${start}` : `${start}-${previous}`);

  return `参考页码：第 ${segments.join("、")} 页`;
}

export function buildNotebookDashboardStats(
  vocabs: VocabItem[],
  wrongAnswers: WrongAnswerItem[],
  now?: Date | number
): NotebookDashboardStats {
  const currentTime = resolveNow(now);
  const currentTimestamp = currentTime.getTime();
  const totalVocabs = vocabs.length;
  const dueVocabs = vocabs.filter((item) => item.nextReviewAt <= currentTimestamp).length;
  const unresolvedWrongAnswers = wrongAnswers.filter((item) => !item.resolved).length;
  const resolvedWrongAnswers = wrongAnswers.length - unresolvedWrongAnswers;

  return {
    totalVocabs,
    dueVocabs,
    unresolvedWrongAnswers,
    resolvedWrongAnswers,
    activity7d: buildActivityDays(vocabs, wrongAnswers, currentTime),
    statusSummary: getStatusSummary(dueVocabs, unresolvedWrongAnswers),
  };
}

export function buildSprintPack(
  vocabs: VocabItem[],
  wrongAnswers: WrongAnswerItem[],
  now?: Date | number
): SprintPackData {
  const currentTime = resolveNow(now);
  const generatedAt = currentTime.getTime();
  const overview = buildNotebookDashboardStats(vocabs, wrongAnswers, generatedAt);

  const topTerms = [...vocabs]
    .sort((left, right) => {
      const leftDue = left.nextReviewAt <= generatedAt ? 1 : 0;
      const rightDue = right.nextReviewAt <= generatedAt ? 1 : 0;

      if (leftDue !== rightDue) {
        return rightDue - leftDue;
      }

      return right.createdAt - left.createdAt;
    })
    .slice(0, 12)
    .map((item) => ({
      id: item.id ?? null,
      termFr: item.term_fr,
      termZh: item.term_zh,
      definitionZh: item.definition_zh,
      isDue: item.nextReviewAt <= generatedAt,
      createdAt: item.createdAt,
    }));

  const highRiskWrongAnswers = [...wrongAnswers]
    .sort((left, right) => {
      const leftPriority = left.resolved ? 0 : 1;
      const rightPriority = right.resolved ? 0 : 1;

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return right.createdAt - left.createdAt;
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id ?? null,
      questionSummary: truncateText(
        cleanMarkdownToPlainText(item.question_zh) || "未命名题目",
        72
      ),
      wrongOption: item.wrongOption || DEFAULT_TEXT_FALLBACK,
      answerZh: item.answer_zh || DEFAULT_TEXT_FALLBACK,
      resolved: item.resolved,
      createdAt: item.createdAt,
    }));

  return {
    generatedAt,
    overview: {
      totalVocabs: overview.totalVocabs,
      dueVocabs: overview.dueVocabs,
      unresolvedWrongAnswers: overview.unresolvedWrongAnswers,
      resolvedWrongAnswers: overview.resolvedWrongAnswers,
    },
    topTerms,
    highRiskWrongAnswers,
    advice: buildSprintAdvice(
      {
        totalVocabs: overview.totalVocabs,
        dueVocabs: overview.dueVocabs,
        unresolvedWrongAnswers: overview.unresolvedWrongAnswers,
        resolvedWrongAnswers: overview.resolvedWrongAnswers,
      },
      topTerms.length > 0,
      highRiskWrongAnswers.length > 0
    ),
  };
}

export function buildSprintPackMarkdown(pack: SprintPackData) {
  const lines: string[] = [];

  lines.push("# 智译西电 - 考前冲刺包");
  lines.push("");
  lines.push(`> 生成时间：${formatDisplayDateTime(pack.generatedAt)}`);
  lines.push("");
  lines.push("## 冲刺概览");
  lines.push("");
  lines.push(`- 总生词：${pack.overview.totalVocabs}`);
  lines.push(`- 待复习：${pack.overview.dueVocabs}`);
  lines.push(`- 待巩固错题：${pack.overview.unresolvedWrongAnswers}`);
  lines.push(`- 已掌握错题：${pack.overview.resolvedWrongAnswers}`);
  lines.push("");
  lines.push("## 高频术语清单");
  lines.push("");

  if (pack.topTerms.length === 0) {
    lines.push("- 当前还没有可纳入冲刺包的术语。");
  } else {
    pack.topTerms.forEach((term, index) => {
      lines.push(`### ${index + 1}. ${term.termFr}${term.isDue ? "（待复习）" : ""}`);
      lines.push(term.termZh || DEFAULT_TEXT_FALLBACK);
      lines.push("");
      lines.push(term.definitionZh || DEFAULT_TEXT_FALLBACK);
      lines.push("");
    });
  }

  lines.push("## 高风险错题清单");
  lines.push("");

  if (pack.highRiskWrongAnswers.length === 0) {
    lines.push("- 当前没有需要重点关注的错题。");
  } else {
    pack.highRiskWrongAnswers.forEach((item, index) => {
      lines.push(
        `### ${index + 1}. ${item.questionSummary}${item.resolved ? "（已掌握）" : "（待巩固）"}`
      );
      lines.push(`- 你的错误答案：${item.wrongOption}`);
      lines.push(`- 正确答案：${item.answerZh}`);
      lines.push("");
    });
  }

  lines.push("## 临考建议");
  lines.push("");
  pack.advice.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*由智译西电生成*");

  return lines.join("\n");
}
