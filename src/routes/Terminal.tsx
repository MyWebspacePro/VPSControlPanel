import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { useTheme } from "../state/useTheme";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Plus,
  X,
  Terminal as TerminalIcon,
  Server,
} from "lucide-react";

type TabStatus = "connecting" | "connected" | "disconnected" | "error";

interface Tab {
  id: string;
  profileId: string;
  profileName: string;
  status: TabStatus;
  error?: string;
}

interface TabState {
  term: XTerm;
  fit: FitAddon;
  sessionId: string | null;
  pendingOpen: Promise<string | null> | null;
  unlistens: { data: UnlistenFn | null; status: UnlistenFn | null };
  resizeObserver: ResizeObserver | null;
  containerEl: HTMLDivElement | null;
  disposed: boolean;
}

const MAX_TABS = 3;

export default function Terminal() {
  const profiles = useStore((s) => s.profiles);
  const sshProfiles = Object.values(profiles.ssh);
  const [theme, , resolvedGetter] = useTheme();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  const tabStatesRef = useRef<Map<string, TabState>>(new Map());
  const profilePickerRef = useRef<HTMLDivElement>(null);

  // Close profile picker on outside click
  useEffect(() => {
    if (!showProfilePicker) return;
    const handle = (e: MouseEvent) => {
      if (
        profilePickerRef.current &&
        !profilePickerRef.current.contains(e.target as Node)
      ) {
        setShowProfilePicker(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showProfilePicker]);

  // Update xterm themes when user toggles dark mode
  useEffect(() => {
    const t = getTheme(resolvedGetter());
    for (const state of tabStatesRef.current.values()) {
      if (!state.disposed) {
        state.term.options.theme = t;
      }
    }
  }, [theme, resolvedGetter]);

  // Manage tab lifecycle: create state for new tabs, clean up removed tabs
  useEffect(() => {
    const states = tabStatesRef.current;
    const validIds = new Set(tabs.map((t) => t.id));

    // Clean up tabs that no longer exist
    for (const [id, state] of Array.from(states.entries())) {
      if (!validIds.has(id)) {
        state.disposed = true;
        // If sshOpen is in flight, wait for it then disconnect
        if (state.pendingOpen) {
          state.pendingOpen
            .then((sessionId) => {
              if (sessionId) api.sshDisconnect(sessionId).catch(() => {});
            })
            .catch(() => {});
        } else if (state.sessionId) {
          api.sshDisconnect(state.sessionId).catch(() => {});
        }
        state.unlistens.data?.();
        state.unlistens.status?.();
        state.unlistens.data = null;
        state.unlistens.status = null;
        try {
          state.resizeObserver?.disconnect();
        } catch {}
        state.resizeObserver = null;
        try {
          state.term.dispose();
        } catch {}
        states.delete(id);
      }
    }

    // Set up new tabs
    for (const tab of tabs) {
      if (states.has(tab.id)) continue;
      const containerEl = document.getElementById(
        `terminal-container-${tab.id}`,
      ) as HTMLDivElement | null;
      if (!containerEl) continue;

      const term = new XTerm({
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        theme: getTheme(resolvedGetter()),
        cursorBlink: true,
        allowProposedApi: true,
        scrollback: 10000,
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(containerEl);
      setTimeout(() => {
        try {
          fit.fit();
        } catch {}
      }, 0);

      const state: TabState = {
        term,
        fit,
        sessionId: null,
        pendingOpen: null,
        unlistens: { data: null, status: null },
        resizeObserver: null,
        containerEl,
        disposed: false,
      };
      states.set(tab.id, state);

      term.onData((data) => {
        if (state.disposed) return;
        if (state.sessionId) {
          const arr = new Array(data.length);
          for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
          api.sshWrite(state.sessionId, arr).catch(() => {});
        }
      });

      // Resize observer attached synchronously, before the async open
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
          if (state.sessionId) {
            api
              .sshResize(state.sessionId, term.cols, term.rows)
              .catch(() => {});
          }
        } catch {}
      });
      ro.observe(containerEl);
      state.resizeObserver = ro;

      term.writeln("\x1b[90mVerbinde …\x1b[0m");

      const tabId = tab.id;
      const profileId = tab.profileId;

      const openPromise = (async () => {
        try {
          const cols = term.cols || 80;
          const rows = term.rows || 24;
          const sessionId = await api.sshOpen(profileId, cols, rows);
          // If the tab was closed while we were awaiting, disconnect now
          if (state.disposed) {
            api.sshDisconnect(sessionId).catch(() => {});
            return sessionId;
          }
          state.sessionId = sessionId;
          state.pendingOpen = null;
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId ? { ...t, status: "connecting" } : t,
            ),
          );

          const dataUnlisten = await listen<{
            session_id: string;
            data: number[];
          }>("ssh://data", (e) => {
            if (e.payload.session_id === sessionId) {
              term.write(new Uint8Array(e.payload.data));
            }
          });
          if (state.disposed) {
            dataUnlisten();
            api.sshDisconnect(sessionId).catch(() => {});
            return sessionId;
          }
          state.unlistens.data = dataUnlisten;

          const statusUnlisten = await listen<{
            session_id: string;
            status: string;
          }>("ssh://status", (e) => {
            if (e.payload.session_id !== sessionId) return;
            const status = e.payload.status;
            if (status === "connected") {
              term.clear();
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === tabId ? { ...t, status: "connected" } : t,
                ),
              );
            } else if (status === "disconnected" || status.startsWith("error")) {
              if (status !== "connecting") {
                term.writeln(`\r\n\x1b[90m[${status}]\x1b[0m`);
                setTabs((prev) =>
                  prev.map((t) =>
                    t.id === tabId ? { ...t, status: "disconnected" } : t,
                  ),
                );
              }
            }
          });
          if (state.disposed) {
            statusUnlisten();
            dataUnlisten();
            api.sshDisconnect(sessionId).catch(() => {});
            return sessionId;
          }
          state.unlistens.status = statusUnlisten;
          return sessionId;
        } catch (e) {
          if (!state.disposed) {
            term.writeln(`\r\n\x1b[31mFehler: ${e}\x1b[0m`);
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tabId
                  ? { ...t, status: "error", error: String(e) }
                  : t,
              ),
            );
          }
          throw e;
        }
      })();
      state.pendingOpen = openPromise.catch(() => null);
    }
  }, [tabs, resolvedGetter]);

  // Cleanup all on unmount
  useEffect(() => {
    const states = tabStatesRef.current;
    return () => {
      for (const [, state] of Array.from(states.entries())) {
        state.disposed = true;
        if (state.pendingOpen) {
          state.pendingOpen
            .then((sessionId) => {
              if (sessionId) api.sshDisconnect(sessionId).catch(() => {});
            })
            .catch(() => {});
        } else if (state.sessionId) {
          api.sshDisconnect(state.sessionId).catch(() => {});
        }
        state.unlistens.data?.();
        state.unlistens.status?.();
        state.unlistens.data = null;
        state.unlistens.status = null;
        try {
          state.resizeObserver?.disconnect();
        } catch {}
        state.resizeObserver = null;
        try {
          state.term.dispose();
        } catch {}
      }
      states.clear();
    };
  }, []);

  // Re-fit when active tab changes
  useEffect(() => {
    if (!activeTab) return;
    const state = tabStatesRef.current.get(activeTab);
    if (!state) return;
    requestAnimationFrame(() => {
      try {
        state.fit.fit();
        if (state.sessionId) {
          api
            .sshResize(state.sessionId, state.term.cols, state.term.rows)
            .catch(() => {});
        }
      } catch {}
    });
  }, [activeTab]);

  if (sshProfiles.length === 0) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <h1 className="text-xl font-semibold mb-4">Terminal</h1>
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[var(--warning)] mt-0.5" size={18} />
            <div>
              <div className="font-medium">Keine SSH-Profile</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Füge ein SSH-Profil in den{" "}
                <Link to="/settings" className="text-[var(--accent)] underline">
                  Einstellungen
                </Link>{" "}
                hinzu.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const openTab = (profileId: string) => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const profile = sshProfiles.find((p) => p.id === profileId);
      if (!profile) return prev;
      const id = crypto.randomUUID();
      const newTab: Tab = {
        id,
        profileId,
        profileName: profile.name,
        status: "connecting",
      };
      // Schedule active tab change after this state update
      queueMicrotask(() => setActiveTab(id));
      setShowProfilePicker(false);
      return [...prev, newTab];
    });
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      // If we just closed the active tab, switch to the first remaining
      if (activeTab === id) {
        queueMicrotask(() =>
          setActiveTab(remaining.length > 0 ? remaining[0].id : null),
        );
      }
      return remaining;
    });
  };

  if (tabs.length === 0) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <h1 className="text-xl font-semibold mb-4">Terminal</h1>
        <div className="card max-w-2xl">
          <div className="font-medium mb-3">Verbindung öffnen</div>
          <div className="text-sm text-[var(--text-muted)] mb-4">
            Tipp: Tippe nach dem Verbinden einfach{" "}
            <code className="px-1.5 py-0.5 bg-[var(--bg)] rounded text-xs">
              hermes
            </code>{" "}
            um den AI-Chat auf dem VPS zu starten.
          </div>
          <div className="text-xs text-[var(--text-muted)] mb-3">
            Maximal {MAX_TABS} parallele Sitzungen.
          </div>
          <div className="space-y-2">
            {sshProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => openTab(p.id)}
                className="w-full card flex items-center justify-between hover:border-[var(--accent)] transition text-left"
              >
                <div className="flex items-center gap-3">
                  <Server size={16} className="text-[var(--text-muted)]" />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {p.user}@{p.host}:{p.port}
                    </div>
                  </div>
                </div>
                <span className="text-[var(--accent)] text-sm">Öffnen →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const atCap = tabs.length >= MAX_TABS;

  return (
    <div className="h-full flex flex-col bg-[#0b0d10]">
      <div className="flex items-center bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <div
          className="flex items-center gap-1 px-2 py-1 overflow-x-auto flex-1 min-w-0"
          style={{ scrollbarWidth: "thin" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "bg-[#0b0d10] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg)]"
              }`}
            >
              <TerminalIcon size={12} />
              {tab.profileName}
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  tab.status === "connected"
                    ? "bg-[var(--success)]"
                    : tab.status === "error"
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--warning)]"
                }`}
              />
              <X
                size={12}
                className="opacity-60 hover:opacity-100"
                aria-label={`Tab ${tab.profileName} schließen`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              />
            </button>
          ))}
        </div>
        <div
          className="relative border-l border-[var(--border)]"
          ref={profilePickerRef}
        >
          <button
            onClick={() =>
              !atCap && setShowProfilePicker(!showProfilePicker)
            }
            disabled={atCap}
            title={
              atCap
                ? `Maximal ${MAX_TABS} parallele Sitzungen erreicht`
                : "Neue Sitzung"
            }
            aria-label="Neue SSH-Sitzung"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs ${
              atCap
                ? "text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
            }`}
          >
            <Plus size={14} />
            Neu
            {atCap && (
              <span className="text-[10px] opacity-70">
                ({tabs.length}/{MAX_TABS})
              </span>
            )}
          </button>
          {showProfilePicker && (
            <div className="absolute top-full right-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-lg z-20 min-w-[220px]">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border)]">
                Profil wählen
              </div>
              {sshProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openTab(p.id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg)] whitespace-nowrap flex items-center gap-2"
                >
                  <Server size={12} className="text-[var(--text-muted)]" />
                  <div>
                    <div>{p.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {p.user}@{p.host}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative bg-[#0b0d10]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`terminal-container-${tab.id}`}
            className="absolute inset-0 p-2"
            style={{ display: tab.id === activeTab ? "block" : "none" }}
          />
        ))}
      </div>
    </div>
  );
}

function getTheme(resolved: "light" | "dark") {
  return resolved === "dark"
    ? {
        background: "#0b0d10",
        foreground: "#e5e7eb",
        cursor: "#e5e7eb",
        black: "#000000",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e5e7eb",
        brightBlack: "#6b7280",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#f3f4f6",
      }
    : {
        background: "#ffffff",
        foreground: "#111827",
        cursor: "#111827",
        black: "#000000",
        red: "#dc2626",
        green: "#16a34a",
        yellow: "#d97706",
        blue: "#2563eb",
        magenta: "#9333ea",
        cyan: "#0891b2",
        white: "#f3f4f6",
        brightBlack: "#6b7280",
        brightRed: "#ef4444",
        brightGreen: "#22c55e",
        brightYellow: "#f59e0b",
        brightBlue: "#3b82f6",
        brightMagenta: "#a855f7",
        brightCyan: "#06b6d4",
        brightWhite: "#ffffff",
      };
}
