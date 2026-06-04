import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { Link } from "react-router-dom";
import { AlertCircle, Globe, Lock, Database, Plus, Trash2 } from "lucide-react";

export default function Hestia() {
  const profiles = useStore((s) => s.profiles);
  const hasProfile = Object.keys(profiles.hestia).length > 0;
  const [domains, setDomains] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newRecord, setNewRecord] = useState({ record: "", type: "A", value: "" });

  useEffect(() => {
    if (!hasProfile) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.hestiaWebDomains().catch((e) => {
        setError(String(e));
        return [];
      }),
      api.hestiaDatabases().catch(() => []),
    ])
      .then(([d, db]) => {
        setDomains(d as any[]);
        setDatabases(db as any[]);
      })
      .finally(() => setLoading(false));
  }, [hasProfile]);

  useEffect(() => {
    if (!activeDomain) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    api
      .hestiaDnsRecords(activeDomain)
      .then((r) => setRecords(r as any[]))
      .catch((e) => console.error(e))
      .finally(() => setRecordsLoading(false));
  }, [activeDomain]);

  if (!hasProfile) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <h1 className="text-xl font-semibold mb-4">Hestia</h1>
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[var(--warning)] mt-0.5" size={18} />
            <div>
              <div className="font-medium">Kein Hestia-Profil</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Füge ein Hestia-Profil in den <Link to="/settings" className="text-[var(--accent)] underline">Einstellungen</Link> hinzu.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const addRecord = async () => {
    if (!activeDomain || !newRecord.record || !newRecord.value) return;
    try {
      await api.hestiaAddDns(
        activeDomain,
        newRecord.record,
        newRecord.type,
        newRecord.value,
        null,
      );
      const r = (await api.hestiaDnsRecords(activeDomain)) as any[];
      setRecords(r);
      setNewRecord({ record: "", type: "A", value: "" });
      setShowAdd(false);
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteRecord = async (rec: any) => {
    if (!activeDomain) return;
    if (!confirm(`Eintrag ${rec.record} (${rec.type}) löschen?`)) return;
    try {
      await api.hestiaDeleteDns(activeDomain, rec.record, rec.rtype, rec.value);
      setRecords(records.filter((r) => r !== rec));
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Hestia</h1>
      {error && <div className="card text-sm text-[var(--danger)]">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} />
            <h2 className="font-medium">Web-Domains ({domains.length})</h2>
          </div>
          {loading ? (
            <div className="text-sm text-[var(--text-muted)]">Lade …</div>
          ) : (
            <div className="space-y-1">
              {domains.map((d) => (
                <button
                  key={d.domain}
                  onClick={() => setActiveDomain(d.domain)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition ${
                    activeDomain === d.domain
                      ? "bg-[var(--accent)] text-white"
                      : "hover:bg-[var(--bg)]"
                  }`}
                >
                  <span className="truncate">{d.domain}</span>
                  <span
                    className={`badge ${
                      d.ssl === "Let's Encrypt"
                        ? "badge-success"
                        : d.ssl
                          ? "badge-warning"
                          : "badge-muted"
                    }`}
                  >
                    {d.ssl ? <Lock size={10} /> : null}
                    {d.ssl || "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">
              {activeDomain ? `DNS-Records · ${activeDomain}` : "DNS-Records"}
            </h2>
            {activeDomain && (
              <button className="btn" onClick={() => setShowAdd(!showAdd)}>
                <Plus size={14} />
                Hinzufügen
              </button>
            )}
          </div>
          {!activeDomain ? (
            <div className="text-sm text-[var(--text-muted)]">
              Wähle eine Domain, um DNS-Einträge zu sehen.
            </div>
          ) : recordsLoading ? (
            <div className="text-sm text-[var(--text-muted)]">Lade …</div>
          ) : (
            <div className="space-y-2">
              {showAdd && (
                <div className="card flex flex-col md:flex-row gap-2">
                  <input
                    className="input"
                    placeholder="Name (z.B. www)"
                    value={newRecord.record}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, record: e.target.value })
                    }
                  />
                  <select
                    className="input md:w-32"
                    value={newRecord.type}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, type: e.target.value })
                    }
                  >
                    {["A", "AAAA", "CNAME", "MX", "TXT"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Wert"
                    value={newRecord.value}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, value: e.target.value })
                    }
                  />
                  <button className="btn btn-primary" onClick={addRecord}>
                    Speichern
                  </button>
                </div>
              )}
              {records.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">
                  Keine Einträge.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[var(--text-muted)] text-xs">
                      <tr>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Typ</th>
                        <th className="px-2 py-1">Wert</th>
                        <th className="px-2 py-1">TTL</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={i} className="border-t border-[var(--border)]">
                          <td className="px-2 py-2 font-mono">{r.record}</td>
                          <td className="px-2 py-2 font-mono">{r.rtype}</td>
                          <td className="px-2 py-2 font-mono truncate max-w-[200px]">
                            {r.value}
                          </td>
                          <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                            {r.ttl || "—"}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => deleteRecord(r)}
                              className="text-[var(--danger)] hover:opacity-80"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} />
          <h2 className="font-medium">Datenbanken ({databases.length})</h2>
        </div>
        {databases.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">Keine Datenbanken.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--text-muted)] text-xs">
                <tr>
                  <th className="px-2 py-1">Datenbank</th>
                  <th className="px-2 py-1">User</th>
                  <th className="px-2 py-1">Größe</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((d, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="px-2 py-2 font-mono">{d.database}</td>
                    <td className="px-2 py-2 font-mono">{d.dbuser}</td>
                    <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                      {d.disk || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
