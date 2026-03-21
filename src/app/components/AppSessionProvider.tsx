"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { QuizItem, QuizLang } from "./DocumentQuizPanel";
import type { KeywordItem } from "./KeywordGlossary";
import type { PdfExtractStatus } from "@/lib/pdfParser";
import type { TranslationLayoutBlock } from "@/lib/translationLayout";

interface SessionChatMessage {
  role: "user" | "assistant";
  content: string;
}

type HomeMode = "snippet" | "document";
type NotebookTab = "vocab" | "wrong";

interface HomeSessionState {
  mode: HomeMode;
  setMode: Dispatch<SetStateAction<HomeMode>>;
  deepMode: boolean;
  setDeepMode: Dispatch<SetStateAction<boolean>>;
  snippetText: string;
  setSnippetText: Dispatch<SetStateAction<string>>;
  snippetFile: File | null;
  setSnippetFile: Dispatch<SetStateAction<File | null>>;
  snippetPreviewUrl: string | null;
  setSnippetPreviewUrl: Dispatch<SetStateAction<string | null>>;
  documentFiles: File[];
  setDocumentFiles: Dispatch<SetStateAction<File[]>>;
  documentPreviewUrls: string[];
  setDocumentPreviewUrls: Dispatch<SetStateAction<string[]>>;
  quizLang: QuizLang;
  setQuizLang: Dispatch<SetStateAction<QuizLang>>;
  chatOpen: boolean;
  setChatOpen: Dispatch<SetStateAction<boolean>>;
  chatMessage: string;
  setChatMessage: Dispatch<SetStateAction<string>>;
  chatMessages: SessionChatMessage[];
  setChatMessages: Dispatch<SetStateAction<SessionChatMessage[]>>;
  translationResult: string | null;
  setTranslationResult: Dispatch<SetStateAction<string | null>>;
  translationLayoutResult: TranslationLayoutBlock[];
  setTranslationLayoutResult: Dispatch<SetStateAction<TranslationLayoutBlock[]>>;
  analysisResult: string | null;
  setAnalysisResult: Dispatch<SetStateAction<string | null>>;
  keywordsResult: string | null;
  setKeywordsResult: Dispatch<SetStateAction<string | null>>;
  keywordItemsResult: KeywordItem[];
  setKeywordItemsResult: Dispatch<SetStateAction<KeywordItem[]>>;
  mermaidData: string | null;
  setMermaidData: Dispatch<SetStateAction<string | null>>;
  quizData: QuizItem[] | null;
  setQuizData: Dispatch<SetStateAction<QuizItem[] | null>>;
  errorMessage: string | null;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
}

interface PdfSessionState {
  pdfFile: File | null;
  setPdfFile: Dispatch<SetStateAction<File | null>>;
  pdfText: string | null;
  setPdfText: Dispatch<SetStateAction<string | null>>;
  pdfPages: string[];
  setPdfPages: Dispatch<SetStateAction<string[]>>;
  pdfUrl: string | null;
  setPdfUrl: Dispatch<SetStateAction<string | null>>;
  pdfPreviewReady: boolean;
  setPdfPreviewReady: Dispatch<SetStateAction<boolean>>;
  pdfExtractStatus: "idle" | PdfExtractStatus;
  setPdfExtractStatus: Dispatch<SetStateAction<"idle" | PdfExtractStatus>>;
  pdfExtractReason: string | null;
  setPdfExtractReason: Dispatch<SetStateAction<string | null>>;
  pageCount: number;
  setPageCount: Dispatch<SetStateAction<number>>;
  summary: string | null;
  setSummary: Dispatch<SetStateAction<string | null>>;
  deepMode: boolean;
  setDeepMode: Dispatch<SetStateAction<boolean>>;
  scanFallbackMode: boolean;
  setScanFallbackMode: Dispatch<SetStateAction<boolean>>;
  scanPageSelection: string;
  setScanPageSelection: Dispatch<SetStateAction<string>>;
  lastResolvedPageLabel: string | null;
  setLastResolvedPageLabel: Dispatch<SetStateAction<string | null>>;
  chatMessages: SessionChatMessage[];
  setChatMessages: Dispatch<SetStateAction<SessionChatMessage[]>>;
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
}

interface NotebookSessionState {
  tab: NotebookTab;
  setTab: Dispatch<SetStateAction<NotebookTab>>;
  isReviewing: boolean;
  setIsReviewing: Dispatch<SetStateAction<boolean>>;
  requizItemId: number | null;
  setRequizItemId: Dispatch<SetStateAction<number | null>>;
  flippedCardIds: number[];
  setFlippedCardIds: Dispatch<SetStateAction<number[]>>;
}

interface AppSessionValue {
  home: HomeSessionState;
  pdf: PdfSessionState;
  notebook: NotebookSessionState;
}

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [homeMode, setHomeMode] = useState<HomeMode>("snippet");
  const [homeDeepMode, setHomeDeepMode] = useState(false);
  const [snippetText, setSnippetText] = useState("");
  const [snippetFile, setSnippetFile] = useState<File | null>(null);
  const [snippetPreviewUrl, setSnippetPreviewUrl] = useState<string | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<string[]>([]);
  const [quizLang, setQuizLang] = useState<QuizLang>("zh");
  const [homeChatOpen, setHomeChatOpen] = useState(false);
  const [homeChatMessage, setHomeChatMessage] = useState("");
  const [homeChatMessages, setHomeChatMessages] = useState<SessionChatMessage[]>([]);
  const [translationResult, setTranslationResult] = useState<string | null>(null);
  const [translationLayoutResult, setTranslationLayoutResult] = useState<TranslationLayoutBlock[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [keywordsResult, setKeywordsResult] = useState<string | null>(null);
  const [keywordItemsResult, setKeywordItemsResult] = useState<KeywordItem[]>([]);
  const [mermaidData, setMermaidData] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizItem[] | null>(null);
  const [homeErrorMessage, setHomeErrorMessage] = useState<string | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPreviewReady, setPdfPreviewReady] = useState(false);
  const [pdfExtractStatus, setPdfExtractStatus] = useState<"idle" | PdfExtractStatus>("idle");
  const [pdfExtractReason, setPdfExtractReason] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [pdfDeepMode, setPdfDeepMode] = useState(false);
  const [scanFallbackMode, setScanFallbackMode] = useState(false);
  const [scanPageSelection, setScanPageSelection] = useState("1");
  const [lastResolvedPageLabel, setLastResolvedPageLabel] = useState<string | null>(null);
  const [pdfChatMessages, setPdfChatMessages] = useState<SessionChatMessage[]>([]);
  const [pdfChatInput, setPdfChatInput] = useState("");

  const [notebookTab, setNotebookTab] = useState<NotebookTab>("vocab");
  const [notebookIsReviewing, setNotebookIsReviewing] = useState(false);
  const [notebookRequizItemId, setNotebookRequizItemId] = useState<number | null>(null);
  const [notebookFlippedCardIds, setNotebookFlippedCardIds] = useState<number[]>([]);

  const value = useMemo<AppSessionValue>(
    () => ({
      home: {
        mode: homeMode,
        setMode: setHomeMode,
        deepMode: homeDeepMode,
        setDeepMode: setHomeDeepMode,
        snippetText,
        setSnippetText,
        snippetFile,
        setSnippetFile,
        snippetPreviewUrl,
        setSnippetPreviewUrl,
        documentFiles,
        setDocumentFiles,
        documentPreviewUrls,
        setDocumentPreviewUrls,
        quizLang,
        setQuizLang,
        chatOpen: homeChatOpen,
        setChatOpen: setHomeChatOpen,
        chatMessage: homeChatMessage,
        setChatMessage: setHomeChatMessage,
        chatMessages: homeChatMessages,
        setChatMessages: setHomeChatMessages,
        translationResult,
        setTranslationResult,
        translationLayoutResult,
        setTranslationLayoutResult,
        analysisResult,
        setAnalysisResult,
        keywordsResult,
        setKeywordsResult,
        keywordItemsResult,
        setKeywordItemsResult,
        mermaidData,
        setMermaidData,
        quizData,
        setQuizData,
        errorMessage: homeErrorMessage,
        setErrorMessage: setHomeErrorMessage,
      },
      pdf: {
        pdfFile,
        setPdfFile,
        pdfText,
        setPdfText,
        pdfPages,
        setPdfPages,
        pdfUrl,
        setPdfUrl,
        pdfPreviewReady,
        setPdfPreviewReady,
        pdfExtractStatus,
        setPdfExtractStatus,
        pdfExtractReason,
        setPdfExtractReason,
        pageCount,
        setPageCount,
        summary,
        setSummary,
        deepMode: pdfDeepMode,
        setDeepMode: setPdfDeepMode,
        scanFallbackMode,
        setScanFallbackMode,
        scanPageSelection,
        setScanPageSelection,
        lastResolvedPageLabel,
        setLastResolvedPageLabel,
        chatMessages: pdfChatMessages,
        setChatMessages: setPdfChatMessages,
        chatInput: pdfChatInput,
        setChatInput: setPdfChatInput,
      },
      notebook: {
        tab: notebookTab,
        setTab: setNotebookTab,
        isReviewing: notebookIsReviewing,
        setIsReviewing: setNotebookIsReviewing,
        requizItemId: notebookRequizItemId,
        setRequizItemId: setNotebookRequizItemId,
        flippedCardIds: notebookFlippedCardIds,
        setFlippedCardIds: setNotebookFlippedCardIds,
      },
    }),
    [
      analysisResult,
      documentFiles,
      documentPreviewUrls,
      homeChatMessage,
      homeChatMessages,
      homeChatOpen,
      homeDeepMode,
      homeErrorMessage,
      homeMode,
      keywordItemsResult,
      keywordsResult,
      lastResolvedPageLabel,
      mermaidData,
      notebookFlippedCardIds,
      notebookIsReviewing,
      notebookRequizItemId,
      notebookTab,
      pageCount,
      pdfChatInput,
      pdfChatMessages,
      pdfDeepMode,
      pdfExtractReason,
      pdfExtractStatus,
      pdfFile,
      pdfPages,
      pdfPreviewReady,
      pdfText,
      pdfUrl,
      quizData,
      quizLang,
      scanFallbackMode,
      scanPageSelection,
      snippetFile,
      snippetPreviewUrl,
      snippetText,
      summary,
      translationLayoutResult,
      translationResult,
    ]
  );

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const context = useContext(AppSessionContext);

  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }

  return context;
}
