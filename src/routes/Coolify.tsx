import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { Link, useParams, useNavigate, Route, Routes } from "react-router-dom";
import {
  AlertCircle,
  Database,
  Server,
  Layers,
  Box,
  Play,
  Square,
  RotateCw,
  Rocket,
  ArrowLeft,
  RefreshCw,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  X,
  Save,
  Edit3,
} from "lucide-react";

type Tab = "apps" | "services" | "databases" | "servers";

export default function Coolify() {
  return (
    <Routes>
      <Route index element={<CoolifyList />} />
      <Route path="apps/:uuid" element={<CoolifyAppDetail />} />
    </Routes>
  );
}

function isRunningStatus(s: string | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower === "running" || lower.startsWith("running");
}

function CoolifyList() {
  const profiles = useStore((s) => s.profiles);
  const hasProfile = Object.keys(profiles.coolify).length > 0;
  const [tab, setTab] = useState<Tab>("apps");
  const [apps, setApps] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    if (!hasProfile) return;
    setLoading(true);
    setError(null);
    try {
      const [a, s, d, srv] = await Promise.all([
        api.coolifyApplications().catch(() => []),
        api.coolifyServices().catch(() => []),
        api.coolifyDatabases().catch(() => []),
        api.coolifyServers().catch(() => []),
      ]);
      setApps(a as any[]);
      setServices(s as any[]);
      setDatabases(d as any[]);
      setServers(srv as any[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
                Füge ein Coolify-Profil in den{" "}
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

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Coolify</h1>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Aktualisieren
          </button>
          {tab === "apps" && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Neue App
            </button>
          )}
        </div>
      </div>
      {error && <div className="card text-sm text-[var(--danger)]">{error}</div>}
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
        <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Lade …
        </div>
      ) : tab === "apps" ? (
        <AppsList apps={apps} onChange={load} />
      ) : tab === "services" ? (
        <ServiceList services={services} onChange={load} />
      ) : tab === "databases" ? (
        <DatabaseList databases={databases} onChange={load} />
      ) : (
        <ServerList servers={servers} />
      )}
      {showCreate && (
        <CreateAppModal
          servers={servers}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AppsList({ apps, onChange }: { apps: any[]; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  if (apps.length === 0)
    return (
      <div className="text-sm text-[var(--text-muted)]">
        Keine Apps gefunden.
      </div>
    );

  const run = async (uuid: string, fn: () => Promise<unknown>) => {
    setBusy(uuid);
    try {
      await fn();
      await onChange();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (a: any) => {
    if (
      !confirm(
        `App "${a.name}" wirklich löschen? Volumes werden mit gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
      )
    )
      return;
    setBusy(a.uuid);
    try {
      await api.coolifyDeleteApplication(a.uuid, true);
      await onChange();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {apps.map((a) => {
        const running = isRunningStatus(a.status);
        return (
          <div
            key={a.uuid}
            className="card flex flex-col gap-2 hover:border-[var(--accent)] transition"
          >
            <div className="flex items-center justify-between">
              <Link
                to={`/coolify/apps/${a.uuid}`}
                className="font-medium truncate hover:text-[var(--accent)]"
              >
                {a.name}
              </Link>
              <span
                className={`badge ${
                  running
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
              <a
                href={a.fqdn.startsWith("http") ? a.fqdn : `https://${a.fqdn}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] truncate flex items-center gap-1"
              >
                {a.fqdn} <ExternalLink size={10} />
              </a>
            )}
            {a.git_repository && (
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {a.git_repository}@{a.git_branch}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-1 pt-2 border-t border-[var(--border)]">
              {!running && (
                <button
                  className="btn text-xs"
                  disabled={busy === a.uuid}
                  onClick={() => run(a.uuid, () => api.coolifyStart(a.uuid))}
                >
                  {busy === a.uuid ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Start
                </button>
              )}
              {running && (
                <button
                  className="btn text-xs"
                  disabled={busy === a.uuid}
                  onClick={() => run(a.uuid, () => api.coolifyStop(a.uuid))}
                >
                  {busy === a.uuid ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Square size={12} />
                  )}
                  Stop
                </button>
              )}
              <button
                className="btn text-xs"
                disabled={busy === a.uuid}
                onClick={() => run(a.uuid, () => api.coolifyRestart(a.uuid))}
              >
                {busy === a.uuid ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCw size={12} />
                )}
                Restart
              </button>
              <button
                className="btn btn-primary text-xs ml-auto"
                disabled={busy === a.uuid}
                onClick={() => run(a.uuid, () => api.coolifyDeploy(a.uuid, null))}
              >
                {busy === a.uuid ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Rocket size={12} />
                )}
                Deploy
              </button>
              <button
                className="btn text-xs"
                title="App-Details"
                onClick={() => navigate(`/coolify/apps/${a.uuid}`)}
              >
                <Edit3 size={12} />
              </button>
              <button
                className="btn text-xs text-[var(--danger)]"
                title="Löschen"
                disabled={busy === a.uuid}
                onClick={() => remove(a)}
              >
                {busy === a.uuid ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceList({
  services,
  onChange,
}: {
  services: any[];
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (services.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Services.</div>;

  const run = async (uuid: string, fn: () => Promise<unknown>) => {
    setBusy(uuid);
    try {
      await fn();
      await onChange();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {services.map((s) => {
        const running = isRunningStatus(s.status);
        return (
          <div key={s.uuid} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {s.service_type || "—"}
                </div>
              </div>
              <span
                className={`badge ${
                  running ? "badge-success" : "badge-muted"
                }`}
              >
                {s.status || "—"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1 pt-2 border-t border-[var(--border)]">
              {!running && (
                <button
                  className="btn text-xs"
                  disabled={busy === s.uuid}
                  onClick={() =>
                    run(s.uuid, () => api.coolifyServiceStart(s.uuid))
                  }
                >
                  {busy === s.uuid ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Start
                </button>
              )}
              {running && (
                <button
                  className="btn text-xs"
                  disabled={busy === s.uuid}
                  onClick={() =>
                    run(s.uuid, () => api.coolifyServiceStop(s.uuid))
                  }
                >
                  {busy === s.uuid ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Square size={12} />
                  )}
                  Stop
                </button>
              )}
              <button
                className="btn text-xs"
                disabled={busy === s.uuid}
                onClick={() =>
                  run(s.uuid, () => api.coolifyServiceRestart(s.uuid))
                }
              >
                {busy === s.uuid ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCw size={12} />
                )}
                Restart
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DatabaseList({
  databases,
  onChange,
}: {
  databases: any[];
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  if (databases.length === 0 && !showCreate) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-[var(--text-muted)]">
          Keine Datenbanken.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={14} />
          PostgreSQL erstellen
        </button>
      </div>
    );
  }

  const run = async (uuid: string, fn: () => Promise<unknown>) => {
    setBusy(uuid);
    try {
      await fn();
      await onChange();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          className="btn"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus size={14} />
          PostgreSQL erstellen
        </button>
      </div>
      {showCreate && (
        <CreatePostgresModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            onChange();
          }}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--text-muted)] text-xs">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">User</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {databases.map((d) => (
              <tr
                key={d.uuid}
                className="border-t border-[var(--border)]"
              >
                <td className="px-2 py-2 font-mono">{d.name}</td>
                <td className="px-2 py-2 font-mono">{d.type_ || d.type || "—"}</td>
                <td className="px-2 py-2 font-mono">
                  <span
                    className={`badge ${
                      isRunningStatus(d.status)
                        ? "badge-success"
                        : "badge-muted"
                    }`}
                  >
                    {d.status || "—"}
                  </span>
                </td>
                <td className="px-2 py-2 flex gap-1">
                  {!isRunningStatus(d.status) && (
                    <button
                      className="btn text-xs"
                      disabled={busy === d.uuid}
                      onClick={() =>
                        run(d.uuid, () => api.coolifyDatabaseStart(d.uuid))
                      }
                    >
                      <Play size={10} /> Start
                    </button>
                  )}
                  {isRunningStatus(d.status) && (
                    <button
                      className="btn text-xs"
                      disabled={busy === d.uuid}
                      onClick={() =>
                        run(d.uuid, () => api.coolifyDatabaseStop(d.uuid))
                      }
                    >
                      <Square size={10} /> Stop
                    </button>
                  )}
                  <button
                    className="btn text-xs"
                    disabled={busy === d.uuid}
                    onClick={() =>
                      run(d.uuid, () => api.coolifyDatabaseRestart(d.uuid))
                    }
                  >
                    <RotateCw size={10} />
                  </button>
                  <button
                    className="btn text-xs text-[var(--danger)]"
                    disabled={busy === d.uuid}
                    onClick={async () => {
                      if (!confirm(`Datenbank "${d.name}" löschen?`)) return;
                      setBusy(d.uuid);
                      try {
                        await api.coolifyDeleteDatabase(d.uuid);
                        await onChange();
                      } catch (e) {
                        alert(String(e));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServerList({ servers }: { servers: any[] }) {
  if (servers.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Server.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {servers.map((s, i) => (
        <div key={s.id?.ID || s.uuid || i} className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{s.name || `Server ${i + 1}`}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {s.ip || s.host || "—"} · {s.user || "—"}
              </div>
            </div>
            <span
              className={`badge ${
                s.is_reachable ? "badge-success" : "badge-danger"
              }`}
            >
              {s.is_reachable ? "reachable" : "offline"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CoolifyAppDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [envs, setEnvs] = useState<any[]>([]);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [logLines, setLogLines] = useState(100);
  const [pollingLogs, setPollingLogs] = useState(false);
  const [showAddEnv, setShowAddEnv] = useState(false);
  const [editingEnv, setEditingEnv] = useState<any | null>(null);
  const [newEnv, setNewEnv] = useState({ key: "", value: "" });

  const load = async () => {
    if (!uuid) return;
    setLoading(true);
    try {
      const [a, e] = await Promise.all([
        api.coolifyApplication(uuid).catch(() => null),
        api.coolifyApplicationEnvs(uuid).catch(() => []),
      ]);
      setApp(a);
      setEnvs((e as any[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    if (!uuid) return;
    try {
      const l = await api.coolifyApplicationLogs(uuid, logLines);
      setLogs(l);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [uuid]);

  useEffect(() => {
    if (!pollingLogs || !uuid) return;
    const i = setInterval(refreshLogs, 3000);
    return () => clearInterval(i);
  }, [pollingLogs, uuid, logLines]);

  const run = async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action);
    try {
      await fn();
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const addEnv = async () => {
    if (!newEnv.key || !uuid) return;
    setBusy("env-add");
    try {
      await api.coolifyAddEnv(uuid, newEnv.key, newEnv.value, false, false, false);
      setNewEnv({ key: "", value: "" });
      setShowAddEnv(false);
      const e = (await api.coolifyApplicationEnvs(uuid)) as any[];
      setEnvs(e);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const updateEnv = async () => {
    if (!editingEnv || !uuid) return;
    setBusy("env-update");
    try {
      await api.coolifyUpdateEnv(
        uuid,
        editingEnv.key,
        editingEnv.value,
        false,
        false,
        false,
      );
      setEditingEnv(null);
      const e = (await api.coolifyApplicationEnvs(uuid)) as any[];
      setEnvs(e);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const deleteEnv = async (envKey: string) => {
    if (!uuid) return;
    if (!confirm(`Env-Variable "${envKey}" löschen?`)) return;
    setBusy(`env-del-${envKey}`);
    try {
      const envRecord = envs.find((e) => e.key === envKey);
      const envUuid = envRecord?.uuid || envKey;
      await api.coolifyDeleteEnv(uuid, envUuid);
      const e = (await api.coolifyApplicationEnvs(uuid)) as any[];
      setEnvs(e);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading)
    return (
      <div className="h-full overflow-auto p-4 md:p-6 text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Lade App …
      </div>
    );
  if (!app)
    return (
      <div className="h-full overflow-auto p-4 md:p-6 text-sm text-[var(--danger)]">
        App nicht gefunden.
      </div>
    );

  const running = isRunningStatus(app.status);
  const isStopped = app.status === "exited" || app.status === "stopped";

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/coolify")} className="btn">
          <ArrowLeft size={14} />
        </button>
        <div className="text-sm text-[var(--text-muted)] truncate">
          Coolify · App
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{app.name}</h1>
          <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2 flex-wrap">
            <span
              className={`badge ${
                running
                  ? "badge-success"
                  : isStopped
                    ? "badge-muted"
                    : "badge-warning"
              }`}
            >
              {app.status || "—"}
            </span>
            {app.fqdn && (
              <a
                href={app.fqdn.startsWith("http") ? app.fqdn : `https://${app.fqdn}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--accent)] flex items-center gap-1"
              >
                {app.fqdn} <ExternalLink size={10} />
              </a>
            )}
            {app.git_repository && (
              <span>
                {app.git_repository}@{app.git_branch}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running && (
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => run("start", () => api.coolifyStart(uuid!))}
            >
              {busy === "start" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Start
            </button>
          )}
          {running && (
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => run("stop", () => api.coolifyStop(uuid!))}
            >
              {busy === "stop" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Square size={14} />
              )}
              Stop
            </button>
          )}
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => run("restart", () => api.coolifyRestart(uuid!))}
          >
            {busy === "restart" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCw size={14} />
            )}
            Restart
          </button>
          <button
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => run("deploy", () => api.coolifyDeploy(uuid!, null))}
          >
            {busy === "deploy" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Rocket size={14} />
            )}
            Deploy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Logs</h3>
            <div className="flex items-center gap-2">
              <select
                className="input py-1 px-2 text-xs w-24"
                value={logLines}
                onChange={(e) => setLogLines(Number(e.target.value))}
              >
                {[50, 100, 200, 500, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className={`btn text-xs ${pollingLogs ? "btn-primary" : ""}`}
                onClick={() => {
                  setPollingLogs(!pollingLogs);
                  if (!pollingLogs) refreshLogs();
                }}
              >
                {pollingLogs ? "Live ●" : "Live"}
              </button>
              <button className="btn text-xs" onClick={refreshLogs}>
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
          <pre className="text-[11px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded p-3 max-h-[500px] overflow-auto whitespace-pre-wrap">
            {logs || "(noch keine Logs geladen — klick Live oder Refresh)"}
          </pre>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">
              Environment-Variablen ({envs.length})
            </h3>
            <button
              className="btn text-xs"
              onClick={() => setShowAddEnv(!showAddEnv)}
            >
              <Plus size={12} />
              Hinzufügen
            </button>
          </div>
          {showAddEnv && (
            <div className="card mb-2 flex flex-col gap-2">
              <input
                className="input font-mono text-xs"
                placeholder="KEY"
                value={newEnv.key}
                onChange={(e) =>
                  setNewEnv({ ...newEnv, key: e.target.value })
                }
              />
              <textarea
                className="input font-mono text-xs min-h-[60px]"
                placeholder="Wert"
                value={newEnv.value}
                onChange={(e) =>
                  setNewEnv({ ...newEnv, value: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => setShowAddEnv(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="btn btn-primary"
                  onClick={addEnv}
                  disabled={busy === "env-add"}
                >
                  {busy === "env-add" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Speichern
                </button>
              </div>
            </div>
          )}
          {editingEnv && (
            <div className="card mb-2 flex flex-col gap-2">
              <div className="text-xs text-[var(--text-muted)]">
                Bearbeite: <span className="font-mono">{editingEnv.key}</span>
              </div>
              <textarea
                className="input font-mono text-xs min-h-[60px]"
                value={editingEnv.value}
                onChange={(e) =>
                  setEditingEnv({ ...editingEnv, value: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button className="btn" onClick={() => setEditingEnv(null)}>
                  Abbrechen
                </button>
                <button
                  className="btn btn-primary"
                  onClick={updateEnv}
                  disabled={busy === "env-update"}
                >
                  {busy === "env-update" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Speichern
                </button>
              </div>
            </div>
          )}
          {envs.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">
              Keine Env-Vars.
            </div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-auto">
              {envs.map((e, i) => (
                <div
                  key={e.key || i}
                  className="flex gap-2 text-[11px] font-mono py-1 border-b border-[var(--border)] last:border-0 items-start"
                >
                  <span className="font-semibold text-[var(--text-muted)] min-w-[140px]">
                    {e.key}
                  </span>
                  <span
                    className="truncate flex-1"
                    title={e.value}
                  >
                    {e.value}
                  </span>
                  <button
                    className="text-[var(--accent)] hover:opacity-80"
                    onClick={() =>
                      setEditingEnv({ key: e.key, value: e.value })
                    }
                    title="Bearbeiten"
                  >
                    <Edit3 size={11} />
                  </button>
                  <button
                    className="text-[var(--danger)] hover:opacity-80"
                    disabled={busy === `env-del-${e.key}`}
                    onClick={() => deleteEnv(e.key)}
                    title="Löschen"
                  >
                    {busy === `env-del-${e.key}` ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAppModal({
  servers,
  onClose,
  onCreated,
}: {
  servers: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [projectUuid, setProjectUuid] = useState("");
  const [environmentName, setEnvironmentName] = useState("production");
  const [serverUuid, setServerUuid] = useState("");
  const [name, setName] = useState("");
  const [gitRepository, setGitRepository] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [buildPack, setBuildPack] = useState("nixpacks");
  const [portsExposes, setPortsExposes] = useState("3000");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.coolifyProjects().then((p) => {
      const list = p as any[];
      setProjects(list);
      if (list.length > 0) {
        const first = list[0];
        setProjectUuid(first.uuid || first.id?.toString() || "");
      }
    });
  }, []);

  useEffect(() => {
    if (!projectUuid) {
      setEnvironments([]);
      return;
    }
    api.coolifyProjectEnvironments(projectUuid).then((e) => {
      const list = e as any[];
      setEnvironments(list);
      if (list.length > 0) {
        setEnvironmentName(list[0].name || "production");
      }
    });
  }, [projectUuid]);

  useEffect(() => {
    if (servers.length > 0 && !serverUuid) {
      const first = servers[0];
      setServerUuid(first.uuid || first.id?.toString() || "");
    }
  }, [servers, serverUuid]);

  const submit = async () => {
    setError(null);
    if (!projectUuid || !serverUuid || !environmentName || !gitRepository) {
      setError("Projekt, Server, Environment und Git-Repository sind Pflicht.");
      return;
    }
    setLoading(true);
    try {
      const body: any = {
        project_uuid: projectUuid,
        server_uuid: serverUuid,
        environment_name: environmentName,
        git_repository: gitRepository,
        git_branch: gitBranch,
        build_pack: buildPack,
        ports_exposes: portsExposes,
        is_force_https_enabled: true,
        instant_deploy: false,
        autogenerate_domain: !domain,
      };
      if (name) body.name = name;
      if (domain) body.domains = domain;
      await api.coolifyCreateApplication(body);
      onCreated();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">Neue App erstellen</h2>
          <button onClick={onClose} className="btn">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Projekt *</label>
              <select
                className="input"
                value={projectUuid}
                onChange={(e) => setProjectUuid(e.target.value)}
              >
                <option value="">— wählen —</option>
                {projects.map((p) => (
                  <option
                    key={p.uuid || p.id}
                    value={p.uuid || p.id?.toString()}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Server *</label>
              <select
                className="input"
                value={serverUuid}
                onChange={(e) => setServerUuid(e.target.value)}
              >
                <option value="">— wählen —</option>
                {servers.map((s) => (
                  <option
                    key={s.uuid || s.id}
                    value={s.uuid || s.id?.toString()}
                  >
                    {s.name} ({s.ip || s.host})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Environment *</label>
              <select
                className="input"
                value={environmentName}
                onChange={(e) => setEnvironmentName(e.target.value)}
              >
                <option value="">— wählen —</option>
                {environments.map((e) => (
                  <option key={e.name || e.uuid} value={e.name || e.uuid}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Build Pack</label>
              <select
                className="input"
                value={buildPack}
                onChange={(e) => setBuildPack(e.target.value)}
              >
                <option value="nixpacks">Nixpacks</option>
                <option value="railpack">Railpack</option>
                <option value="static">Static</option>
                <option value="dockerfile">Dockerfile</option>
                <option value="dockercompose">Docker Compose</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Name (optional)</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. mein-blog"
            />
          </div>
          <div>
            <label className="label">Git Repository URL *</label>
            <input
              className="input font-mono"
              value={gitRepository}
              onChange={(e) => setGitRepository(e.target.value)}
              placeholder="https://github.com/user/repo"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Branch</label>
              <input
                className="input font-mono"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Port (exposed)</label>
              <input
                className="input font-mono"
                value={portsExposes}
                onChange={(e) => setPortsExposes(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Subdomain (optional)</label>
            <input
              className="input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="z.B. app.example.com"
            />
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              Leer lassen für automatische Generierung
            </div>
          </div>
          {error && (
            <div className="text-sm text-[var(--danger)] bg-[var(--bg)] p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
            <button className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button
              className="btn btn-primary ml-auto"
              onClick={submit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreatePostgresModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [projectUuid, setProjectUuid] = useState("");
  const [serverUuid, setServerUuid] = useState("");
  const [environmentName] = useState("production");
  const [name, setName] = useState("postgres");
  const [user, setUser] = useState("app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.coolifyProjects(), api.coolifyServers()]).then(
      ([p, s]) => {
        const pl = p as any[];
        setProjects(pl);
        if (pl.length > 0) {
          setProjectUuid(pl[0].uuid || pl[0].id?.toString() || "");
        }
        const sl = s as any[];
        setServers(sl);
        if (sl.length > 0) {
          setServerUuid(sl[0].uuid || sl[0].id?.toString() || "");
        }
      },
    );
  }, []);

  const submit = async () => {
    setError(null);
    if (!projectUuid || !serverUuid || !name || !user || !password) {
      setError("Alle Felder sind Pflicht.");
      return;
    }
    setLoading(true);
    try {
      await api.coolifyCreatePostgres({
        project_uuid: projectUuid,
        server_uuid: serverUuid,
        environment_name: environmentName,
        name,
        postgres_user: user,
        postgres_password: password,
        postgres_db: name,
      });
      onCreated();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] rounded-lg max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">PostgreSQL erstellen</h2>
          <button onClick={onClose} className="btn">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label">Projekt *</label>
            <select
              className="input"
              value={projectUuid}
              onChange={(e) => setProjectUuid(e.target.value)}
            >
              <option value="">— wählen —</option>
              {projects.map((p) => (
                <option
                  key={p.uuid || p.id}
                  value={p.uuid || p.id?.toString()}
                >
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Server *</label>
            <select
              className="input"
              value={serverUuid}
              onChange={(e) => setServerUuid(e.target.value)}
            >
              <option value="">— wählen —</option>
              {servers.map((s) => (
                <option
                  key={s.uuid || s.id}
                  value={s.uuid || s.id?.toString()}
                >
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">DB-Name *</label>
              <input
                className="input font-mono"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">DB-User *</label>
              <input
                className="input font-mono"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Passwort *</label>
            <input
              className="input font-mono"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="text-sm text-[var(--danger)] bg-[var(--bg)] p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
            <button className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button
              className="btn btn-primary ml-auto"
              onClick={submit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
