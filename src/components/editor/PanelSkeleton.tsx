/** Pulse placeholder for side-panel content while an AI request is in flight. */
export default function PanelSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="rounded-md border border-[#e3ded4] bg-[#faf8f4] p-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-[#5c6470]">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#2e7d5b]" />
        {label}
      </div>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-2/3 animate-pulse rounded bg-[#e9e4d8]" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-2.5 animate-pulse rounded bg-[#efeadf]" style={{ width: `${92 - i * 14}%` }} />
        ))}
        <div className="flex gap-2 pt-1">
          <div className="h-6 w-20 animate-pulse rounded bg-[#e9e4d8]" />
          <div className="h-6 w-16 animate-pulse rounded bg-[#efeadf]" />
        </div>
      </div>
    </div>
  );
}
