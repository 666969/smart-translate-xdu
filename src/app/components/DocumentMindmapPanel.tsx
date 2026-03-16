"use client";

import MermaidRenderer from "./MermaidRenderer";

interface DocumentMindmapPanelProps {
  mermaidData: string;
}

export default function DocumentMindmapPanel({
  mermaidData,
}: DocumentMindmapPanelProps) {
  return (
    <div className="p-4 rounded-xl bg-background border border-card-border shadow-sm overflow-x-auto">
      <h3 className="text-sm font-semibold text-indigo-500 mb-3 flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </span>
        知识脉络导图
      </h3>
      <div className="min-w-[500px]">
        <MermaidRenderer code={mermaidData} />
      </div>
    </div>
  );
}
