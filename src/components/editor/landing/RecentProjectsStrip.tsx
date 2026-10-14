"use client";

import { FolderOpen, Clock, ArrowRight, Plus } from "lucide-react";

interface RecentProjectsStripProps {
  recent: { projectId: string; name: string; modifiedAt: string }[];
  onOpenProject: (projectId: string) => void;
  onNewBlank: () => void;
}

export default function RecentProjectsStrip({
  recent,
  onOpenProject,
  onNewBlank,
}: RecentProjectsStripProps) {
  if (recent.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between pb-3 border-b border-[#e3ded4]">
        <div className="flex items-center gap-2">
          <FolderOpen strokeWidth={1.5} className="h-4 w-4 text-[#2e7d5b]" />
          <h3 className="font-mono text-xs uppercase tracking-wider text-[#1d2430] font-semibold">
            Saved Projects on this Device
          </h3>
          <span className="rounded bg-[#faf8f4] border border-[#e3ded4] px-1.5 py-0.5 font-mono text-[10px] text-[#8a8272]">
            {recent.length} {recent.length === 1 ? "project" : "projects"}
          </span>
        </div>
        <button
          onClick={onNewBlank}
          className="flex items-center gap-1 font-mono text-[11px] text-[#2e7d5b] hover:underline"
        >
          <Plus strokeWidth={1.5} className="h-3 w-3" />
          <span>New blank canvas</span>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recent.map((item) => (
          <button
            key={item.projectId}
            onClick={() => onOpenProject(item.projectId)}
            className="group flex flex-col justify-between rounded-lg border border-[#e3ded4] bg-white p-4 text-left transition hover:border-[#2e7d5b] hover:shadow-xs"
          >
            <div>
              <div className="font-medium text-sm text-[#1d2430] group-hover:text-[#2e7d5b] transition">
                {item.name}
              </div>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-[#8a8272]">
                <Clock strokeWidth={1.5} className="h-3 w-3" />
                <span>{new Date(item.modifiedAt).toLocaleDateString()} at {new Date(item.modifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#eee9df] font-mono text-[10px] text-[#8a8272]">
              <span>ID: {item.projectId.slice(0, 8)}…</span>
              <span className="flex items-center gap-1 text-[#2e7d5b] font-medium group-hover:translate-x-0.5 transition-transform">
                Open <ArrowRight strokeWidth={1.5} className="h-3 w-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
