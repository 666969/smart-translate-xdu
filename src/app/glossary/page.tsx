"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, Library, Search, X } from "lucide-react";
import { glossaryData } from "@/data/glossaryData";
import Header from "../components/Header";
import SpeakButton from "../components/SpeakButton";
import WorkspaceHeading from "../components/WorkspaceHeading";

type LangMode = "all" | "fr-zh" | "en-zh";

const PAGE_SIZE = 32;
const languageModes = [
  { id: "all", label: "三语" },
  { id: "fr-zh", label: "法中" },
  { id: "en-zh", label: "英中" },
] as const;
const books = glossaryData.map((book, index) => ({
  ...book,
  index,
  name: book.title.split(" (")[0],
  count: book.modules.reduce((sum, module) => sum + module.words.length, 0),
}));
const totalTerms = books.reduce((sum, book) => sum + book.count, 0);
const bookGroups = [
  { label: "新增教材", books: books.filter((book) => book.source) },
  { label: "基础与专业课程", books: books.filter((book) => !book.source) },
];

function moduleTitle(name: string) {
  return name.split(" (")[0].replace(/^\d+\.\s*/u, "");
}

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/gu, "'").trim();
}

export default function GlossaryDashboard() {
  const [activeBookIndex, setActiveBookIndex] = useState(0);
  const [activeModuleIndex, setActiveModuleIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [allBooks, setAllBooks] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const activeBook = books[activeBookIndex];
  const showFrench = langMode !== "en-zh";
  const showEnglish = langMode !== "fr-zh";
  const columns = langMode === "all"
    ? "md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,1.05fr)]"
    : "md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]";

  const results = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    const scope = allBooks ? books : [activeBook];
    return scope.flatMap((book) =>
      book.modules.flatMap((module, index) => {
        if (!allBooks && activeModuleIndex !== -1 && activeModuleIndex !== index) return [];
        return module.words.flatMap((word, wordIndex) => {
          const matches = !query || [word.term_zh, word.term_fr, word.term_en].some((term) => normalizeSearch(term).includes(query));
          return matches ? [{ word, module: moduleTitle(module.name), book: book.name, key: book.index + "-" + index + "-" + wordIndex }] : [];
        });
      })
    );
  }, [activeBook, activeModuleIndex, allBooks, searchQuery]);

  function selectBook(index: number) {
    setActiveBookIndex(index);
    setActiveModuleIndex(-1);
    setAllBooks(false);
    setLimit(PAGE_SIZE);
  }

  function selectScope(searchEveryBook: boolean) {
    setAllBooks(searchEveryBook);
    setLimit(PAGE_SIZE);
  }

  function changeQuery(query: string) {
    setSearchQuery(query);
    setLimit(PAGE_SIZE);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="study-shell pb-12 pt-6 sm:pt-8">
        <WorkspaceHeading label="课程参考" title="专业名词库" icon={<Library size={23} />}
          description="按教材和章节对照专业术语，也可以用中文、法语或英语查找。">
          <span className="rounded-xl bg-study-soft px-3 py-2 text-sm font-semibold text-primary">{books.length} 本教材</span>
          <span className="rounded-xl border border-card-border px-3 py-2 text-sm font-medium text-text-muted">{totalTerms} 条词汇</span>
        </WorkspaceHeading>

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside aria-label="教材目录" className="study-card hidden max-h-[calc(100dvh-7rem)] overflow-y-auto p-3 lg:sticky lg:top-20 lg:block">
            <h2 className="px-2 pb-2 pt-1 text-sm font-semibold text-foreground">教材目录</h2>
            {bookGroups.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <p className="px-2 py-2 text-[11px] font-semibold tracking-wide text-text-muted">{group.label}</p>
                <div className="space-y-1">
                  {group.books.map((book) => (
                    <button type="button" key={book.title} aria-pressed={!allBooks && book.index === activeBookIndex}
                      onClick={() => selectBook(book.index)}
                      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-text-muted hover:bg-background hover:text-primary aria-pressed:bg-study-soft aria-pressed:text-primary">
                      <BookOpen size={15} className={book.source ? "shrink-0 text-amber-700" : "shrink-0 text-text-light"} aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-words">{book.name}</span>
                      <ChevronRight size={13} className="shrink-0 opacity-55" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </aside>

          <section className="study-card min-w-0 overflow-hidden" aria-label="术语浏览">
            <div className="space-y-4 border-b border-card-border p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div role="search" className="relative min-w-[12rem] flex-1">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                  <label htmlFor="term-search" className="sr-only">搜索术语</label>
                  <input id="term-search" type="search" value={searchQuery} onChange={(event) => changeQuery(event.target.value)}
                    placeholder="搜索术语，如 pôle、频率响应、TCP"
                    className="w-full rounded-xl border border-card-border bg-background py-2.5 pl-9 pr-10 text-sm text-foreground placeholder:text-text-light" />
                  {searchQuery && <button type="button" onClick={() => changeQuery("")} aria-label="清空搜索"
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-text-muted hover:bg-white"><X size={16} /></button>}
                </div>
                <div className="hidden sm:block">
                  <div className="study-segment" role="group" aria-label="搜索范围">
                    <button type="button" aria-pressed={!allBooks} onClick={() => selectScope(false)}>本教材</button>
                    <button type="button" aria-pressed={allBooks} onClick={() => selectScope(true)}>全部教材</button>
                  </div>
                </div>
              </div>

              <div className="lg:hidden">
                <label htmlFor="term-book" className="mb-1.5 block text-xs font-medium text-text-muted">选择教材</label>
                <select id="term-book" value={allBooks ? "all" : activeBookIndex} onChange={(event) => {
                  if (event.target.value === "all") selectScope(true);
                  else selectBook(Number(event.target.value));
                }} className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm">
                  <option value="all">全部教材</option>
                  {bookGroups.map((group) => <optgroup key={group.label} label={group.label}>
                    {group.books.map((book) => <option key={book.title} value={book.index}>{book.name}</option>)}
                  </optgroup>)}
                </select>
              </div>

              {!allBooks && (
                <div className="rounded-xl bg-study-soft px-3.5 py-3.5 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-base font-semibold text-foreground">{activeBook.name}</h2>
                    <span className="rounded-md bg-white/85 px-2 py-0.5 text-[11px] font-medium text-text-muted">{activeBook.count} 条词汇</span>
                  </div>
                  {activeBook.source && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-text-muted">
                      <span>{activeBook.source.authors}</span>
                      <a href={activeBook.source.url} target="_blank" rel="noreferrer"
                        className="inline-flex min-w-0 items-start gap-1 font-semibold text-primary underline-offset-2 hover:underline">
                        <span className="break-words">{activeBook.source.title}</span><ArrowUpRight size={13} className="mt-1 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!allBooks && <div className="flex flex-wrap gap-1.5" role="group" aria-label="章节筛选">
                {["全部章节", ...activeBook.modules.map((module) => moduleTitle(module.name))].map((label, index) => (
                  <button type="button" key={index} aria-pressed={activeModuleIndex === index - 1}
                    onClick={() => { setActiveModuleIndex(index - 1); setLimit(PAGE_SIZE); }}
                    className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-primary aria-pressed:border-primary/25 aria-pressed:bg-study-soft aria-pressed:text-primary">
                    {label}
                  </button>
                ))}
              </div>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-3 sm:px-5">
              <p role="status" className="text-xs font-medium text-text-muted">
                {searchQuery.trim() ? "找到 " : "共 "}{results.length} 条词汇
              </p>
              <div className="study-segment" role="group" aria-label="显示语言">
                {languageModes.map((language) => (
                  <button type="button" key={language.id} onClick={() => setLangMode(language.id)}
                    aria-pressed={langMode === language.id}>{language.label}</button>
                ))}
              </div>
            </div>

            {results.length ? (
              <>
                <div aria-hidden="true" className={"hidden gap-5 border-b border-card-border bg-background/70 px-5 py-2.5 text-xs font-semibold text-text-muted md:grid " + columns}>
                  <span>中文</span>{showFrench && <span lang="fr">Français</span>}{showEnglish && <span lang="en">English</span>}
                </div>
                <ul className="divide-y divide-card-border">
                  {results.slice(0, limit).map(({ word, module, book, key }) => (
                    <li key={key} className={"grid gap-2.5 px-4 py-3.5 hover:bg-background/70 sm:px-5 md:items-center md:gap-5 " + columns}>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-6 text-foreground">{word.term_zh}</p>
                        <p className="mt-0.5 text-xs leading-5 text-text-muted">{allBooks ? book + " · " : ""}{module}</p>
                      </div>
                      {showFrench && <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 pt-1 text-[11px] text-text-muted md:hidden">法语</span>
                        <span lang="fr" className="min-w-0 break-words text-sm font-medium leading-6 text-foreground">{word.term_fr}</span>
                        <span className="shrink-0"><SpeakButton text={word.term_fr} lang="fr-FR" size={15} /></span>
                      </div>}
                      {showEnglish && <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 pt-1 text-[11px] text-text-muted md:hidden">英语</span>
                        <span lang="en" className="min-w-0 break-words text-sm leading-6 text-foreground">{word.term_en}</span>
                      </div>}
                    </li>
                  ))}
                </ul>
                {limit < results.length && (
                  <div className="flex items-center justify-center border-t border-card-border p-4">
                    <button type="button" className="study-button" onClick={() => setLimit((current) => current + PAGE_SIZE)}>显示更多词汇</button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
                <BookOpen size={26} className="text-primary-light" aria-hidden="true" />
                <h3 className="font-semibold">未找到匹配的术语</h3>
                <p className="text-sm text-text-muted">可以更换关键词，或扩大到全部教材。</p>
                <button type="button" className="study-button mt-2" onClick={() => { changeQuery(""); setActiveModuleIndex(-1); }}>清除筛选</button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
