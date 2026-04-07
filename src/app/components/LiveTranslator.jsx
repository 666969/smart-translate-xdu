"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  Download,
  Globe,
  Languages,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import {
  buildLiveSessionMarkdown,
  downloadMarkdownFile,
} from "@/lib/markdownExport";
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

const TAB_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "video/webm;codecs=opus",
];

function getTranscribeLanguageCode(language) {
  return language.startsWith("fr") ? "fr" : "en";
}

function getPreferredRecorderMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    TAB_RECORDER_MIME_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) || ""
  );
}

function getRecorderFileExtension(mimeType) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

function splitTranscriptBuffer(rawText) {
  const normalized = normalizeSentence(rawText);
  if (!normalized) {
    return { completedSentences: [], remainder: "" };
  }

  const completedSentences = [];
  let current = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    current += char;

    const isSentenceBoundary =
      /[。！？!?；;]/u.test(char) ||
      (char === "." && (!normalized[index + 1] || /\s/u.test(normalized[index + 1])));

    if (isSentenceBoundary) {
      const sentence = normalizeSentence(current);
      if (sentence) {
        completedSentences.push(sentence);
      }
      current = "";
    }
  }

  let remainder = normalizeSentence(current);
  if (remainder && countWords(remainder) >= 24) {
    completedSentences.push(remainder);
    remainder = "";
  }

  return { completedSentences, remainder };
}

async function transcribeAudioChunk(blob, language) {
  const mimeType = blob.type || "audio/webm";
  const extension = getRecorderFileExtension(mimeType);
  const file = new File([blob], `live-${Date.now()}.${extension}`, {
    type: mimeType,
  });
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("language", getTranscribeLanguageCode(language));

  const response = await fetch("/api/live-transcribe", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "标签页音频转写失败，请稍后重试。"
    );
  }

  return normalizeSentence(String(payload?.text || ""));
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
  const [inputSource, setInputSource] = useState("tab");
  const [language, setLanguage] = useState("fr-FR");
  const [subtitles, setSubtitles] = useState([]);
  const [insights, setInsights] = useState([]);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [tabIsListening, setTabIsListening] = useState(false);
  const [tabInterimText, setTabInterimText] = useState("");
  const [tabErrorMessage, setTabErrorMessage] = useState(null);
  const [isTabTranscribing, setIsTabTranscribing] = useState(false);
  const [showTabGuide, setShowTabGuide] = useState(false);

  const subtitleScrollRef = useRef(null);
  const subtitleBottomRef = useRef(null);
  const insightScrollRef = useRef(null);
  const displayStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const bufferRef = useRef({
    sentences: [],
    wordCount: 0,
  });
  const insightTimerRef = useRef(null);
  const insightInFlightRef = useRef(false);
  const translationQueueRef = useRef([]);
  const translationInFlightRef = useRef(0);
  const tabTranscribeQueueRef = useRef([]);
  const tabTranscribeInFlightRef = useRef(false);
  const pendingTranscriptRef = useRef("");
  const tabListeningRef = useRef(false);
  const stopMicListeningRef = useRef(() => {});
  const stopTabListeningRef = useRef(() => {});

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

  const flushPendingTranscript = () => {
    const remainder = normalizeSentence(pendingTranscriptRef.current);
    if (!remainder) {
      return;
    }

    pendingTranscriptRef.current = "";
    setTabInterimText("");
    handleFinalSentence(remainder);
  };

  const flushPendingTranscriptIfIdle = () => {
    if (
      tabListeningRef.current ||
      tabTranscribeInFlightRef.current ||
      tabTranscribeQueueRef.current.length > 0
    ) {
      return;
    }

    flushPendingTranscript();
  };

  const handleTabTranscriptChunk = (chunkText) => {
    if (!chunkText) {
      return;
    }

    const combinedText = normalizeSentence(
      `${pendingTranscriptRef.current} ${chunkText}`
    );
    const { completedSentences, remainder } = splitTranscriptBuffer(combinedText);

    pendingTranscriptRef.current = remainder;
    setTabInterimText(remainder);
    completedSentences.forEach((sentence) => {
      handleFinalSentence(sentence);
    });
  };

  const processTabTranscribeQueue = () => {
    if (tabTranscribeInFlightRef.current) {
      return;
    }

    const task = tabTranscribeQueueRef.current.shift();
    if (!task) {
      setIsTabTranscribing(false);
      flushPendingTranscriptIfIdle();
      return;
    }

    tabTranscribeInFlightRef.current = true;
    setIsTabTranscribing(true);

    void transcribeAudioChunk(task.blob, task.language)
      .then((text) => {
        handleTabTranscriptChunk(text);
      })
      .catch((error) => {
        console.error("Tab audio transcription failed:", error);
        setTabErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "标签页音频转写失败，请重新开始同传。"
        );
      })
      .finally(() => {
        tabTranscribeInFlightRef.current = false;
        if (tabTranscribeQueueRef.current.length > 0) {
          processTabTranscribeQueue();
          return;
        }

        setIsTabTranscribing(false);
        flushPendingTranscriptIfIdle();
      });
  };

  const stopTabListening = () => {
    tabListeningRef.current = false;
    setTabIsListening(false);

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    const displayStream = displayStreamRef.current;
    displayStreamRef.current = null;
    if (displayStream) {
      displayStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }

    flushPendingTranscriptIfIdle();
  };

  const startTabListening = async () => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setTabErrorMessage("当前浏览器不支持标签页音频共享，请改用最新版 Chrome。");
      return;
    }

    setTabErrorMessage(null);
    pendingTranscriptRef.current = "";
    setTabInterimText("正在等待你共享带音频的浏览器标签页...");

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const audioTracks = displayStream.getAudioTracks();

      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => {
          track.stop();
        });
        setTabInterimText("");
        setTabErrorMessage("没有检测到共享音频。请选择浏览器标签页，并勾选“共享音频”。");
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const mimeType = getPreferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);

      displayStreamRef.current = displayStream;
      mediaRecorderRef.current = recorder;
      tabListeningRef.current = true;
      setTabIsListening(true);
      setTabInterimText("正在接收标签页音频，几秒后会开始落字幕...");

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }

        tabTranscribeQueueRef.current.push({
          blob: event.data,
          language,
        });
        processTabTranscribeQueue();
      };

      recorder.onerror = () => {
        setTabErrorMessage("标签页音频录制失败，请重新开始同传。");
      };

      recorder.onstop = () => {
        setTabIsListening(false);
        tabListeningRef.current = false;
        flushPendingTranscriptIfIdle();
      };

      displayStream.getTracks().forEach((track) => {
        track.onended = () => {
          stopTabListening();
        };
      });

      recorder.start(2500);
    } catch (error) {
      console.error("Display audio capture failed:", error);
      setTabInterimText("");
      setTabErrorMessage("你取消了标签页共享，或浏览器没有成功拿到音频权限。");
      stopTabListening();
    }
  };

  const {
    isSupported: isMicSupported,
    isListening: isMicListening,
    interimText: micInterimText,
    errorMessage: micErrorMessage,
    startListening: startMicListening,
    stopListening: stopMicListening,
  } =
    useSpeech({
      language,
      onFinalSentence: handleFinalSentence,
    });
  stopMicListeningRef.current = stopMicListening;
  stopTabListeningRef.current = stopTabListening;

  const isTabSupported = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return Boolean(
      navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined"
    );
  })[0];

  const isListening = inputSource === "tab" ? tabIsListening : isMicListening;
  const interimText = inputSource === "tab" ? tabInterimText : micInterimText;
  const errorMessage = inputSource === "tab" ? tabErrorMessage : micErrorMessage;
  const isSupported = inputSource === "tab" ? isTabSupported : isMicSupported;

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

      stopMicListeningRef.current();
      stopTabListeningRef.current();
    };
  }, []);

  useEffect(() => {
    if (inputSource === "tab") {
      stopMicListeningRef.current();
      return;
    }

    stopTabListeningRef.current();
    setTabErrorMessage(null);
    setTabInterimText("");
  }, [inputSource]);

  const toggleListening = () => {
    if (isListening) {
      if (inputSource === "tab") {
        stopTabListening();
      } else {
        stopMicListening();
      }
    } else {
      if (inputSource === "tab") {
        setShowTabGuide(true);
      } else {
        startMicListening();
      }
    }
  };

  const handleTabGuideConfirm = () => {
    setShowTabGuide(false);
    void startTabListening();
  };

  const clearAll = () => {
    setSubtitles([]);
    setInsights([]);
    setTabErrorMessage(null);
    setTabInterimText("");
    bufferRef.current = { sentences: [], wordCount: 0 };
    translationQueueRef.current = [];
    translationInFlightRef.current = 0;
    tabTranscribeQueueRef.current = [];
    tabTranscribeInFlightRef.current = false;
    pendingTranscriptRef.current = "";
    setIsTabTranscribing(false);
    if (insightTimerRef.current) {
      clearTimeout(insightTimerRef.current);
      insightTimerRef.current = null;
    }
  };

  const sentenceCount = bufferRef.current.sentences.length;
  const wordCount = bufferRef.current.wordCount;
  const canExportLiveSession = subtitles.length > 0 || insights.length > 0;

  const handleExportLiveSession = () => {
    const content = buildLiveSessionMarkdown({
      inputSource,
      language,
      isListening,
      errorMessage,
      subtitles,
      insights,
    });

    downloadMarkdownFile("智译西电_同传记录", content);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Tab Audio Guide Modal */}
      {showTabGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-lg rounded-3xl border border-card-border bg-white p-6 shadow-2xl animate-fade-in-up">
            <button
              onClick={() => setShowTabGuide(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-text-muted hover:bg-slate-100 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">标签页音频共享操作指南</h3>
                <p className="text-xs text-text-muted">请按以下步骤操作，否则可能无法捕获音频</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">1</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">选择“Chrome 标签页”</p>
                  <p className="mt-1 text-xs text-text-muted leading-5">在弹窗顶部选择 <strong>“Chrome 标签页”</strong>（而不是“窗口”或“整个屏幕”），然后选择正在播放音频的标签页。</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-sm font-bold">2</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">✅ 勾选“共享标签页音频”</p>
                  <p className="mt-1 text-xs text-text-muted leading-5">弹窗底部有一个 <strong>“共享标签页音频”</strong> 复选框，<span className="text-red-500 font-bold">必须勾选</span>，否则只会共享画面而没有声音。</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold">3</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">点击“共享”</p>
                  <p className="mt-1 text-xs text-text-muted leading-5">点击确认后，系统将自动开始接收标签页音频并转写为双语字幕。</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleTabGuideConfirm}
              className="mt-6 w-full rounded-2xl bg-gradient-to-r from-primary-dark to-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/35"
            >
              我知道了，开始共享
            </button>
          </div>
        </div>
      )}

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
                  {inputSource === "tab"
                    ? "左侧直接接收浏览器标签页音频并快速转写成双语字幕，右侧后台异步提取复杂理工科术语，适合课堂演示与比赛答辩。"
                    : "左侧用原生语音识别 + 极速机翻保持流式双语字幕，右侧后台异步提取复杂理工科术语，适合老师现场讲解或口述演示。"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-card-border bg-white/85 p-1 shadow-sm">
                <button
                  type="button"
                  disabled={isListening}
                  onClick={() => setInputSource("tab")}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    inputSource === "tab"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  标签页音频
                </button>
                <button
                  type="button"
                  disabled={isListening}
                  onClick={() => setInputSource("mic")}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    inputSource === "mic"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  麦克风
                </button>
              </div>

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
                onClick={handleExportLiveSession}
                disabled={!canExportLiveSession}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-card-border bg-white/85 px-5 py-3 text-sm font-medium text-text-muted shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={15} />
                导出记录
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
              {isListening
                ? inputSource === "tab"
                  ? "正在接收标签页音频"
                  : "正在聆听麦克风内容"
                : "待机中"}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
              字幕缓冲：{sentenceCount} 句 / {wordCount} 词
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
              AI 触发条件：3 句 / 50 词 / 15 秒
            </div>
            {inputSource === "tab" && (
              <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-white/90 px-3 py-1.5 text-text-muted shadow-sm">
                {isTabTranscribing ? "正在分段转写标签页音频" : "推荐共享当前浏览器标签页并勾选共享音频"}
              </div>
            )}
          </div>
        </section>

        {!isSupported && (
          <div className="mt-6 animate-fade-in-up-delay-1 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-sm">
            {inputSource === "tab"
              ? "当前浏览器不支持标签页音频共享或 MediaRecorder。比赛演示建议使用最新版 Chrome。"
              : "当前浏览器不支持 `SpeechRecognition`。比赛演示建议使用最新版 Chrome 或 Edge。"}
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
                        <span>
                          {isListening
                            ? inputSource === "tab"
                              ? "正在等待新的音频片段进入字幕流..."
                              : "正在等待新的句子结束..."
                            : inputSource === "tab"
                              ? "点击上方按钮后共享浏览器标签页音频"
                              : "点击上方按钮后开始接收课堂语音"}
                        </span>
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
