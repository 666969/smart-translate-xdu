"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CircleHelp, FileText, Languages, Menu, Mic, NotebookPen, X } from "lucide-react";
import AuthControls from "./auth/AuthControls";
import LessonPicker from "./LessonPicker";

const navigation = [
  { label: "教材翻译", href: "/", Icon: Languages },
  { label: "随堂同传", href: "/live", Icon: Mic },
  { label: "文献精读", href: "/pdf", Icon: FileText },
  { label: "专业名词库", href: "/glossary", Icon: BookOpen },
  { label: "笔记本", href: "/notebook", Icon: NotebookPen },
];

const help = [
  ["教材翻译", "输入外文或粘贴截图，先看译文，再按需生成原理讲解与术语。"],
  ["随堂同传", "选择语言和收音方式，查看字幕、标记片段并导出文字记录。"],
  ["文献精读", "上传 PDF 后翻页或提问，点击回答下方的来源回到课件原页。"],
  ["专业名词库", "按教材和章节浏览，或用中文、英语、法语搜索术语。"],
  ["笔记本", "在这里查看生词、错题和课程档案。"],
];

export default function Header() {
  const pathname = usePathname();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isHelpOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setIsHelpOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [isHelpOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-card-border bg-white/95 backdrop-blur">
        <div className="study-shell">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="智译西电首页">
              <span aria-hidden="true" className="site-mark">译</span>
              <span className="flex flex-col">
                <span className="text-[17px] font-bold tracking-tight text-foreground">智译西电</span>
                <span className="hidden font-mono text-[9px] font-semibold tracking-[0.12em] text-text-muted sm:block">XDU STUDY DESK</span>
              </span>
            </Link>

            <nav aria-label="主导航" className="hidden items-center gap-0.5 lg:flex">
              {navigation.map(({ label, href, Icon }) => (
                <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
                  className="study-nav-link">
                  <Icon size={15} aria-hidden="true" />{label}
                </Link>
              ))}
            </nav>

            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <button className="study-icon-button" onClick={() => setIsHelpOpen(true)} aria-label="打开使用帮助" title="使用帮助">
                <CircleHelp size={18} />
              </button>
              <LessonPicker />
              <AuthControls />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              <span className="hidden sm:block">
                <button className="study-icon-button" onClick={() => setIsHelpOpen(true)} aria-label="打开使用帮助">
                  <CircleHelp size={18} />
                </button>
              </span>
              <AuthControls compact />
              <button className="study-icon-button" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? "收起导航" : "展开导航"} aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation">
                {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
          {isMobileMenuOpen && (
            <nav id="mobile-navigation" aria-label="移动端导航" className="grid gap-1.5 border-t border-card-border py-3 lg:hidden">
              <div className="mb-1 flex items-center justify-between">
                <button onClick={() => { setIsMobileMenuOpen(false); setIsHelpOpen(true); }} className="study-nav-link">
                  <CircleHelp size={15} />使用帮助
                </button>
                <LessonPicker />
              </div>
              {navigation.map(({ label, href, Icon }) => (
                <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setIsMobileMenuOpen(false)} className="study-nav-link">
                  <Icon size={16} aria-hidden="true" />{label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onClick={(event) => { if (event.target === event.currentTarget) setIsHelpOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="help-title" className="study-card max-h-[90dvh] w-full max-w-md overflow-y-auto">
            <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
              <h2 id="help-title" className="text-lg font-semibold">使用帮助</h2>
              <button autoFocus className="study-icon-button" onClick={() => setIsHelpOpen(false)} aria-label="关闭使用帮助"><X size={18} /></button>
            </div>
            <dl className="space-y-4 p-5 text-sm">
              {help.map(([label, description]) => (
                <div key={label}>
                  <dt className="font-semibold text-foreground">{label}</dt>
                  <dd className="mt-1 leading-6 text-text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
