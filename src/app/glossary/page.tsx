"use client";

import { useState, useMemo } from "react";
import { glossaryData, GlossaryWord } from "@/data/glossaryData";
import { Search, Book, BookOpen, Hash, Languages, Menu, X } from "lucide-react";
import Header from "../components/Header";
import SpeakButton from "../components/SpeakButton";

type LangMode = "all" | "fr-zh" | "en-zh";

export default function GlossaryDashboard() {
  const [activeBookIdx, setActiveBookIdx] = useState(0);
  const [activeModuleIdx, setActiveModuleIdx] = useState(-1); // -1 means All
  const [searchQuery, setSearchQuery] = useState("");
  const [langMode, setLangMode] = useState<LangMode>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activeBook = glossaryData[activeBookIdx];
  const modules = useMemo(() => activeBook?.modules || [], [activeBook]);

  const filteredWords = useMemo(() => {
    if (!activeBook) return [];

    const rawWords: { moduleName: string; word: GlossaryWord }[] = [];

    if (activeModuleIdx === -1) {
      modules.forEach(m => {
        m.words.forEach(w => rawWords.push({ moduleName: m.name, word: w }));
      });
    } else {
      const m = modules[activeModuleIdx];
      if (m) {
        m.words.forEach(w => rawWords.push({ moduleName: m.name, word: w }));
      }
    }

    if (searchQuery.trim() === "") {
      return rawWords;
    }

    const q = searchQuery.toLowerCase();
    return rawWords.filter(
      item =>
        item.word.term_fr.toLowerCase().includes(q) ||
        item.word.term_zh.toLowerCase().includes(q) ||
        item.word.term_en.toLowerCase().includes(q)
    );
  }, [activeBook, activeModuleIdx, searchQuery, modules]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden animate-fade-in-up">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 shadow-2xl transition-transform duration-300 ease-in-out
        md:relative md:shadow-sm md:translate-x-0 md:z-10 animate-fade-in-up-delay-1
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="h-16 flex items-center justify-between md:justify-start px-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center">
            <Languages className="w-6 h-6 text-blue-600 mr-3" />
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">智译西电 | 词汇库</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
            Textbooks (课本)
          </h2>
          <nav className="space-y-1">
            {glossaryData.map((book, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveBookIdx(idx);
                  setActiveModuleIdx(-1);
                  setSearchQuery("");
                }}
                className={`w-full text-left flex items-start px-3 py-3 rounded-xl transition-all duration-200 ${
                  activeBookIdx === idx
                    ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Book className={`w-5 h-5 mt-0.5 mr-3 flex-shrink-0 ${activeBookIdx === idx ? "text-blue-600" : "text-slate-400"}`} />
                <div className="flex-1 leading-snug">
                  <span className="block font-medium text-sm">{book.title.split(' (')[0]}</span>
                  {book.title.includes('(') && (
                    <span className={`block text-xs mt-1 ${activeBookIdx === idx ? "text-blue-500" : "text-slate-400"}`}>
                      {book.title.substring(book.title.indexOf('('))}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 animate-fade-in-up-delay-2">
        {/* Header: Search & Mode Switcher */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 flex-shrink-0">
          <div className="flex items-center gap-3 md:gap-6 w-full max-w-3xl">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-full max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索中/法/英..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100/50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
            </div>
            
            {/* Language Mode Toggles */}
            <div className="hidden md:flex bg-slate-100/80 p-1 rounded-lg border border-slate-200/50">
              <button
                onClick={() => setLangMode("all")}
                className={`relative px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-300 ${
                  langMode === "all" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                三语对照
              </button>
              <button
                onClick={() => setLangMode("fr-zh")}
                className={`relative px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-300 ${
                  langMode === "fr-zh" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                中法模式
              </button>
              <button
                onClick={() => setLangMode("en-zh")}
                className={`relative px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-300 ${
                  langMode === "en-zh" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                中英模式
              </button>
            </div>
          </div>
          
          <div className="text-sm text-slate-500 font-medium whitespace-nowrap hidden lg:block">
            共找到 <span className="text-blue-600 font-bold">{filteredWords.length}</span> 个词汇
          </div>
        </header>

        {/* Module Tabs */}
        <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="flex overflow-x-auto hide-scrollbar p-2 px-4 md:px-8 items-center space-x-2">
            <button
              onClick={() => setActiveModuleIdx(-1)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeModuleIdx === -1
                  ? "bg-slate-800 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              全部模块 (All)
            </button>
            {modules.map((m, idx) => (
              <button
                key={idx}
                onClick={() => setActiveModuleIdx(idx)}
                className={`flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeModuleIdx === idx
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <Hash className={`w-4 h-4 mr-1.5 opacity-70`} />
                {m.name.split(' (')[0].replace(/^\d+\.\s*/, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Word Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {filteredWords.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <BookOpen className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium text-slate-600">未找到匹配的词汇</p>
              <p className="text-sm mt-1">请尝试更换搜索关键词或选择“全部模块”</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-4 md:gap-6 content-start">
              {filteredWords.map((item, i) => (
                <div 
                  key={i}
                  className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-0.5 hover:border-blue-200 transition-all duration-300 flex flex-col relative overflow-hidden h-full"
                >
                  {/* Decorative background accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-opacity duration-300 pointer-events-none" />
                  
                  {/* Module Badge */}
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 uppercase tracking-widest self-start mb-5 max-w-full border border-slate-200/50">
                    <span className="truncate">{item.moduleName.split(' (')[0].replace(/^\d+\.\s*/, '')}</span>
                  </div>

                  {/* Languages Container */}
                  <div className="flex-1 flex flex-col justify-center space-y-4 relative z-10 transition-all duration-500">
                    
                    {/* Français Section */}
                    {(langMode === "all" || langMode === "fr-zh") && (
                      <div className="transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center mb-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">Français</span>
                        </div>
                        <p className="text-lg md:text-xl font-bold text-blue-900 leading-tight group-hover:text-blue-700 transition-colors flex items-center gap-2">
                          {item.word.term_fr}
                          <SpeakButton text={item.word.term_fr} lang="fr-FR" size={16} />
                        </p>
                      </div>
                    )}
                    
                    {/* Divider 1 */}
                    {langMode === "all" && (
                      <div className="h-px w-full bg-slate-100" />
                    )}
                    
                    {/* English Section */}
                    {(langMode === "all" || langMode === "en-zh") && (
                      <div className="transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center mb-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">English</span>
                        </div>
                        <p className="text-base md:text-lg font-semibold text-slate-700 leading-snug">
                          {item.word.term_en}
                        </p>
                      </div>
                    )}

                    {/* Divider 2 */}
                    <div className="h-px w-full bg-slate-100" />
                    
                    {/* 中文 Section (Always visible) */}
                    <div className="transition-all duration-300">
                      <div className="flex items-center mb-1.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">中文</span>
                      </div>
                      <p className="text-sm md:text-[15px] font-medium text-slate-800 leading-snug py-1.5 px-3 bg-gradient-to-r from-amber-50 to-orange-50/30 rounded-lg inline-block border border-amber-100/50 shadow-sm">
                        {item.word.term_zh}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Hide Scrollbar Style Inject */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
      </div>
    </div>
  );
}
