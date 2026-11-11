import type { ProgressValue } from "@/lib/uploadProgress";

export default function OperationProgress({ label, progress, detail }: {
  label: string;
  progress?: ProgressValue | null;
  detail?: string;
}) {
  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round(progress.completed * 100 / progress.total))
    : undefined;
  return (
    <div className="space-y-1.5 text-xs text-text-muted" role="status">
      <div className="flex flex-wrap justify-between gap-1">
        <span>{label}{detail ? " · " + detail : ""}</span>
        {percent !== undefined && <span className="tabular-nums">{percent}%</span>}
      </div>
      <progress
        aria-label={label}
        className="block h-2 w-full accent-primary"
        max={100}
        value={percent}
      />
    </div>
  );
}
