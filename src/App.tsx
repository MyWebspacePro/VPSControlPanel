import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, ServerCog, Globe, Github, Terminal as TerminalIcon, Settings as SettingsIcon, Sun, Moon, Monitor } from "lucide-react";
import { useStore } from "./state/useStore";
import { useTheme } from "./state/useTheme";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/coolify", label: "Coolify", icon: ServerCog },
  { to: "/hestia", label: "Hestia", icon: Globe },
  { to: "/github", label: "GitHub", icon: Github },
  { to: "/terminal", label: "Terminal", icon: TerminalIcon },
];

export default function App() {
  const ready = useStore((s) => s.ready);
  const load = useStore((s) => s.load);
  const [theme, setTheme] = useTheme();
  const navigate = useNavigate();
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
        <div className="mt-auto">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition"
          >
            <SettingsIcon size={16} />
            Settings
          </button>
          <ThemeToggle theme={theme} setTheme={setTheme} />
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
            <ThemeToggle theme={theme} setTheme={setTheme} compact />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function ThemeToggle({
  theme,
  setTheme,
  compact,
}: {
  theme: "system" | "light" | "dark";
  setTheme: (t: "system" | "light" | "dark") => void;
  compact?: boolean;
}) {
  const options: Array<{ value: "system" | "light" | "dark"; icon: any; label: string }> = [
    { value: "system", icon: Monitor, label: "System" },
    { value: "light", icon: Sun, label: "Hell" },
    { value: "dark", icon: Moon, label: "Dunkel" },
  ];
  return (
    <div
      className={`flex gap-1 ${compact ? "" : "mt-2 px-3 py-1.5"}`}
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            title={o.label}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition ${
              active
                ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
            }`}
          >
            <Icon size={14} />
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}
