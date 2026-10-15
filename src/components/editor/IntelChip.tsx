"use client";

import { useIntel } from "@/lib/ai/intelStore";
import { cn } from "@/lib/utils";

/** "Local context: <place> · grounded/ungrounded" chip; opens the Local Intel panel. */
export default function IntelChip() {
  const intel = useIntel((s) => s.intel);
  const status = useIntel((s) => s.status);
  const setOpen = useIntel((s) => s.setOpen);
  if (status === "idle" && !intel) return null;
  const label = intel
    ? `Local context: ${intel.placeName} · ${intel.grounded ? "grounded" : "ungrounded"}`
    : status === "loading"
      ? "Local context: loading…"
      : "Local context: unavailable · open to retry";
  return (
    <button
      type="button"
      data-testid="intel-chip"
      onClick={() => setOpen(true)}
      title="Open Local safety intel — shared with the planner, quick picks and behaviour policy"
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[11px] hover:brightness-95",
        intel?.grounded ? "border-[#cfe3d8] bg-[#eef6f1] text-[#2e7d5b]" : "border-[#e6d9b8] bg-[#fdf9ef] text-[#7a5d1e]"
      )}
    >
      <span>◎</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="shrink-0 text-[10px] underline">details</span>
    </button>
  );
}
