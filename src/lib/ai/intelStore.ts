"use client";

import { create } from "zustand";
import type { LocalIntel } from "./context";

interface IntelState {
  open: boolean;
  intel: LocalIntel | null;
  setOpen: (v: boolean) => void;
  setIntel: (i: LocalIntel | null) => void;
}

export const useIntel = create<IntelState>((set) => ({
  open: false,
  intel: null,
  setOpen: (open) => set({ open }),
  setIntel: (intel) => set({ intel }),
}));
