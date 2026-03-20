"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LockKeyhole, Mail, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type AuthMode = "signIn" | "signUp";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M21.8 12.23c0-.72-.06-1.24-.19-1.79H12v3.54h5.64c-.11.88-.72 2.2-2.08 3.1l-.02.12 3.02 2.34.21.02c1.93-1.78 3.03-4.39 3.03-7.33Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.9 6.77-2.44l-3.22-2.49c-.86.6-2.01 1.03-3.55 1.03-2.71 0-5.01-1.78-5.83-4.24l-.12.01-3.14 2.43-.04.11A10.24 10.24 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.17 13.86A6.18 6.18 0 0 1 5.85 12c0-.65.11-1.28.3-1.86l-.01-.12-3.18-2.47-.1.05A10.27 10.27 0 0 0 1.8 12c0 1.64.39 3.19 1.06 4.4l3.31-2.54Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.9c1.94 0 3.24.84 3.98 1.54l2.9-2.82C17.07 2.98 14.76 2 12 2a10.24 10.24 0 0 0-9.14 5.6l3.3 2.54C6.99 7.68 9.29 5.9 12 5.9Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "登录失败，请稍后重试。";
  }

  if (!("code" in error) || typeof error.code !== "string") {
    return error.message || "登录失败，请稍后重试。";
  }

  switch (error.code) {
    case "auth/invalid-email":
      return "邮箱格式不正确。";
    case "auth/missing-password":
    case "auth/weak-password":
      return "密码至少需要 6 位。";
    case "auth/email-already-in-use":
      return "这个邮箱已经注册过了，直接登录即可。";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "账号或密码不正确。";
    case "auth/popup-closed-by-user":
      return "Google 登录窗口已关闭。";
    case "auth/operation-not-allowed":
      return "请先在 Firebase Console 中启用对应登录方式。";
    default:
      return error.message || "登录失败，请稍后重试。";
  }
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { signIn, signInWithGoogle, signUp, isConfigured } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setErrorMessage(null);
      setSubmitting(false);
      setMode("signIn");
    }
  }, [open]);

  const modeLabel = useMemo(
    () =>
      mode === "signIn"
        ? { title: "欢迎回来", action: "登录", switchText: "没有账号？注册一个" }
        : { title: "创建你的学习身份", action: "注册", switchText: "已有账号？去登录" },
    [mode]
  );

  if (!open) {
    return null;
  }

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await signInWithGoogle();
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] shadow-[0_40px_120px_-40px_rgba(30,58,95,0.45)] animate-zoom-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_55%),linear-gradient(135deg,rgba(30,58,95,0.98),rgba(37,99,235,0.94),rgba(6,182,212,0.84))] px-6 py-6 text-white">
          <div className="absolute inset-0 opacity-30 shimmer" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.24em] uppercase">
                <Sparkles size={12} />
                Auth Portal
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{modeLabel.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/78">
                保持匿名也能直接体验核心功能，登录后只负责区分你的本地单词本与错题本。
              </p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition-all duration-300 hover:bg-white/20 hover:text-white"
              aria-label="关闭登录弹窗"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-slate-100/90 p-1 shadow-inner">
            <button
              onClick={() => setMode("signIn")}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
                mode === "signIn"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode("signUp")}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
                mode === "signUp"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              注册
            </button>
          </div>

          {!isConfigured && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
              Firebase 环境变量尚未配置。补全 `NEXT_PUBLIC_FIREBASE_*` 后即可启用登录。
            </div>
          )}

          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">邮箱</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition-all duration-300 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
                <Mail size={16} className="text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="you@xidian.edu.cn"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">密码</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm transition-all duration-300 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
                <LockKeyhole size={16} className="text-slate-400" />
                <input
                  type="password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="至少 6 位"
                  required
                  minLength={6}
                />
              </div>
            </label>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isConfigured}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--primary-dark),var(--primary),var(--accent))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-18px_rgba(37,99,235,0.65)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-18px_rgba(37,99,235,0.75)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {modeLabel.action}
            </button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            或者
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting || !isConfigured}
            className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />}
            Google 一键登录
          </button>

          <button
            type="button"
            onClick={() => setMode((current) => (current === "signIn" ? "signUp" : "signIn"))}
            className="w-full text-center text-sm text-slate-500 transition-colors duration-300 hover:text-primary"
          >
            {modeLabel.switchText}
          </button>
        </div>
      </div>
    </div>
  );
}
