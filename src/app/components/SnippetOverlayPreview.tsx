"use client";

import type { CSSProperties } from "react";

import MarkdownRenderer from "./MarkdownRenderer";

export interface SnippetOverlayBlock {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  align?: "left" | "center" | "right";
}

interface SnippetOverlayPreviewProps {
  overlays: SnippetOverlayBlock[];
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageUrl?: string;
  showOriginalImage?: boolean;
  className?: string;
}

export default function SnippetOverlayPreview({
  overlays,
  imageWidth,
  imageHeight,
  imageUrl,
  showOriginalImage = false,
  className = "",
}: SnippetOverlayPreviewProps) {
  const aspectRatio =
    imageWidth && imageHeight ? `${imageWidth} / ${imageHeight}` : "3 / 4";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[28px] border border-card-border bg-white shadow-sm ${className}`}
      style={{ aspectRatio }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]" />
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />
      {showOriginalImage && imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="翻译复刻预览"
            className="absolute inset-0 h-full w-full object-contain opacity-20"
          />
          <div className="absolute inset-0 bg-white/25" />
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        {overlays.map((overlay) => {
          const style: CSSProperties = {
            left: `${overlay.x / 10}%`,
            top: `${overlay.y / 10}%`,
            width: `${overlay.width / 10}%`,
            minHeight: `${overlay.height / 10}%`,
            textAlign: overlay.align ?? "left",
          };

          return (
            <div
              key={overlay.id}
              style={style}
              className="absolute px-2 py-1"
            >
              <MarkdownRenderer
                content={overlay.text}
                className="[&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-6 [&_p]:font-medium [&_p]:text-slate-800 [&_.math-display]:my-1 [&_.math-display]:py-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
