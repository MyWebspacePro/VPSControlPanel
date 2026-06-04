import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ServerCog, Globe, Github, Terminal as TerminalIcon, Settings as SettingsIcon, Sun, Moon, Monitor } from "lucide-react";
import { useStore } from "./state/useStore";
import { useTheme } from "./state/useTheme";
import Terminal from "./routes/Terminal";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/coolify", label: "Coolify", icon: ServerCog },
  { to: "/hestia", label: "Hestia", icon: Globe },
  { to: "/github", label: "GitHub", icon: Github },
  { to: "/terminal", label: "Terminal", icon: TerminalIcon },
];

type Theme = "system" | "light" | "dark";

function ThemeToggleButton({
  theme,
  onCycle,
  size = 16,
}: {
  theme: Theme;
  onCycle: () => void;
  size?: number;
}) {
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  const title =
    theme === "system"
      ? "System — klicken für Hell"
      : theme === "light"
        ? "Hell — klicken für Dunkel"
        : "Dunkel — klicken für System";
  return (
    <button
      onClick={onCycle}
      title={title}
      aria-label={title}
      className="flex items-center justify-center p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition"
    >
      <Icon size={size} />
    </button>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const load = useStore((s) => s.load);
  const [theme, , , cycleTheme] = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isTerminal = location.pathname.startsWith("/terminal");
  const [readyTimer, setReadyTimer] = useState(0);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (ready && readyTimer === 0) {
      const t = setTimeout(() => setReadyTimer(1), 0);
      return () => clearTimeout(t);
    }
  }, [ready, readyTimer]);

  if (!ready) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[var(--text-muted)]">
        <div className="text-sm">Lade Vault …</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-[var(--bg)] text-[var(--text)]">
      <aside className="hidden md:flex w-56 flex-col border-r border-[var(--border)] p-3 gap-1">
        <div className="px-3 py-3 mb-2">
          <div className="text-sm font-semibold">VPS Control Panel</div>
          <div className="text-[11px] text-[var(--text-muted)]">aiconso · v0.1.0</div>
        </div>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
              }`
            }
          >
            <t.icon size={16} />
            {t.label}
          </NavLink>
        ))}
        <div className="mt-auto flex items-center gap-1 px-2">
          <button
            onClick={() => navigate("/settings")}
            className="flex-1 flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition"
          >
            <SettingsIcon size={16} />
            Settings
          </button>
          <ThemeToggleButton theme={theme} onCycle={cycleTheme} />
        </div>
      </aside>

      <main className="flex-1 min-h-0 flex flex-col">
        <div className="md:hidden flex items-center justify-between border-b border-[var(--border)] px-2 py-1">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] ${
                    isActive
                      ? "text-[var(--accent)]"
                      : "text-[var(--text-muted)]"
                  }`
                }
              >
                <t.icon size={18} />
                {t.label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-1 pr-1">
            <button
              onClick={() => navigate("/settings")}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
            >
              <SettingsIcon size={16} />
            </button>
            <ThemeToggleButton theme={theme} onCycle={cycleTheme} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div
            className="absolute inset-0"
            style={{ display: isTerminal ? "none" : "block" }}
          >
            <Outlet />
          </div>
          <div
            className="absolute inset-0"
            style={{ display: isTerminal ? "block" : "none" }}
            aria-hidden={!isTerminal}
          >
            <Terminal />
          </div>
        </div>
      </main>
    </div>
  );
}
