import { create } from "zustand";

export type TerminalTabStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "restored";

export interface TerminalTab {
  id: string;
  profileId: string;
  profileName: string;
  status: TerminalTabStatus;
  sessionId: string | null;
  error?: string;
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  setTabs: (tabs: TerminalTab[]) => void;
  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  updateTab: (id: string, updates: Partial<TerminalTab>) => void;
  clearAll: () => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  tabs: [],
  activeTabId: null,
  setTabs: (tabs) => set({ tabs }),
  addTab: (tab) =>
    set((s) => {
      if (s.tabs.some((t) => t.id === tab.id)) return s;
      return { tabs: [...s.tabs, tab] };
    }),
  removeTab: (id) =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      const nextActive =
        s.activeTabId === id
          ? remaining.length > 0
            ? remaining[0].id
            : null
          : s.activeTabId;
      return { tabs: remaining, activeTabId: nextActive };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  clearAll: () => set({ tabs: [], activeTabId: null }),
}));
