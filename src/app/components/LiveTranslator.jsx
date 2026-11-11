"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AlertCircle, Bookmark, BookOpen, Download, Globe, Mic, Monitor, Square } from "lucide-react";
import Header from "./Header";
import OperationProgress from "./OperationProgress";
import { useLesson } from "@/hooks/useLesson";
import { glossaryData } from "@/data/glossaryData";
import { saveLessonRecord } from "@/lib/db";
import { cloudStudyEnabled, studySaveError, usesCloudStudy } from "@/lib/studyStorage";
import { captureClassroomAudio, classroomWav, CLASSROOM_SAMPLE_RATE } from "@/lib/classroomAudio";
import { createClassroomTranscriber } from "@/lib/classroomTranscriber";
import { buildLiveSessionMarkdown, downloadMarkdownFile } from "@/lib/markdownExport";

const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-card-border bg-white px-3 py-2 text-sm font-medium text-text-muted hover:text-primary disabled:opacity-50";
const MAX_AUDIO_WAITING = 3;
const MAX_TRANSLATIONS_WAITING = 16;

function normalize(text) {
  return text.replace(/\s+/gu, " ").trim();
}

function termKey(text) {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function courseTerms(lesson) {
  const matching = glossaryData.filter((book) =>
    lesson.includes(book.title.split(" (")[0].trim()));
  const books = matching.length ? matching : glossaryData;
  return books.flatMap((book) => book.modules.flatMap((module) =>
    module.words.map((word) => ({ ...word, course: book.title.split(" (")[0] }))));
}

function findTerms(text, terms, language) {
  const haystack = " " + termKey(text).replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
  const matches = [];
  for (const word of terms) {
    const term = language.startsWith("fr") ? word.term_fr : word.term_en;
    const token = termKey(term).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (token.length >= 3 && haystack.includes(" " + token + " ")) {
      matches.push({ term, explanation: word.term_zh + " · " + word.course, snippet: text });
    }
  }
  return matches.slice(0, 4);
}

function timeLabel(seconds) {
  const mins = Math.floor(seconds / 60);
  return String(mins).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

async function requestResult(url, form, signal) {
  const response = await fetch(url, { method: "POST", body: form, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error || "请求失败，请稍后重试。");
  }
  return data;
}

function snapshot(run, isListening) {
  return {
    inputSource: run.source,
    language: run.language,
    isListening,
    errorMessage: run.issue,
    subtitles: run.lines,
    insights: run.insights,
    lesson: run.lesson,
  };
}

export default function LiveTranslator() {
  const { ownerId, lesson, loading } = useLesson();
  return <LiveSession key={ownerId} ownerId={ownerId} lesson={lesson} loading={loading} />;
}

function LiveSession({ ownerId, lesson, loading }) {
  const [inputSource, setInputSource] = useState("mic");
  const [language, setLanguage] = useState("fr-FR");
  const [capabilities, setCapabilities] = useState(null);
  const [stage, setStage] = useState("idle");
  const [subtitles, setSubtitles] = useState([]);
  const [insights, setInsights] = useState([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [translationIssue, setTranslationIssue] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [follow, setFollow] = useState(true);
  const [showTabGuide, setShowTabGuide] = useState(false);
  const [pendingAudio, setPendingAudio] = useState(0);
  const [inputLevel, setInputLevel] = useState(null);
  const [preparingModel, setPreparingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const listRef = useRef(null);
  const runRef = useRef(null);
  const captureRef = useRef(null);
  const transcriberRef = useRef(null);
  const startRef = useRef(null);
  const autoScrollRef = useRef(true);
  const terms = useMemo(() => courseTerms(lesson), [lesson]);

  const isListening = stage === "listening";
  const busy = stage !== "idle" || pendingAudio > 0;

  useEffect(() => {
    const controller = new AbortController();
    const browser = {
      nativeMic: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      deviceMic: Boolean(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode),
      tab: Boolean(navigator.mediaDevices?.getDisplayMedia && window.AudioWorkletNode),
      localSpeech: Boolean(window.Worker && window.WebAssembly && window.AudioContext),
    };
    const options = { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]) };
    void Promise.all([
      fetch("/api/live-transcribe", options).then((res) => res.ok ? res.json() : null).catch(() => null),
      browser.localSpeech
        ? fetch("/classroom-model/v1/ready.json", options).then((res) => res.ok ? res.json() : null).catch(() => null)
        : null,
    ]).then(([speech, deviceModel]) => {
      if (!controller.signal.aborted) setCapabilities({
        ...browser,
        speech: speech?.available === true,
        localSpeech: deviceModel?.model === "whisper-base",
      });
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list && autoScrollRef.current) list.scrollTop = list.scrollHeight;
  }, [subtitles]);

  function writeRecord(run) {
    if (!run?.lines.length || (cloudStudyEnabled && !usesCloudStudy(run.ownerId))) return;
    if (run.saveTimer) {
      window.clearTimeout(run.saveTimer);
      run.saveTimer = null;
    }
    const revision = (run.saveRevision ?? 0) + 1;
    run.saveRevision = revision;
    const updatedAt = Math.max(Date.now(), (run.lastWriteAt ?? 0) + 1);
    run.lastWriteAt = updatedAt;
    const note = snapshot(run, false);
    void saveLessonRecord({
      id: run.id, ownerId: run.ownerId, lesson: run.lesson, title: run.title, kind: "live",
      updatedAt, markdown: buildLiveSessionMarkdown(note),
    }).then(() => {
      if (runRef.current === run && revision === run.saveRevision && !run.controller.signal.aborted) {
        setSaveError("");
        if (usesCloudStudy(run.ownerId)) setSaveNotice("字幕已保存到云端。");
      }
    }).catch((error) => {
      if (runRef.current === run && revision === run.saveRevision && !run.controller.signal.aborted) {
        setSaveNotice("");
        setSaveError(studySaveError(error, run.ownerId));
      }
    });
  }

  function scheduleRecord(run) {
    if (run.saveTimer || (cloudStudyEnabled && !usesCloudStudy(run.ownerId))) return;
    run.saveTimer = window.setTimeout(() => {
      run.saveTimer = null;
      writeRecord(run);
    }, usesCloudStudy(run.ownerId) ? 20_000 : 400);
  }

  function publish(run) {
    if (runRef.current !== run || run.controller.signal.aborted) return;
    setSubtitles(run.lines);
    setInsights(run.insights);
    scheduleRecord(run);
  }

  function disposeRun(run) {
    if (!run) return;
    run.controller.abort();
    if (run.saveTimer) window.clearTimeout(run.saveTimer);
    writeRecord(run);
  }

  function getRun() {
    const current = runRef.current;
    if (current && current.source === inputSource && current.language === language && current.lesson === lesson) return current;
    runRef.current = null;
    disposeRun(current);
    const run = {
      id: crypto.randomUUID(), ownerId, lesson, language, source: inputSource, terms,
      title: "随堂同传 · " + new Date().toLocaleString("zh-CN"),
      startTime: Date.now(), lines: [], insights: [], issue: "", saveTimer: null,
      translations: [], translating: 0, audio: [], processingAudio: false, dropped: 0,
      controller: new AbortController(),
    };
    runRef.current = run;
    setSubtitles([]);
    setInsights([]);
    setSaveError("");
    setSaveNotice("");
    return run;
  }

  function updateLine(run, id, change) {
    run.lines = run.lines.map((line) => line.id === id ? { ...line, ...change } : line);
    publish(run);
  }

  function translateWaiting(run) {
    while (!run.controller.signal.aborted && run.translating < 2 && run.translations.length) {
      const line = run.translations.shift();
      run.translating += 1;
      const form = new FormData();
      form.set("mode", "live");
      form.set("text", line.originalText);
      form.set("language", run.language);
      const signal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(12_000)]);
      void requestResult("/api/translate", form, signal).then((data) => {
        if (run.controller.signal.aborted) return;
        if (!data.translation?.trim()) throw new Error("译文为空");
        setTranslationIssue("");
        updateLine(run, line.id, { translation: data.translation.trim(), status: "success" });
      }).catch((failure) => {
        if (run.controller.signal.aborted) return;
        setTranslationIssue(failure instanceof Error ? failure.message : "译文暂时无法生成。");
        updateLine(run, line.id, { status: "error" });
      }).finally(() => {
        run.translating -= 1;
        translateWaiting(run);
      });
    }
  }

  function queueTranslation(run, line) {
    if (run.translations.length >= MAX_TRANSLATIONS_WAITING) {
      const oldest = run.translations.shift();
      updateLine(run, oldest.id, { status: "error" });
    }
    run.translations.push(line);
    translateWaiting(run);
  }

  function addLine(run, rawText, seconds = Math.round((Date.now() - run.startTime) / 1000)) {
    if (runRef.current !== run || run.controller.signal.aborted) return;
    const originalText = normalize(rawText);
    if (!originalText) return;
    const line = {
      id: crypto.randomUUID(), originalText, translation: "", status: "sending",
      seconds: Math.max(0, seconds), marked: false,
    };
    run.lines = [...run.lines, line];
    const cards = findTerms(originalText, run.terms, run.language)
      .filter((card, index, all) => all.findIndex((item) => item.term === card.term) === index &&
        !run.insights.some((existing) => existing.term === card.term));
    run.insights = [...cards, ...run.insights].slice(0, 18);
    publish(run);
    queueTranslation(run, line);
  }

  function noteIssue(run, message) {
    run.issue = message;
    if (runRef.current === run && !run.controller.signal.aborted) setError(message);
    scheduleRecord(run);
  }

  async function processAudio(run) {
    if (run.processingAudio || run.controller.signal.aborted) return;
    run.processingAudio = true;
    try {
      while (!run.controller.signal.aborted && run.audio.length) {
        setPendingAudio(run.audio.length);
        const item = run.audio.shift();
        try {
          let text;
          if (run.transcriber) {
            text = await run.transcriber.transcribe(item.samples, run.language);
          } else {
            const form = new FormData();
            form.set("audio", classroomWav(item.samples), "classroom.wav");
            form.set("language", run.language);
            const signal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(17_000)]);
            text = (await requestResult("/api/live-transcribe", form, signal)).text;
          }
          if (text?.trim()) {
            if (run.noTranscript) {
              run.noTranscript = false;
              setError("");
            }
            addLine(run, text, item.seconds);
          } else if (runRef.current === run && !run.lines.length && !run.controller.signal.aborted) {
            run.noTranscript = true;
            setError("收到了声音，暂未识别出语音。请确认课堂语言，再说一句完整的话。");
          }
        } catch (failure) {
          if (run.controller.signal.aborted) break;
          if (run.transcriber && transcriberRef.current === run.transcriber) {
            run.transcriber.close();
            transcriberRef.current = null;
          }
          noteIssue(run, failure instanceof Error ? failure.message : "语音转写中断。");
          run.audio = [];
          stopCapture(false);
        }
      }
    } finally {
      run.processingAudio = false;
      if (runRef.current === run && !run.controller.signal.aborted) setPendingAudio(0);
    }
  }

  function queueAudio(run, samples) {
    if (runRef.current !== run || run.controller.signal.aborted) return;
    if (run.audio.length >= MAX_AUDIO_WAITING) {
      run.dropped += 1;
      noteIssue(run, "转写速度跟不上，已有 " + run.dropped + " 个音频片段跳过。仍会保留已识别的字幕。");
      return;
    }
    const duration = samples.length / CLASSROOM_SAMPLE_RATE;
    const seconds = Math.round((Date.now() - run.startTime) / 1000 - duration);
    run.audio.push({ samples, seconds });
    setPendingAudio(run.audio.length + Number(run.processingAudio));
    void processAudio(run);
  }

  function stopCapture(sendRemainder = true) {
    startRef.current?.abort();
    startRef.current = null;
    const capture = captureRef.current;
    captureRef.current = null;
    setInterim("");
    setInputLevel(null);
    setPreparingModel(false);
    if (!capture) {
      setStage("idle");
      return;
    }
    setStage("stopping");
    void capture.close(sendRemainder).finally(() => {
      setStage("idle");
      if (runRef.current) writeRecord(runRef.current);
    }).catch(() => {});
  }

  async function startCapture() {
    setShowTabGuide(false);
    if (busy || loading || !capabilities) return;
    setError("");
    setTranslationIssue("");
    setStage("starting");
    const start = new AbortController();
    startRef.current = start;
    const run = getRun();
    run.transcriber = null;
    run.noTranscript = false;
    try {
      const canProcessAudio = capabilities.speech || capabilities.localSpeech;
      if (inputSource === "mic" && capabilities.nativeMic && !(capabilities.deviceMic && canProcessAudio)) {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const speech = new Recognition();
        speech.lang = language;
        speech.continuous = true;
        speech.interimResults = true;
        let closed = false;
        captureRef.current = {
          close: async (finish) => {
            closed = true;
            if (finish) speech.stop();
            else speech.abort();
          },
        };
        speech.onstart = () => { if (!closed) setStage("listening"); };
        speech.onresult = (event) => {
          if (run.controller.signal.aborted) return;
          const partial = [];
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const text = result[0]?.transcript || "";
            if (result.isFinal) addLine(run, text);
            else if (!closed) partial.push(text);
          }
          setInterim(partial.join(" "));
        };
        speech.onerror = ({ error: code }) => {
          if (code === "no-speech" || closed) return;
          noteIssue(run, code === "not-allowed" ? "请在浏览器里允许访问麦克风。" : "浏览器语音识别中断，请检查网络或使用转写服务。");
          stopCapture(false);
        };
        speech.onend = () => {
          if (closed || start.signal.aborted || run.controller.signal.aborted) return;
          try { speech.start(); }
          catch {
            noteIssue(run, "麦克风识别已停止，请重新开始。");
            stopCapture(false);
          }
        };
        speech.start();
        return;
      }

      const stream = inputSource === "tab"
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const stopTracks = () => stream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
      try {
        start.signal.throwIfAborted();
        if (!stream.getAudioTracks().length) throw new Error(inputSource === "tab"
          ? "没有检测到共享音频。请选中浏览器标签页并勾选共享音频。"
          : "没有检测到麦克风音轨，请检查系统的默认输入设备。");
        setInputLevel(0);
        const audio = await captureClassroomAudio(stream,
          (samples) => queueAudio(run, samples),
          (level) => { if (!start.signal.aborted) setInputLevel(level); },
          start.signal);
        if (start.signal.aborted) {
          await audio.close(false);
          stopTracks();
          return;
        }
        captureRef.current = { close: (finish) => audio.close(finish).finally(stopTracks) };
        stream.getTracks().forEach((track) => { track.onended = () => stopCapture(); });
        if (!capabilities.speech) {
          setPreparingModel(!transcriberRef.current);
          if (!transcriberRef.current) {
            setModelProgress(0);
            transcriberRef.current = createClassroomTranscriber(setModelProgress);
          }
          const transcriber = transcriberRef.current;
          const cancelPreparation = () => {
            transcriber.close();
            if (transcriberRef.current === transcriber) transcriberRef.current = null;
          };
          start.signal.addEventListener("abort", cancelPreparation, { once: true });
          try {
            await transcriber.prepare();
            start.signal.throwIfAborted();
          } catch (error) {
            cancelPreparation();
            throw error;
          } finally {
            start.signal.removeEventListener("abort", cancelPreparation);
            if (!start.signal.aborted) setPreparingModel(false);
          }
          run.transcriber = transcriber;
        }
        if (!run.lines.length) run.startTime = Date.now();
        audio.begin();
        setStage("listening");
      } catch (failure) {
        stopTracks();
        throw failure;
      }
    } catch (failure) {
      if (start.signal.aborted) return;
      noteIssue(run, failure?.name === "NotAllowedError" ? "收音授权已取消，或浏览器未授予音频权限。"
        : failure?.name === "NotFoundError" ? "找不到可用的麦克风，请检查系统的输入设备。"
          : failure?.name === "NotReadableError" ? "麦克风无法打开，请检查系统权限或关闭占用麦克风的应用。"
            : failure instanceof Error ? failure.message : "无法开启收音。");
      stopCapture(false);
    }
  }

  const cleanup = useEffectEvent(() => {
    startRef.current?.abort();
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) void capture.close(false).catch(() => {});
    transcriberRef.current?.close();
    transcriberRef.current = null;
    const run = runRef.current;
    runRef.current = null;
    disposeRun(run);
  });

  useEffect(() => () => cleanup(), []);

  function newSession() {
    const previous = runRef.current;
    runRef.current = null;
    disposeRun(previous);
    setSubtitles([]);
    setInsights([]);
    setError("");
    setTranslationIssue("");
    setSaveError("");
    setSaveNotice("");
    autoScrollRef.current = true;
    setFollow(true);
  }

  function returnToLatest() {
    autoScrollRef.current = true;
    setFollow(true);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }

  const canProcessAudio = capabilities?.speech || capabilities?.localSpeech;
  const canShare = capabilities?.tab && canProcessAudio;
  const canMic = capabilities?.nativeMic || (capabilities?.deviceMic && canProcessAudio);
  const canStart = inputSource === "tab" ? canShare : canMic;
  const canStop = isListening || stage === "starting";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 lg:px-10">
        <section className="animate-fade-in-up rounded-2xl border border-card-border bg-white p-4 lg:p-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Mic className="text-primary" />随堂同传</h1>
          <p className="mt-2 text-sm text-text-muted">
            {usesCloudStudy(ownerId)
              ? "课堂文字记录每 20 秒保存到云端，也可手动保存。"
              : cloudStudyEnabled ? "可以先以访客身份跟听，登录后保存文字记录到云端。"
                : "先显示法语或英语原文，再补中文字幕。文字记录会保存到本浏览器的课程档案。"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className={button} aria-pressed={inputSource === "mic"} disabled={busy} onClick={() => setInputSource("mic")}><Mic size={16} />麦克风</button>
            <button className={button} aria-pressed={inputSource === "tab"} disabled={busy || !canShare} onClick={() => setInputSource("tab")}><Monitor size={16} />标签页音频</button>
            <label className={button}><Globe size={15} /><span className="sr-only">课堂语言</span>
              <select aria-label="课堂语言" disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="fr-FR">法语</option><option value="en-US">英语</option>
              </select>
            </label>
            <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!canStop && (loading || busy || !canStart)}
              onClick={() => canStop ? stopCapture(isListening) : inputSource === "tab" ? setShowTabGuide(true) : void startCapture()}>
              {canStop ? <Square size={15} /> : <Mic size={15} />}
              {isListening ? "停止收音" : stage === "starting" ? "取消开启" : busy ? "正在完成转写" : "开始同传"}
            </button>
            <button className={button} disabled={!subtitles.length} onClick={() => {
              if (runRef.current) downloadMarkdownFile("智译西电_随堂同传", buildLiveSessionMarkdown(snapshot(runRef.current, isListening)));
            }}><Download size={16} />导出记录</button>
            {usesCloudStudy(ownerId) && <button className={button} disabled={!subtitles.length} onClick={() => {
              if (runRef.current) writeRecord(runRef.current);
            }}>保存字幕到云端</button>}
            <button className={button} disabled={busy || !subtitles.length} onClick={newSession}>开始新记录</button>
          </div>
          {capabilities && !canShare && <p className="mt-2 text-xs text-text-muted">
            当前浏览器无法共享并转写标签页音频，可以使用麦克风模式。
          </p>}
          {capabilities && !canMic && <p className="mt-2 text-xs text-text-muted">当前浏览器的麦克风识别不可用。</p>}
          {stage === "starting" && <div className="mt-3 max-w-md">
            {preparingModel && modelProgress < 100
              ? <OperationProgress label="正在下载语音模型" detail="首次约 100 MB" progress={{ completed: modelProgress, total: 100 }} />
              : <OperationProgress label={preparingModel ? "正在启动语音识别" : "正在开启音频输入"} />}
          </div>}
          {inputLevel !== null && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>输入音量</span>
            <meter className="w-28" min={0} max={100} value={inputLevel} aria-label="输入音量" />
            <span>{inputLevel >= 6 ? "已检测到声音" : "等待声音"}</span>
          </div>}
          {pendingAudio > 0 && <p className="mt-2 text-xs text-primary">正在转写 · {pendingAudio} 个音频片段</p>}
          {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}
          {translationIssue && <p role="status" className="mt-2 text-sm text-rose-700">{translationIssue}</p>}
          {saveError && <p role="alert" className="mt-2 text-sm text-rose-700">{saveError}</p>}
          {saveNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{saveNotice}</p>}
        </section>

        {showTabGuide && <section className="rounded-2xl border border-card-border bg-white p-4">
          <h2 className="font-semibold">共享老师所在的浏览器标签页</h2>
          <p className="mt-1 text-sm text-text-muted">选择「标签页」并勾选共享音频，网页会识别该标签页播放的声音。</p>
          <div className="mt-3 flex gap-2">
            <button className={button} onClick={() => void startCapture()}>选择标签页</button>
            <button className={button} onClick={() => setShowTabGuide(false)}>取消</button>
          </div>
        </section>}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="animate-fade-in-up-delay-1 min-w-0 rounded-2xl border border-card-border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">双语字幕 <span className="text-sm font-normal text-text-muted">· {subtitles.length} 条</span></h2>
              {!follow && <button className={button} onClick={returnToLatest}>回到最新字幕</button>}
            </div>
            {interim && <p className="mb-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-800">{interim}</p>}
            <div ref={listRef} className="max-h-[65vh] min-h-56 space-y-3 overflow-y-auto"
              onScroll={(event) => {
                const list = event.currentTarget;
                const atEnd = list.scrollHeight - list.clientHeight - list.scrollTop < 28;
                autoScrollRef.current = atEnd;
                setFollow(atEnd);
              }}>
              {subtitles.length === 0 && <p className="p-4 text-sm text-text-muted">{isListening ? "正在听取课堂语音…" : "开始收音后，课堂原文和译文会显示在这里。"}</p>}
              {subtitles.map((line) => (
                <article key={line.id} className="rounded-xl border border-card-border bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs tabular-nums text-text-muted">{timeLabel(line.seconds)}</span>
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/5"
                      aria-pressed={line.marked} onClick={() => {
                        if (runRef.current) updateLine(runRef.current, line.id, { marked: !line.marked });
                      }}><Bookmark size={13} fill={line.marked ? "currentColor" : "none"} />{line.marked ? "已标记" : "这句没听懂"}</button>
                  </div>
                  <p className="break-words text-sm leading-6">{line.originalText}</p>
                  {line.status === "success" ? <p className="mt-1 break-words text-base font-medium leading-7 text-primary-dark">{line.translation}</p>
                    : <p className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                      {line.status === "sending" ? "正在补充译文…" : "译文待补"}
                      {line.status === "error" && <button className="text-primary underline" onClick={() => {
                        const run = runRef.current;
                        if (!run) return;
                        updateLine(run, line.id, { status: "sending" });
                        queueTranslation(run, line);
                      }}>重试翻译</button>}
                    </p>}
                </article>
              ))}
            </div>
          </section>
          <aside className="animate-fade-in-up-delay-2 rounded-2xl border border-card-border bg-white p-4">
            <h2 className="flex items-center gap-2 font-semibold"><BookOpen size={16} className="text-primary" />课程术语</h2>
            <p className="mt-1 text-xs text-text-muted">{lesson || "匹配已有理工科词库"}</p>
            <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto">
              {insights.length === 0 && <p className="text-sm text-text-muted">字幕命中词库中的术语后，会在这里显示中文对照。</p>}
              {insights.map((item) => <div key={item.term} className="rounded-xl bg-sky-50 p-3 text-sm">
                <p className="font-medium">{item.term}</p><p className="mt-1 text-xs text-text-muted">{item.explanation}</p>
              </div>)}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
