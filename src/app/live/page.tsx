"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Square, AlertCircle, Globe } from "lucide-react";
import Header from "../components/Header";

// Type definition for Web Speech API (since it's not standard in all TS envs)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

interface TranscriptItem {
  id: string;
  originalText: string;
  translation?: string;
  status: "sending" | "success" | "error";
}

export default function LiveTranslationPage() {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("fr-FR");
  const [interimText, setInterimText] = useState<string>("");
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isIntentionalStopRef = useRef<boolean>(false);
  const subtitlesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of subtitles
  const scrollToBottom = () => {
    subtitlesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcripts, interimText]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionImpl =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionImpl) {
        setIsSupported(false);
        setErrorMessage("您的浏览器不支持语音识别功能，请尝试使用 Chrome 或 Edge 浏览器。");
        return;
      }

      const recognition = new SpeechRecognitionImpl();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        setInterimText(currentInterim);

        if (finalTranscript.trim() !== "") {
          handleFinalSpeech(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error", event.error);
        if (event.error === "not-allowed") {
          setErrorMessage("未获得麦克风权限，请在浏览器设置中允许使用麦克风。");
          stopRecording();
        } else if (typeof event.error === "string" && event.error.includes("network")) {
          setErrorMessage("网络错误：原生语音识别依赖外部网络，请检查代理软件（如 Clash）是否已开启并设置为全局（Global）模式。");
          stopRecording();
        } else if (event.error !== "no-speech") {
          // Ignore no-speech errors as they just mean silence
          setErrorMessage(`语音识别错误: ${event.error}`);
        }
      };

      recognition.onend = () => {
        // If it wasn't an intentional stop, and we are supposed to be recording, restart it
        // This handles cases where the browser kills the recognition after a period of silence
        if (!isIntentionalStopRef.current && isRecording) {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error("Failed to restart recognition", e);
            setIsRecording(false);
          }
        } else {
          setIsRecording(false);
        }
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update language when changed
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
      if (isRecording) {
        // Restart to apply language change
        stopRecording();
        setTimeout(startRecording, 100);
      }
    }
  }, [language, isRecording]);

  const handleFinalSpeech = async (text: string) => {
    const newItemId = Date.now().toString() + Math.random().toString(36).substring(7);
    
    setTranscripts(prev => [
      ...prev,
      { id: newItemId, originalText: text, status: "sending" }
    ]);

    try {
      const formData = new FormData();
      formData.append("mode", "live");
      formData.append("text", text);

      const response = await fetch("/api/translate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("API Request Failed");
      }

      const data = await response.json();
      
      setTranscripts(prev => prev.map(item => 
        item.id === newItemId 
          ? { ...item, translation: data.translation, status: "success" } 
          : item
      ));
    } catch (error) {
      console.error("Translation error:", error);
      setTranscripts(prev => prev.map(item => 
        item.id === newItemId 
          ? { ...item, status: "error", translation: "翻译请求失败，请检查网络或后端接口。" } 
          : item
      ));
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return;
    setErrorMessage(null);
    isIntentionalStopRef.current = false;
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error("Start error", e);
    }
  };

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    isIntentionalStopRef.current = true;
    recognitionRef.current.stop();
    setIsRecording(false);
    setInterimText("");
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-lighter/30 blur-[120px] pointer-events-none -z-10 animate-pulse-slow"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent-light/20 blur-[120px] pointer-events-none -z-10 animate-pulse-slow font-delay-2000"></div>

      <Header />

      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8 h-[calc(100vh-80px)] animate-fade-in-up">
        
        {/* Top Controls Area */}
        <div className="bg-card-bg/80 backdrop-blur-xl border border-card-border shadow-md rounded-3xl p-6 mb-6 flex flex-col md:flex-row items-center justify-between gap-6 z-10 transition-all animate-fade-in-up-delay-1">
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Mic size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">同传原声字幕区</h1>
              <p className="text-sm text-text-muted mt-1">实时捕获语音并进行专业级翻译解析</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-background/50 border border-card-border px-4 py-2 rounded-xl">
              <Globe size={18} className="text-text-muted" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRecording}
                className="bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer disabled:opacity-50"
              >
                <option value="fr-FR">法语 (Français)</option>
                <option value="en-US">英语 (English)</option>
              </select>
            </div>

            <button
              onClick={toggleRecording}
              disabled={!isSupported}
              className={`relative flex items-center justify-center gap-3 px-8 py-4 rounded-full font-bold text-white transition-all transform active:scale-95 shadow-xl ${
                isRecording 
                  ? "bg-red-500 hover:bg-red-600 shadow-red-500/30" 
                  : "bg-primary hover:bg-primary-dark shadow-primary/30"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRecording ? (
                <>
                  <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></span>
                  <Square size={20} fill="currentColor" />
                  停止收音
                </>
              ) : (
                <>
                  <Mic size={20} />
                  开始收音
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50/80 backdrop-blur-md border border-red-200 text-red-600 px-6 py-4 rounded-2xl mb-6 flex items-start gap-3 shadow-sm animate-fade-in-up">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Subtitle Scrolling Area */}
        <div className="flex-1 bg-card-bg/60 backdrop-blur-md border border-card-border rounded-3xl p-6 md:p-8 overflow-y-auto flex flex-col gap-6 shadow-inner relative animate-fade-in-up-delay-2">
          
          {transcripts.length === 0 && !interimText && !isRecording && (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted/60 absolute inset-0">
              <Mic size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium">点击上方按钮开始实时翻译</p>
              <p className="text-sm mt-2">支持法语与英语的同声传译</p>
            </div>
          )}

          {transcripts.map((item) => (
            <div key={item.id} className="animate-fade-in-up bg-background border border-card-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-lg md:text-xl font-medium text-foreground/90 leading-relaxed mb-3">
                {item.originalText}
              </p>
              
              <div className="h-px w-full bg-gradient-to-r from-transparent via-card-border to-transparent my-3 opacity-50"></div>
              
              <div className="text-base md:text-lg text-primary-dark font-medium leading-relaxed flex items-center gap-3">
                {item.status === 'sending' && (
                   <span className="flex items-center gap-2 text-sm text-primary">
                     <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                     AI 翻译中...
                   </span>
                )}
                {item.status === 'error' && (
                  <span className="text-red-500 text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {item.translation}
                  </span>
                )}
                {item.status === 'success' && (
                  <span className="text-foreground animate-fade-in">{item.translation}</span>
                )}
              </div>
            </div>
          ))}

          {/* Interim Text (Currently speaking) */}
          {interimText && (
            <div className="animate-fade-in bg-background/50 border border-primary/20 rounded-2xl p-5 shadow-sm">
              <p className="text-lg md:text-xl font-medium text-text-muted italic leading-relaxed flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                {interimText}
              </p>
            </div>
          )}

          <div ref={subtitlesEndRef} className="h-4" />
        </div>

      </main>
    </div>
  );
}
