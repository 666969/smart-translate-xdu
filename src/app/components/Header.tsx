"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import AuthControls from "./auth/AuthControls";

// Logo Icon extracted from page.tsx
export function LogoIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="36" height="36" rx="8" fill="url(#logo-grad)" />
      <text
        x="18"
        y="24"
        textAnchor="middle"
        fill="white"
        fontSize="16"
        fontWeight="700"
        fontFamily="Inter, sans-serif"
      >
        译
      </text>
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="36" y2="36">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 glass border-b border-card-border/50">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
              <LogoIcon />
              <div className="flex flex-col">
                <span className="text-xl font-bold gradient-text tracking-tight">
                  智译西电
                </span>
                <span className="text-[10px] text-text-muted -mt-0.5 tracking-widest uppercase">
                  Smart Translation · XDU
                </span>
              </div>
            </Link>

            {/* Right Nav */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link
                href="/"
                className={`transition-colors duration-200 ${
                  pathname === "/" ? "text-primary font-semibold" : "text-text-muted hover:text-primary"
                }`}
              >
                教材翻译
              </Link>
              <Link
                href="/glossary"
                className={`transition-colors duration-200 ${
                  pathname === "/glossary" ? "text-primary font-semibold" : "text-text-muted hover:text-primary"
                }`}
              >
                专业名词库
              </Link>
              <Link
                href="/live"
                className={`transition-colors duration-200 ${
                  pathname === "/live" ? "text-primary font-semibold" : "text-text-muted hover:text-primary"
                }`}
              >
                随堂同传
              </Link>
              <Link
                href="/notebook"
                className={`transition-colors duration-200 ${
                  pathname === "/notebook" ? "text-primary font-semibold" : "text-text-muted hover:text-primary"
                }`}
              >
                笔记本
              </Link>
              <Link
                href="/pdf"
                className={`transition-colors duration-200 ${
                  pathname === "/pdf" ? "text-primary font-semibold" : "text-text-muted hover:text-primary"
                }`}
              >
                文献精读
              </Link>
              <button
                onClick={() => setIsHelpOpen(true)}
                className="text-text-muted hover:text-primary transition-colors duration-200"
              >
                使用帮助
              </button>
              <div className="h-5 w-px bg-card-border" />
              <AuthControls />
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => setIsHelpOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-card-border/70 bg-white/80 text-text-muted shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:text-primary"
                aria-label="打开使用帮助"
              >
                <CircleHelp size={18} />
              </button>
              <AuthControls compact />
            </div>
          </div>
        </div>
      </nav>

      {/* --- Help Modal --- */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">使用帮助 📖</h3>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>
                欢迎使用 <strong className="text-primary">智译西电</strong> —— 专为中外合作办学的理工科学生打造的翻译与学习助手！
              </p>
              <ul className="space-y-2 list-none p-0">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>教材翻译：</strong>在左侧输入法语/英语文本，或上传课件截图，AI 将为您输出符合理工科语境的精准翻译与知识脉络。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>AI 助教聊天：</strong>点击右下角悬浮按钮，您可以针对翻译结果与 AI 助教进行多轮深度追问。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>专业名词库：</strong>我们梳理了海量中外英理工科词汇（如 STM32, SAR 等），欢迎随时检索学习。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>笔记本：</strong>包含生词本与错题本。关键词旁点 ⭐ 收藏到生词本，测验答错自动收录错题本，支持艾宾浩斯闪卡复习。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>文献精读：</strong>上传完整 PDF 课件，AI 自动生成全文摘要，支持对文献内容任意追问。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>法语朗读：</strong>每个法语术语旁都有 🔊 按钮，点击即可听到标准法语发音。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">🔹</span> 
                  <span><strong>导出笔记：</strong>翻译完成后可一键导出 Markdown 格式的学习笔记。</span>
                </li>
              </ul>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
