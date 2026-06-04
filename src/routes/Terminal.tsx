import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { Link } from "react-router-dom";
import { AlertCircle, Plus, X, Terminal as TerminalIcon } from "lucide-react";

interface Tab {
  id: string;
  profileId: string;
  profileName: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
}

export default function Terminal() {
  const profiles = useStore((s) => s.profiles);
  const sshProfiles = Object.values(profiles.ssh);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<{ data?: UnlistenFn; status?: UnlistenFn }>({});
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTab) return;
    const tab = tabs.find((t) => t.id === activeTab);
    if (!tab) return;

    const term = new XTerm({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      theme: getTheme(),
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current!);
    setTimeout(() => fit.fit(), 0);
    termRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[90mVerbinde …\x1b[0m");
    term.onData((data) => {
      if (sessionIdRef.current) {
        const arr = new Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        api.sshWrite(sessionIdRef.current, arr).catch(() => {});
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        if (sessionIdRef.current) {
          api.sshResize(
            sessionIdRef.current,
            term.cols,
            term.rows,
          ).catch(() => {});
        }
      } catch {}
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    api
      .sshOpen(tab.profileId, term.cols, term.rows)
      .then((sessionId) => {
        sessionIdRef.current = sessionId;
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab ? { ...t, status: "connecting" } : t,
          ),
        );
      })
      .catch((e) => {
        term.writeln(`\x1b[31mFehler: ${e}\x1b[0m`);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab
              ? { ...t, status: "error", error: String(e) }
              : t,
          ),
        );
      });

    listen<{ session_id: string; data: number[] }>("ssh://data", (e) => {
      if (e.payload.session_id === sessionIdRef.current) {
        term.write(new Uint8Array(e.payload.data));
      }
    }).then((u) => {
      unlistenRef.current.data = u;
    });
    listen<{ session_id: string; status: string }>("ssh://status", (e) => {
      if (e.payload.session_id !== sessionIdRef.current) return;
      const status = e.payload.status;
      if (status === "connected") {
        term.clear();
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab ? { ...t, status: "connected" } : t,
          ),
        );
      } else if (status === "disconnected" || status.startsWith("error")) {
        if (status !== "connecting") {
          term.writeln(`\r\n\x1b[90m[${status}]\x1b[0m`);
          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTab ? { ...t, status: "disconnected" } : t,
            ),
          );
        }
      }
    }).then((u) => {
      unlistenRef.current.status = u;
    });

    return () => {
      resizeObserver.disconnect();
      if (sessionIdRef.current) {
        api.sshDisconnect(sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
      unlistenRef.current.data?.();
      unlistenRef.current.status?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
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
    const profile = sshProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    const id = `${profileId}-${Date.now()}`;
    setTabs([...tabs, {
      id,
      profileId,
      profileName: profile.name,
      status: "connecting",
    }]);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    setTabs(tabs.filter((t) => t.id !== id));
    if (activeTab === id) {
      setActiveTab(tabs.length > 1 ? tabs[0].id : null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0d10]">
      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-elevated)] border-b border-[var(--border)] overflow-x-auto">
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
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            />
          </button>
        ))}
        <div className="relative group">
          <button className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            <Plus size={12} />
            Neu
          </button>
          <div className="absolute hidden group-hover:block top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-lg z-10 min-w-[160px]">
            {sshProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => openTab(p.id)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg)] whitespace-nowrap"
              >
                {p.name} ({p.user}@{p.host})
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {activeTab ? (
          <div ref={containerRef} className="absolute inset-0 p-2" />
        ) : (
          <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
            Wähle einen SSH-Tab oder erstelle einen neuen.
          </div>
        )}
      </div>
    </div>
  );
}

function getTheme() {
  const dark = document.documentElement.classList.contains("dark");
  return dark
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
