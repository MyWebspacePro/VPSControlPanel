import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { Link } from "react-router-dom";
import { AlertCircle, Database, Server, Layers, Box } from "lucide-react";

type Tab = "apps" | "services" | "databases" | "servers";

export default function Coolify() {
  const profiles = useStore((s) => s.profiles);
  const hasProfile = Object.keys(profiles.coolify).length > 0;
  const [tab, setTab] = useState<Tab>("apps");
  const [apps, setApps] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]  );
  const [databases, setDatabases] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasProfile) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.coolifyApplications().catch(() => []),
      api.coolifyServices().catch(() => []),
      api.coolifyDatabases().catch(() => []),
      api.coolifyServers().catch(() => []),
    ])
      .then(([a, s, d, srv]) => {
        setApps(a as any[]);
        setServices(s as any[]);
        setDatabases(d as any[]);
        setServers(srv as any[]);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hasProfile]);

  if (!hasProfile) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <h1 className="text-xl font-semibold mb-4">Coolify</h1>
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[var(--warning)] mt-0.5" size={18} />
            <div>
              <div className="font-medium">Kein Coolify-Profil</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Füge ein Coolify-Profil in den <Link to="/settings" className="text-[var(--accent)] underline">Einstellungen</Link> hinzu.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Coolify</h1>
      {error && (
        <div className="card text-sm text-[var(--danger)]">{error}</div>
      )}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: "apps", label: "Apps", icon: Box },
          { key: "services", label: "Services", icon: Layers },
          { key: "databases", label: "Datenbanken", icon: Database },
          { key: "servers", label: "Server", icon: Server },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
              tab === t.key
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-sm text-[var(--text-muted)]">Lade …</div>
      ) : tab === "apps" ? (
        <AppsList apps={apps} />
      ) : tab === "services" ? (
        <SimpleList items={services} kind="service" />
      ) : tab === "databases" ? (
        <SimpleList items={databases} kind="database" />
      ) : (
        <SimpleList items={servers} kind="server" />
      )}
    </div>
  );
}

function AppsList({ apps }: { apps: any[] }) {
  if (apps.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Apps gefunden.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {apps.map((a) => (
        <Link
          to={`/coolify/apps/${a.uuid}`}
          key={a.uuid}
          className="card hover:border-[var(--accent)] transition cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="font-medium truncate">{a.name}</div>
            <span
              className={`badge ${
                a.status === "running"
                  ? "badge-success"
                  : a.status === "exited" || a.status === "stopped"
                    ? "badge-muted"
                    : "badge-warning"
              }`}
            >
              {a.status || "—"}
            </span>
          </div>
          {a.fqdn && (
            <div className="text-xs text-[var(--text-muted)] mt-1 truncate">
              {a.fqdn}
            </div>
          )}
          {a.git_repository && (
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              {a.git_repository}@{a.git_branch}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function SimpleList({ items, kind: _kind }: { items: any[]; kind: string }) {
  if (items.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Einträge.</div>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.uuid || it.id || i} className="card flex items-center justify-between">
          <div>
            <div className="font-medium">
              {it.name || it.domain || it.database || `Eintrag ${i + 1}`}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(it).filter(
                    ([k]) => !["id", "name", "domain", "database", "uuid"].includes(k),
                  ),
                ),
                null,
                0,
              ).slice(0, 200)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
