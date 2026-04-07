"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, LogOut, Sparkles } from "lucide-react";
import AuthModal from "./AuthModal";
import { useAuth } from "@/hooks/useAuth";

interface AuthControlsProps {
  compact?: boolean;
}

function getUserInitial(text?: string | null) {
  return (text || "U").trim().charAt(0).toUpperCase();
}

export default function AuthControls({ compact = false }: AuthControlsProps) {
  const { user, loading, isAuthenticated, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMenuOpen]);

  const initial = useMemo(
    () => getUserInitial(user?.displayName || user?.email || user?.uid),
    [user?.displayName, user?.email, user?.uid]
  );

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="inline-flex h-11 min-w-[108px] items-center justify-center rounded-full border border-card-border/70 bg-white/70 px-4 text-sm text-text-muted shadow-sm">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-full border border-primary/10 bg-[linear-gradient(135deg,var(--primary-dark),var(--primary),var(--accent))] text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(37,99,235,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-18px_rgba(37,99,235,0.65)] active:translate-y-0 ${
            compact ? "h-10 px-3.5" : "px-4 py-2"
          }`}
        >
          <Sparkles size={compact ? 14 : 16} />
          <span>{compact ? "登录" : "登录 / 注册"}</span>
        </button>
        <AuthModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen((current) => !current)}
          className={`inline-flex items-center gap-2 rounded-full border border-card-border/70 bg-white/85 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/10 ${
            compact ? "px-2 py-2" : "px-2.5 py-2"
          }`}
        >
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt={user.displayName || user.email || "用户头像"}
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary/10"
            />
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(30,58,95,1),rgba(37,99,235,0.94),rgba(6,182,212,0.82))] text-sm font-semibold text-white shadow-inner">
              {initial}
            </span>
          )}
          {!compact && (
            <>
              <span className="max-w-[120px] truncate text-sm font-medium text-slate-700">
                {user.displayName || user.email || "已登录"}
              </span>
              <ChevronDown
                size={16}
                className={`text-slate-400 transition-transform duration-300 ${isMenuOpen ? "rotate-180" : ""}`}
              />
            </>
          )}
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_24px_60px_-24px_rgba(30,58,95,0.35)] backdrop-blur-xl animate-fade-in">
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Signed In
              </p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-800">
                {user.displayName || initial}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{user.email || user.uid}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="mt-2 inline-flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition-colors duration-300 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {isSigningOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                退出登录
              </span>
              <span className="text-xs text-slate-400">Local only</span>
            </button>
          </div>
        )}
      </div>

      <AuthModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
