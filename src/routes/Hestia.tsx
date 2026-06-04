import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Globe,
  Lock,
  Database,
  Plus,
  Trash2,
  Mail,
  X,
  Save,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Tab = "domains" | "mail" | "databases";

export default function Hestia() {
  const profiles = useStore((s) => s.profiles);
  const hasProfile = Object.keys(profiles.hestia).length > 0;
  const [tab, setTab] = useState<Tab>("domains");
  const [domains, setDomains] = useState<any[]>([]);
  const [mailDomains, setMailDomains] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [newDomain, setNewDomain] = useState({ domain: "", ip: "", aliases: "www" });
  const [newRecord, setNewRecord] = useState({ record: "", type: "A", value: "", priority: "", ttl: "" });
  const [activeMailDomain, setActiveMailDomain] = useState<string | null>(null);
  const [mailAccounts, setMailAccounts] = useState<any[]>([]);
  const [showAddMail, setShowAddMail] = useState(false);
  const [newMail, setNewMail] = useState({ account: "", password: "", quotaMb: "" });
  const [showAddMailDomain, setShowAddMailDomain] = useState(false);
  const [newMailDomain, setNewMailDomain] = useState("");

  useEffect(() => {
    if (!hasProfile) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.hestiaWebDomains().catch((e) => {
        setError(String(e));
        return [];
      }),
      api.hestiaMailDomains().catch(() => []),
      api.hestiaDatabases().catch(() => []),
    ])
      .then(([d, md, db]) => {
        setDomains(d as any[]);
        setMailDomains(md as any[]);
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

  useEffect(() => {
    if (!activeMailDomain) {
      setMailAccounts([]);
      return;
    }
    api
      .hestiaMailAccounts(activeMailDomain)
      .then((r) => setMailAccounts(r as any[]))
      .catch((e) => console.error(e));
  }, [activeMailDomain]);

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
                Füge ein Hestia-Profil in den{" "}
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

  const reload = async () => {
    setLoading(true);
    try {
      const [d, md, db] = await Promise.all([
        api.hestiaWebDomains().catch(() => []),
        api.hestiaMailDomains().catch(() => []),
        api.hestiaDatabases().catch(() => []),
      ]);
      setDomains(d as any[]);
      setMailDomains(md as any[]);
      setDatabases(db as any[]);
    } finally {
      setLoading(false);
    }
  };

  const addDomain = async () => {
    if (!newDomain.domain) return;
    try {
      await api.hestiaAddWebDomain(
        newDomain.domain,
        newDomain.ip || null,
        newDomain.aliases || null,
      );
      setNewDomain({ domain: "", ip: "", aliases: "www" });
      setShowAddDomain(false);
      const d = (await api.hestiaWebDomains()) as any[];
      setDomains(d);
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteDomain = async (domain: string) => {
    if (
      !confirm(
        `Domain "${domain}" wirklich löschen? Web + DNS + Mail werden mit gelöscht.`,
      )
    )
      return;
    try {
      await api.hestiaDeleteWebDomain(domain);
      if (activeDomain === domain) setActiveDomain(null);
      const d = (await api.hestiaWebDomains()) as any[];
      setDomains(d);
    } catch (e) {
      alert(String(e));
    }
  };

  const toggleSSL = async (d: any) => {
    const has = d.ssl && d.ssl !== "no";
    try {
      if (has) {
        await api.hestiaDeleteLetsencrypt(d.domain);
      } else {
        await api.hestiaAddLetsencrypt(d.domain);
      }
      const refreshed = (await api.hestiaWebDomains()) as any[];
      setDomains(refreshed);
    } catch (e) {
      alert(String(e));
    }
  };

  const addRecord = async () => {
    if (!activeDomain || !newRecord.record || !newRecord.value) return;
    try {
      await api.hestiaAddDns(
        activeDomain,
        newRecord.record,
        newRecord.type,
        newRecord.value,
        newRecord.priority ? Number(newRecord.priority) : null,
        newRecord.ttl ? Number(newRecord.ttl) : null,
      );
      const r = (await api.hestiaDnsRecords(activeDomain)) as any[];
      setRecords(r);
      setNewRecord({ record: "", type: "A", value: "", priority: "", ttl: "" });
      setShowAddRecord(false);
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteRecord = async (rec: any) => {
    if (!activeDomain) return;
    if (!confirm(`Eintrag ${rec.record} (${rec.rtype}) löschen?`)) return;
    try {
      await api.hestiaDeleteDns(activeDomain, rec.record);
      setRecords(records.filter((r) => r !== rec));
    } catch (e) {
      alert(String(e));
    }
  };

  const addMailAccount = async () => {
    if (!activeMailDomain || !newMail.account || !newMail.password) return;
    try {
      await api.hestiaAddMailAccount(
        activeMailDomain,
        newMail.account,
        newMail.password,
        newMail.quotaMb ? Number(newMail.quotaMb) : null,
      );
      setNewMail({ account: "", password: "", quotaMb: "" });
      setShowAddMail(false);
      const r = (await api.hestiaMailAccounts(activeMailDomain)) as any[];
      setMailAccounts(r);
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteMailAccount = async (account: string) => {
    if (!activeMailDomain) return;
    if (!confirm(`Mail-Account "${account}@${activeMailDomain}" löschen?`))
      return;
    try {
      await api.hestiaDeleteMailAccount(activeMailDomain, account);
      setMailAccounts(mailAccounts.filter((a) => a.email !== account && a.alias !== account));
    } catch (e) {
      alert(String(e));
    }
  };

  const addMailDomain = async () => {
    if (!newMailDomain) return;
    try {
      await api.hestiaAddMailDomain(newMailDomain);
      setNewMailDomain("");
      setShowAddMailDomain(false);
      const md = (await api.hestiaMailDomains()) as any[];
      setMailDomains(md);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hestia</h1>
        <button className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>
      {error && <div className="card text-sm text-[var(--danger)]">{error}</div>}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: "domains", label: "Domains", icon: Globe },
          { key: "mail", label: "Mail", icon: Mail },
          { key: "databases", label: "Datenbanken", icon: Database },
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

      {tab === "domains" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe size={16} />
                <h2 className="font-medium">Web-Domains ({domains.length})</h2>
              </div>
              <button
                className="btn text-xs"
                onClick={() => setShowAddDomain(!showAddDomain)}
              >
                <Plus size={12} />
              </button>
            </div>
            {showAddDomain && (
              <div className="card mb-3 space-y-2">
                <input
                  className="input"
                  placeholder="Domain (z.B. example.com)"
                  value={newDomain.domain}
                  onChange={(e) =>
                    setNewDomain({ ...newDomain, domain: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="IP (leer = Server-IP)"
                  value={newDomain.ip}
                  onChange={(e) =>
                    setNewDomain({ ...newDomain, ip: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="Aliases (z.B. www, leer = keine)"
                  value={newDomain.aliases}
                  onChange={(e) =>
                    setNewDomain({ ...newDomain, aliases: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <button
                    className="btn"
                    onClick={() => setShowAddDomain(false)}
                  >
                    Abbrechen
                  </button>
                  <button className="btn btn-primary" onClick={addDomain}>
                    <Save size={12} />
                    Hinzufügen
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {domains.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">Keine.</div>
              ) : (
                domains.map((d) => (
                  <div
                    key={d.domain}
                    className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition ${
                      activeDomain === d.domain
                        ? "bg-[var(--accent)] text-white"
                        : "hover:bg-[var(--bg)]"
                    }`}
                  >
                    <button
                      onClick={() => setActiveDomain(d.domain)}
                      className="flex-1 text-left truncate"
                    >
                      {d.domain}
                    </button>
                    <div className="flex items-center gap-1">
                      {d.ssl && d.ssl !== "no" ? (
                        <span
                          title={`SSL: ${d.ssl}`}
                          className={
                            activeDomain === d.domain
                              ? "text-white/80"
                              : "text-[var(--success)]"
                          }
                        >
                          <Lock size={12} />
                        </span>
                      ) : null}
                      <button
                        className={`px-1.5 py-0.5 text-[10px] rounded ${
                          d.ssl && d.ssl !== "no"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSSL(d);
                        }}
                        title={
                          d.ssl && d.ssl !== "no"
                            ? "SSL deaktivieren"
                            : "Let's Encrypt aktivieren"
                        }
                      >
                        {d.ssl && d.ssl !== "no" ? "SSL ✓" : "SSL"}
                      </button>
                      <button
                        className={`p-1 rounded ${
                          activeDomain === d.domain
                            ? "hover:bg-white/20"
                            : "hover:bg-[var(--bg)] text-[var(--danger)]"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDomain(d.domain);
                        }}
                        title="Löschen"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">
                {activeDomain ? `DNS-Records · ${activeDomain}` : "DNS-Records"}
              </h2>
              {activeDomain && (
                <button
                  className="btn"
                  onClick={() => setShowAddRecord(!showAddRecord)}
                >
                  <Plus size={14} />
                  Hinzufügen
                </button>
              )}
            </div>
            {!activeDomain ? (
              <div className="text-sm text-[var(--text-muted)]">
                Wähle eine Domain.
              </div>
            ) : recordsLoading ? (
              <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Lade …
              </div>
            ) : (
              <div className="space-y-2">
                {showAddRecord && (
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
                      className="input md:w-28"
                      value={newRecord.type}
                      onChange={(e) =>
                        setNewRecord({ ...newRecord, type: e.target.value })
                      }
                    >
                      {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"].map(
                        (t) => (
                          <option key={t}>{t}</option>
                        ),
                      )}
                    </select>
                    <input
                      className="input"
                      placeholder="Wert"
                      value={newRecord.value}
                      onChange={(e) =>
                        setNewRecord({ ...newRecord, value: e.target.value })
                      }
                    />
                    {(newRecord.type === "MX" || newRecord.type === "SRV") && (
                      <input
                        className="input md:w-24"
                        placeholder="Prio"
                        value={newRecord.priority}
                        onChange={(e) =>
                          setNewRecord({ ...newRecord, priority: e.target.value })
                        }
                      />
                    )}
                    <input
                      className="input md:w-24"
                      placeholder="TTL"
                      value={newRecord.ttl}
                      onChange={(e) =>
                        setNewRecord({ ...newRecord, ttl: e.target.value })
                      }
                    />
                    <button className="btn btn-primary" onClick={addRecord}>
                      <Save size={12} />
                    </button>
                    <button
                      className="btn"
                      onClick={() => setShowAddRecord(false)}
                    >
                      <X size={12} />
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
                          <th className="px-2 py-1">Prio</th>
                          <th className="px-2 py-1">TTL</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r, i) => (
                          <tr
                            key={i}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-2 py-2 font-mono">{r.record}</td>
                            <td className="px-2 py-2 font-mono">{r.rtype}</td>
                            <td className="px-2 py-2 font-mono truncate max-w-[200px]">
                              {r.value}
                            </td>
                            <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                              {r.priority || "—"}
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
      )}

      {tab === "mail" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail size={16} />
                <h2 className="font-medium">Mail-Domains ({mailDomains.length})</h2>
              </div>
              <button
                className="btn text-xs"
                onClick={() => setShowAddMailDomain(!showAddMailDomain)}
              >
                <Plus size={12} />
              </button>
            </div>
            {showAddMailDomain && (
              <div className="card mb-3 space-y-2">
                <input
                  className="input"
                  placeholder="Mail-Domain"
                  value={newMailDomain}
                  onChange={(e) => setNewMailDomain(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    className="btn"
                    onClick={() => setShowAddMailDomain(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={addMailDomain}
                  >
                    <Save size={12} />
                    Hinzufügen
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {mailDomains.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">Keine.</div>
              ) : (
                mailDomains.map((md) => (
                  <button
                    key={md.domain}
                    onClick={() => setActiveMailDomain(md.domain)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition ${
                      activeMailDomain === md.domain
                        ? "bg-[var(--accent)] text-white"
                        : "hover:bg-[var(--bg)]"
                    }`}
                  >
                    {md.domain}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">
                {activeMailDomain
                  ? `Mail-Accounts · ${activeMailDomain}`
                  : "Mail-Accounts"}
              </h2>
              {activeMailDomain && (
                <button
                  className="btn"
                  onClick={() => setShowAddMail(!showAddMail)}
                >
                  <Plus size={14} />
                  Hinzufügen
                </button>
              )}
            </div>
            {!activeMailDomain ? (
              <div className="text-sm text-[var(--text-muted)]">
                Wähle eine Mail-Domain.
              </div>
            ) : (
              <div className="space-y-2">
                {showAddMail && (
                  <div className="card flex flex-col gap-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        className="input"
                        placeholder={`Local-Part (z.B. info — @${activeMailDomain} wird ergänzt)`}
                        value={newMail.account}
                        onChange={(e) =>
                          setNewMail({ ...newMail, account: e.target.value })
                        }
                      />
                      <input
                        className="input"
                        type="password"
                        placeholder="Passwort"
                        value={newMail.password}
                        onChange={(e) =>
                          setNewMail({ ...newMail, password: e.target.value })
                        }
                      />
                      <input
                        className="input"
                        placeholder="Quota MB (leer = unlimited)"
                        value={newMail.quotaMb}
                        onChange={(e) =>
                          setNewMail({ ...newMail, quotaMb: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn"
                        onClick={() => setShowAddMail(false)}
                      >
                        Abbrechen
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={addMailAccount}
                      >
                        <Save size={12} />
                        Anlegen
                      </button>
                    </div>
                  </div>
                )}
                {mailAccounts.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">
                    Keine Accounts.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[var(--text-muted)] text-xs">
                        <tr>
                          <th className="px-2 py-1">Account</th>
                          <th className="px-2 py-1">Quota</th>
                          <th className="px-2 py-1">Disk</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mailAccounts.map((a, i) => (
                          <tr
                            key={i}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-2 py-2 font-mono">
                              {a.alias || a.email}
                            </td>
                            <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                              {a.quota || "—"}
                            </td>
                            <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                              {a.u_disk || "—"}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => deleteMailAccount(a.alias || a.email)}
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
      )}

      {tab === "databases" && (
        <div className="card">
          <h2 className="font-medium mb-3">
            Datenbanken ({databases.length})
          </h2>
          {databases.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">Keine.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[var(--text-muted)] text-xs">
                  <tr>
                    <th className="px-2 py-1">Datenbank</th>
                    <th className="px-2 py-1">User</th>
                    <th className="px-2 py-1">Host</th>
                    <th className="px-2 py-1">Typ</th>
                    <th className="px-2 py-1">Disk</th>
                  </tr>
                </thead>
                <tbody>
                  {databases.map((d, i) => (
                    <tr
                      key={i}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-2 py-2 font-mono">{d.database}</td>
                      <td className="px-2 py-2 font-mono">{d.dbuser}</td>
                      <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                        {d.host || "localhost"}
                      </td>
                      <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                        {d.db_type || "mysql"}
                      </td>
                      <td className="px-2 py-2 font-mono text-[var(--text-muted)]">
                        {d.u_disk || "—"}
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
  );
}
