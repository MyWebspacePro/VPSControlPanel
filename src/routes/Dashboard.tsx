import { useEffect, useState } from "react";
import { api, type DashboardData } from "../lib/api";
import { useStore } from "../state/useStore";
import { RefreshCw, Cpu, MemoryStick, HardDrive, Activity, AlertCircle } from "lucide-react";

export default function Dashboard() {
  const profiles = useStore((s) => s.profiles);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await api.getDashboard();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, []);

  const hasAnyProfile =
    Object.keys(profiles.ssh).length +
      Object.keys(profiles.coolify).length +
      Object.keys(profiles.hestia).length +
      (profiles.github ? 1 : 0) >
    0;

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          {lastRefresh && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              Aktualisiert: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <button className="btn" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {!hasAnyProfile && (
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[var(--warning)] mt-0.5" size={18} />
            <div>
              <div className="font-medium">Noch keine Verbindungen</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Öffne die <a href="/settings" className="text-[var(--accent)] underline">Einstellungen</a> und füge deine SSH-, Coolify-, Hestia- oder GitHub-Profile hinzu, um hier Live-Daten zu sehen.
              </div>
            </div>
          </div>
        </div>
      )}

      {data?.vps_stats && <VpsCard stats={data.vps_stats} error={data.vps_error} />}
      {data?.vps_error && !data.vps_stats && <ErrorCard title="VPS" error={data.vps_error} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.coolify_summary && <CoolifyCard summary={data.coolify_summary} />}
        {data?.coolify_error && !data.coolify_summary && (
          <ErrorCard title="Coolify" error={data.coolify_error} />
        )}
        {data?.hestia_summary && <HestiaCard summary={data.hestia_summary} />}
        {data?.hestia_error && !data.hestia_summary && (
          <ErrorCard title="Hestia" error={data.hestia_error} />
        )}
        {data?.github_summary && <GithubCard summary={data.github_summary} />}
        {data?.github_error && !data.github_summary && (
          <ErrorCard title="GitHub" error={data.github_error} />
        )}
      </div>
    </div>
  );
}

function VpsCard({ stats, error }: { stats: any; error: string | null }) {
  const memPct = stats.mem_total_mb
    ? Math.round((stats.mem_used_mb / stats.mem_total_mb) * 100)
    : 0;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-[var(--text-muted)]">VPS</div>
          <div className="text-lg font-semibold">{stats.hostname || "—"}</div>
        </div>
        <Activity size={20} className="text-[var(--text-muted)]" />
      </div>
      {error && (
        <div className="text-xs text-[var(--danger)] mb-2">Fehler: {error}</div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Metric
          icon={Cpu}
          label="Load"
          value={stats.load?.split(" ").slice(0, 3).join(" / ") || "—"}
        />
        <Metric
          icon={MemoryStick}
          label="RAM"
          value={`${stats.mem_used_mb ?? "?"} / ${stats.mem_total_mb ?? "?"} MB`}
          pct={memPct}
        />
        <Metric
          icon={HardDrive}
          label="Disk /"
          value={`${stats.disk_used_gb?.toFixed(1) ?? "?"} / ${stats.disk_total_gb?.toFixed(0) ?? "?"} GB`}
          pct={stats.disk_pct ?? 0}
        />
      </div>
      {stats.uptime && (
        <div className="text-xs text-[var(--text-muted)] mt-3">
          Uptime: {stats.uptime}
        </div>
      )}
      {stats.top_procs?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)] mb-1">Top Prozesse</div>
          <div className="space-y-1">
            {stats.top_procs.map((p: any, i: number) => (
              <div key={i} className="text-[11px] font-mono flex gap-2">
                <span className="text-[var(--text-muted)] w-10">{p.mem}%</span>
                <span className="truncate" title={p.command}>{p.command}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  pct,
}: {
  icon: any;
  label: string;
  value: string;
  pct?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
      {typeof pct === "number" && (
        <div className="mt-1 h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, pct)}%`,
              background:
                pct > 85
                  ? "var(--danger)"
                  : pct > 65
                    ? "var(--warning)"
                    : "var(--accent)",
            }}
          />
        </div>
      )}
    </div>
  );
}

function CoolifyCard({ summary }: { summary: any }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--text-muted)]">Coolify</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Apps</div>
          <div className="text-lg font-semibold">
            {summary.apps_running} / {summary.apps_total}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Services</div>
          <div className="text-lg font-semibold">{summary.services_total}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Datenbanken</div>
          <div className="text-lg font-semibold">{summary.databases_total}</div>
        </div>
      </div>
    </div>
  );
}

function HestiaCard({ summary }: { summary: any }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--text-muted)]">Hestia</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Domains</div>
          <div className="text-lg font-semibold">{summary.domains_total}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">SSL-Probleme</div>
          <div
            className="text-lg font-semibold"
            style={{ color: summary.ssl_problems ? "var(--danger)" : "var(--success)" }}
          >
            {summary.ssl_problems}
          </div>
        </div>
      </div>
    </div>
  );
}

function GithubCard({ summary }: { summary: any }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--text-muted)]">GitHub</div>
      <div className="mt-1 text-lg font-semibold">@{summary.username}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Unread</div>
          <div className="text-lg font-semibold">{summary.unread_notifications}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--text-muted)]">Issues assigned</div>
          <div className="text-lg font-semibold">{summary.assigned_issues}</div>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ title, error }: { title: string; error: string }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--text-muted)]">{title}</div>
      <div className="mt-2 text-sm text-[var(--danger)]">{error}</div>
    </div>
  );
}
