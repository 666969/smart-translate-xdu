"use client";

import { useState, useCallback, useRef } from "react";
import { Volume2 } from "lucide-react";

interface SpeakButtonProps {
  text: string;
  lang?: string;
  size?: number;
  className?: string;
}

export default function SpeakButton({
  text,
  lang = "fr-FR",
  size = 16,
  className = "",
}: SpeakButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleSpeak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    // If currently speaking, stop
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [text, lang, isSpeaking]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleSpeak();
      }}
      className={`inline-flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95 ${
        isSpeaking
          ? "text-primary bg-primary/10 animate-pulse"
          : "text-text-muted hover:text-primary hover:bg-primary/5"
      } ${className}`}
      style={{ width: size + 12, height: size + 12 }}
      disabled={typeof window !== "undefined" && !window.speechSynthesis}
      title={isSpeaking ? "停止朗读" : `朗读法语: ${text}`}
      aria-label={isSpeaking ? "停止朗读" : `朗读: ${text}`}
    >
      <Volume2 size={size} />
    </button>
  );
}
