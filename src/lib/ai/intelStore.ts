"use client";

import { create } from "zustand";
import type { LocalIntel } from "./context";

export type IntelStatus = "idle" | "loading" | "ready" | "error";

interface IntelState {
  open: boolean;
  intel: LocalIntel | null;
  /** Background auto-load state for the current project. */
  status: IntelStatus;
  /** Rounded-lat/lng cache key the current intel belongs to. */
  key: string | null;
  setOpen: (v: boolean) => void;
  setIntel: (i: LocalIntel | null) => void;
  setStatus: (s: IntelStatus, key?: string | null) => void;
}

export const useIntel = create<IntelState>((set) => ({
  open: false,
  intel: null,
  status: "idle",
  key: null,
  setOpen: (open) => set({ open }),
  setIntel: (intel) => set((s) => ({ intel, status: intel ? "ready" : s.status })),
  setStatus: (status, key) => set((s) => ({ status, key: key === undefined ? s.key : key })),
}));
