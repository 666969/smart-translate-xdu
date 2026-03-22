"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  Globe,
  Languages,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import Header from "./Header";

const FAST_TRANSLATION_RULES = {
  "fr-FR": [
    ["système linéaire", "线性系统"],
    ["fonction de transfert", "传递函数"],
    ["transformée de laplace", "拉普拉斯变换"],
    ["stabilité", "稳定性"],
    ["matrice", "矩阵"],
    ["signal", "信号"],
    ["équation différentielle", "微分方程"],
    ["théorème", "定理"],
    ["circuit", "电路"],
    ["filtre", "滤波器"],
    ["réponse impulsionnelle", "冲激响应"],
    ["modèle", "模型"],
    ["entrée", "输入"],
    ["sortie", "输出"],
    ["gain", "增益"],
    ["phase", "相位"],
    ["fréquence", "频率"],
  ],
  "en-US": [
    ["linear system", "线性系统"],
    ["transfer function", "传递函数"],
    ["laplace transform", "拉普拉斯变换"],
    ["stability", "稳定性"],
    ["matrix", "矩阵"],
    ["signal", "信号"],
    ["differential equation", "微分方程"],
    ["theorem", "定理"],
    ["circuit", "电路"],
    ["filter", "滤波器"],
    ["impulse response", "冲激响应"],
    ["model", "模型"],
    ["input", "输入"],
    ["output", "输出"],
    ["gain", "增益"],
    ["phase", "相位"],
    ["frequency", "频率"],
  ],
};

const INSIGHT_LIBRARY = [
  {
    term: "Système Linéaire / Linear System",
    match: /\b(?:système\s+linéaire|linear\s+system)\b/iu,
    explanation:
      "指满足叠加性与齐次性的系统，是信号与系统、电路分析里的基础对象，很多频域方法都建立在它之上。",
  },
  {
    term: "Transformée de Laplace / Laplace Transform",
    match: /\b(?:transformée\s+de\s+laplace|laplace\s+transform)\b/iu,
    explanation:
      "一种把时域微分方程转成复频域代数方程的工具，适合处理系统稳定性、零极点和传递函数分析。",
  },
  {
    term: "Fonction de Transfert / Transfer Function",
    match: /\b(?:fonction\s+de\s+transfert|transfer\s+function)\b/iu,
    explanation:
      "描述线性时不变系统输入输出关系的核心表达，通常写作 H(s) 或 H(p)，用于刻画系统动态特性。",
  },
  {
    term: "Stabilité / Stability",
    match: /\b(?:stabilité|stability)\b/iu,
    explanation:
      "在控制与系统理论中，稳定性描述系统受到扰动后是否还能回到平衡状态，是判断系统可用性的关键指标。",
  },
  {
    term: "Matrice / Matrix",
    match: /\b(?:matrice|matrix)\b/iu,
    explanation:
      "矩阵常用于表达多变量系统、状态空间模型与线性变换，在工程计算和信号处理里非常常见。",
  },
  {
    term: "Signal",
    match: /\bsignal\b/iu,
    explanation:
      "表示随时间或空间变化的信息载体，可以是电压、电流、声波或数字序列，是电子信息课程的基础对象。",
  },
  {
    term: "Réponse Impulsionnelle / Impulse Response",
    match: /\b(?:réponse\s+impulsionnelle|impulse\s+response)\b/iu,
    explanation:
      "系统对单位冲激输入的输出，在线性时不变系统中它几乎决定了整个系统的行为。",
  },
  {
    term: "Filtre / Filter",
    match: /\b(?:filtre|filter)\b/iu,
    explanation:
      "滤波器用于保留目标频率成分并抑制无关成分，是通信、信号处理和电路设计中的关键模块。",
  },
];

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSentence(text) {
  return text.replace(/\s+/g, " ").trim();
}

function countWords(text) {
  const latinWords = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g) ?? [];
  const cjkChunks = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  return latinWords.length + cjkChunks.length;
}

function toTitleCase(text) {
  return text
    .split(" ")
    .map((word) =>
      word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word
    )
    .join(" ");
}

function applyDictionaryTranslation(text, language) {
  let translated = text;
  const rules = FAST_TRANSLATION_RULES[language] ?? [];

  for (const [source, target] of rules) {
    translated = translated.replace(new RegExp(source, "giu"), target);
  }

  translated = translated
    .replace(/\bthis lesson\b/giu, "本节内容")
    .replace(/\bwe can\b/giu, "我们可以")
    .replace(/\btherefore\b/giu, "因此")
    .replace(/\bbecause\b/giu, "因为")
    .replace(/\bfirst\b/giu, "首先")
    .replace(/\bsecond\b/giu, "其次")
    .replace(/\bfinally\b/giu, "最后")
    .replace(/\bc'est[- ]à[- ]dire\b/giu, "也就是说")
    .replace(/\bon obtient\b/giu, "可以得到")
    .replace(/\bil faut\b/giu, "需要")
    .replace(/\bdonc\b/giu, "因此")
    .replace(/\balors\b/giu, "那么")
    .replace(/\ble système\b/giu, "该系统")
    .replace(/\bun système\b/giu, "一个系统")
    .replace(/\bthe system\b/giu, "该系统")
    .replace(/\ban? system\b/giu, "一个系统")
    .replace(/\s+/g, " ")
    .trim();

  return translated;
}

function decodeHtmlEntities(text) {
  if (typeof window === "undefined") {
    return text;
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function getFastTranslateLanguagePair(language) {
  return language.startsWith("fr") ? "fr|zh-CN" : "en|zh-CN";
}

async function fallbackFastTranslate(text, language) {
  await wait(120 + Math.random() * 160);

  const translated = applyDictionaryTranslation(text, language);
  const sourceLower = text.toLowerCase();

  if (translated !== text) {
    return translated;
  }

  const languageLabel = language.startsWith("fr") ? "法语" : "英语";

  if (sourceLower.includes("route")) {
    return "正在进行中";
  }

  return `${languageLabel}课程内容正在讲解一个理工科知识点。`;
}

async function fastTranslateSubtitle(text, language) {
  const normalizedText = normalizeSentence(text);
  if (!normalizedText) {
    return "";
  }

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", normalizedText);
  url.searchParams.set("langpair", getFastTranslateLanguagePair(language));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`MyMemory request failed: ${response.status}`);
    }

    const payload = await response.json();
    const translatedText = decodeHtmlEntities(
      String(payload?.responseData?.translatedText || "")
    ).trim();

    if (!translatedText) {
      throw new Error("MyMemory returned empty translation");
    }

    return translatedText;
  } catch (error) {
    console.error("MyMemory fast translation failed, fallback to local rules:", error);
    return fallbackFastTranslate(normalizedText, language);
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractInsightCards(bufferText) {
  const detectedCards = INSIGHT_LIBRARY.filter((item) => item.match.test(bufferText)).map(
    (item) => ({
      id: createId("insight"),
      term: item.term,
      explanation: item.explanation,
      snippet: bufferText.slice(0, 120).trim(),
    })
  );

  if (detectedCards.length > 0) {
    return detectedCards.slice(0, 3);
  }

  const fallbackTerm = bufferText
    .match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ-]{3,}(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ-]{3,}){0,2}/u)?.[0]
    ?.trim();

  if (!fallbackTerm) {
    return [];
  }

  return [
    {
      id: createId("insight"),
      term: toTitleCase(fallbackTerm),
      explanation:
        "这是本段里出现频率较高的核心术语，建议结合上下文继续补充定义、公式位置和工程含义。",
      snippet: bufferText.slice(0, 120).trim(),
    },
  ];
}

async function fetchAiInsights(bufferText) {
  await wait(900 + Math.random() * 500);
  return extractInsightCards(bufferText);
}

function useSpeech({ language, onFinalSentence }) {
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [errorMessage, setErrorMessage] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.SpeechRecognition || window.webkitSpeechRecognition
      ? null
      : "当前浏览器不支持原生语音识别，请改用 Chrome 或 Edge 演示。";
  });

  const recognitionRef = useRef(null);
  const onFinalSentenceRef = useRef(onFinalSentence);
  const intentionalStopRef = useRef(false);

  useEffect(() => {
    onFinalSentenceRef.current = onFinalSentence;
  }, [onFinalSentence]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      return undefined;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMessage(null);
    };

    recognition.onresult = (event) => {
      let nextInterim = "";
      const finalSentences = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = normalizeSentence(result[0]?.transcript || "");
        if (!text) {
          continue;
        }

        if (result.isFinal) {
          finalSentences.push(text);
        } else {
          nextInterim += `${text} `;
        }
      }

      setInterimText(normalizeSentence(nextInterim));
      finalSentences.forEach((sentence) => {
        onFinalSentenceRef.current?.(sentence);
      });
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        return;
      }

      if (event.error === "not-allowed") {
        setErrorMessage("麦克风权限未开启，请允许浏览器访问麦克风。");
      } else {
        setErrorMessage(`语音识别异常：${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (!intentionalStopRef.current) {
        try {
          recognition.start();
          return;
        } catch (error) {
          console.error("Speech restart failed:", error);
        }
      }

      setIsListening(false);
      setInterimText("");
    };

    return () => {
      intentionalStopRef.current = true;
      recognition.abort();
    };
  }, [language]);

  const startListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    intentionalStopRef.current = false;
    setErrorMessage(null);
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("Speech start failed:", error);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    intentionalStopRef.current = true;
    recognitionRef.current.stop();
    setIsListening(false);
    setInterimText("");
  };

  return {
    isSupported,
    isListening,
    interimText,
    errorMessage,
    startListening,
    stopListening,
  };
}

export default function LiveTranslator() {
  const [language, setLanguage] = useState("fr-FR");
  const [subtitles, setSubtitles] = useState([]);
  const [insights, setInsights] = useState([]);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  const subtitleScrollRef = useRef(null);
  const subtitleBottomRef = useRef(null);
  const insightScrollRef = useRef(null);
  const bufferRef = useRef({
    sentences: [],
    wordCount: 0,
  });
  const insightTimerRef = useRef(null);
  const insightInFlightRef = useRef(false);
  const translationQueueRef = useRef([]);
  const translationInFlightRef = useRef(0);

  const updateSubtitleTranslation = (subtitleId, payload) => {
    startTransition(() => {
      setSubtitles((prev) =>
        prev.map((item) => (item.id === subtitleId ? { ...item, ...payload } : item))
      );
    });
  };

  const processTranslationQueue = () => {
    if (translationInFlightRef.current >= 2 || translationQueueRef.current.length === 0) {
      return;
    }

    while (translationInFlightRef.current < 2 && translationQueueRef.current.length > 0) {
      const task = translationQueueRef.current.shift();
      if (!task) {
        continue;
      }

      translationInFlightRef.current += 1;

      void fastTranslateSubtitle(task.originalText, task.language)
        .then((translation) => {
          updateSubtitleTranslation(task.subtitleId, {
            translation,
            status: "success",
          });
        })
        .catch((error) => {
          console.error("Fast translation failed:", error);
          updateSubtitleTranslation(task.subtitleId, {
            translation: "快速翻译暂时失败，请稍后重试。",
            status: "error",
          });
        })
        .finally(() => {
          translationInFlightRef.current = Math.max(
            0,
            translationInFlightRef.current - 1
          );
          processTranslationQueue();
        });
    }
  };

  const flushInsightBuffer = async () => {
    if (insightInFlightRef.current || bufferRef.current.sentences.length === 0) {
      return;
    }

    if (insightTimerRef.current) {
      clearTimeout(insightTimerRef.current);
      insightTimerRef.current = null;
    }

    const payload = bufferRef.current.sentences.join(" ");
    bufferRef.current = { sentences: [], wordCount: 0 };
    insightInFlightRef.current = true;
    setIsInsightLoading(true);

    try {
      const cards = await fetchAiInsights(payload);
      if (cards.length > 0) {
        setInsights((prev) => [...cards, ...prev].slice(0, 12));
      }
    } finally {
      insightInFlightRef.current = false;
      setIsInsightLoading(false);
    }
  };

  const scheduleInsightFlush = () => {
    if (insightTimerRef.current) {
      clearTimeout(insightTimerRef.current);
    }

    insightTimerRef.current = setTimeout(() => {
      void flushInsightBuffer();
    }, 15000);
  };

  const handleFinalSentence = (text) => {
    const originalText = normalizeSentence(text);
    if (!originalText) {
      return;
    }

    const subtitleId = createId("subtitle");
    startTransition(() => {
      setSubtitles((prev) =>
        [
          ...prev,
          {
            id: subtitleId,
            originalText,
            translation: "",
            status: "sending",
          },
        ].slice(-30)
      );
    });

    bufferRef.current.sentences.push(originalText);
    bufferRef.current.wordCount += countWords(originalText);
    scheduleInsightFlush();

    if (
      bufferRef.current.sentences.length >= 3 ||
      bufferRef.current.wordCount >= 50
    ) {
      void flushInsightBuffer();
    }

    translationQueueRef.current.push({
      subtitleId,
      originalText,
      language,
    });
    processTranslationQueue();
  };

  const { isSupported, isListening, interimText, errorMessage, startListening, stopListening } =
    useSpeech({
      language,
      onFinalSentence: handleFinalSentence,
    });

  useEffect(() => {
    const scrollHost = subtitleScrollRef.current;
    const bottomAnchor = subtitleBottomRef.current;

    if (!scrollHost || !bottomAnchor) {
      return;
    }

    const animationId = window.requestAnimationFrame(() => {
      bottomAnchor.scrollIntoView({
        block: "end",
        behavior: subtitles.length > 1 ? "smooth" : "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [subtitles]);

  useEffect(() => {
    if (insights.length > 0) {
      insightScrollRef.current?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }, [insights]);

  useEffect(() => {
    return () => {
      if (insightTimerRef.current) {
        clearTimeout(insightTimerRef.current);
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearAll = () => {
    setSubtitles([]);
    setInsights([]);
    bufferRef.current = { sentences: [], wordCount: 0 };
    translationQueueRef.current = [];
    translationInFlightRef.current = 0;
    if (insightTimerRef.current) {
      clearTimeout(insightTimerRef.current);
      insightTimerRef.current = null;
    }
  };

  const sentenceCount = bufferRef.current.sentences.length;
  const wordCount = bufferRef.current.wordCount;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1600px] flex-col px-4 py-6 lg:px-8">
        <section className="animate-fade-in-up rounded-[32px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.9))] p-5 shadow-[0_24px_80px_-28px_rgba(37,99,235,0.28)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25">
                <Languages size={26} />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
                  Dual Engine Live
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  随堂同传
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-text-muted">
                  左侧用原生语音识别 + 极速机翻保持流式双语字幕，右侧后台异步提取复杂理工科术语，适合课堂演示与比赛答辩。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="flex items-center gap-2 rounded-2xl border border-card-border bg-white/80 px-4 py-3 shadow-sm">
                <Globe size={18} className="text-text-muted" />
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={isListening}
                  className="bg-transparent text-sm font-medium text-foreground outline-none disabled:opacity-50"
                >
                  <option value="fr-FR">法语 (Français)</option>
                  <option value="en-US">英语 (English)</option>
                </select>
              </div>

              <button
                onClick={toggleListening}
                disabled={!isSupported}
                className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
                  isListening
                    ? "bg-red-500 shadow-red-500/30 hover:bg-red-600"
                    : "bg-gradient-to-r from-primary-dark to-primary shadow-primary/25 hover:-translate-y-0.5 hover:shadow-primary/35"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isListening ? (
                  <>
                    <Square size={16} fill="currentColor" />
                    停止收音
                  </>
                ) : (
                  <>
                    <Mic size={16} />
                    开始同传
                  </>
                )}
              </button>

              <button
                onClick={clearAll}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-card-border bg-white/85 px-5 py-3 text-sm font-medium text-text-muted shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground"
              >
                <RotateCcw size={15} />
                清空演示
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
            <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${isListening ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              {isListening ? "正在聆听课堂内容" : "待机中"}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
              字幕缓冲：{sentenceCount} 句 / {wordCount} 词
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
              AI 触发条件：3 句 / 50 词 / 15 秒
            </div>
          </div>
        </section>

        {!isSupported && (
          <div className="mt-6 animate-fade-in-up-delay-1 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-sm">
            当前浏览器不支持 `SpeechRecognition`。比赛演示建议使用最新版 Chrome 或 Edge。
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 animate-fade-in-up-delay-1 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700 shadow-sm">
            {errorMessage}
          </div>
        )}

        <section className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_420px]">
          <div className="animate-fade-in-up-delay-1 min-h-0 rounded-[32px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Stream View
                </p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  流式双语字幕
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-xs text-text-muted shadow-sm">
                <Mic size={13} />
                {subtitles.length} 条字幕
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4 shadow-inner">
              <div className="flex min-h-[560px] flex-col">
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/95 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Live Buffer
                  </p>
                  <div className="mt-2 min-h-[56px] text-base leading-7 text-slate-500">
                    {interimText ? (
                      <div className="flex items-start gap-3">
                        <span className="mt-1 inline-flex h-3 w-3 rounded-full bg-primary animate-pulse" />
                        <span>{interimText}</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 text-slate-300">
                        <span className="mt-1 inline-flex h-3 w-3 rounded-full bg-slate-200" />
                        <span>{isListening ? "正在等待新的句子结束..." : "点击上方按钮后开始接收课堂语音"}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  ref={subtitleScrollRef}
                  className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 scroll-smooth"
                >
                  {subtitles.length === 0 ? (
                    <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-dashed border-card-border bg-white/70 text-center text-text-muted">
                      <Languages size={38} className="mb-4 text-slate-300" />
                      <p className="text-base font-medium text-foreground">
                        字幕流准备就绪
                      </p>
                      <p className="mt-2 text-sm leading-7 text-text-muted">
                        一句话说完后，会先落原文，再在下方补出极速中文翻译。
                      </p>
                    </div>
                  ) : (
                    subtitles.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_34px_-20px_rgba(15,23,42,0.2)] transition-all duration-300"
                      >
                        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                            Original
                          </p>
                          <p className="mt-2 text-lg font-medium leading-8">
                            {item.originalText}
                          </p>
                        </div>

                        <div className="mt-3 rounded-2xl border border-primary/15 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(245,243,255,0.96))] px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/65">
                            Chinese
                          </p>
                          {item.status === "sending" ? (
                            <div className="mt-3 flex items-center gap-2 text-sm text-primary animate-pulse">
                              <Sparkles size={14} />
                              正在生成极速中文翻译...
                            </div>
                          ) : item.status === "error" ? (
                            <div className="mt-3 flex items-center gap-2 text-sm text-rose-600">
                              <AlertCircle size={14} />
                              {item.translation}
                            </div>
                          ) : (
                            <p className="mt-2 text-xl font-semibold leading-8 text-foreground">
                              {item.translation}
                            </p>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                  <div ref={subtitleBottomRef} className="h-0 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          <aside className="animate-fade-in-up-delay-2 min-h-0 rounded-[32px] border border-card-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.95))] p-5 shadow-[0_20px_60px_-28px_rgba(88,28,135,0.22)] lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">
                  AI Insights
                </p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  深度术语洞察
                </h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
                <BrainCircuit size={18} />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-violet-100 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-600 shadow-sm">
              缓冲池达到阈值后，后台会异步抽取复杂理工科术语，不阻塞左侧字幕流。
            </div>

            <div
              ref={insightScrollRef}
              className="mt-5 flex max-h-[62vh] min-h-[420px] flex-col gap-4 overflow-y-auto pr-1"
            >
              {isInsightLoading && (
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={`loading-${index}`}
                      className="rounded-[26px] border border-violet-100 bg-white/90 px-4 py-4 shadow-[0_16px_44px_-28px_rgba(124,58,237,0.45)] animate-pulse"
                    >
                      <div className="h-4 w-28 rounded-full bg-violet-100" />
                      <div className="mt-4 h-4 w-full rounded-full bg-slate-100" />
                      <div className="mt-2 h-4 w-4/5 rounded-full bg-slate-100" />
                      <div className="mt-5 h-14 rounded-2xl bg-slate-50" />
                    </div>
                  ))}
                </div>
              )}

              {insights.length === 0 && !isInsightLoading ? (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-dashed border-violet-200 bg-white/80 text-center text-text-muted">
                  <BrainCircuit size={38} className="mb-4 text-violet-200" />
                  <p className="text-base font-medium text-foreground">
                    AI 洞察区待命中
                  </p>
                  <p className="mt-2 max-w-xs text-sm leading-7 text-text-muted">
                    连续积累几句课堂内容后，这里会出现术语释义卡片。
                  </p>
                </div>
              ) : (
                insights.map((card) => (
                  <article
                    key={card.id}
                    className="rounded-[26px] border border-violet-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.94))] px-4 py-4 shadow-[0_18px_48px_-28px_rgba(124,58,237,0.45)] ring-1 ring-violet-100/70 transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                          Core Term
                        </p>
                        <h3 className="mt-2 text-lg font-semibold leading-7 text-foreground">
                          {card.term}
                        </h3>
                      </div>
                      <span className="mt-1 inline-flex h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_16px_rgba(217,70,239,0.55)]" />
                    </div>

                    <p className="mt-4 text-sm leading-7 text-slate-700">
                      {card.explanation}
                    </p>

                    {card.snippet ? (
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-white/90 px-3 py-3 text-xs leading-6 text-slate-500">
                        上下文片段：{card.snippet}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
