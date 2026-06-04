import { useState } from "react";
import { useStore } from "../state/useStore";
import { api, type SshProfile, type CoolifyProfile, type HestiaProfile, type GitHubProfile, type SshAuthMethod } from "../lib/api";
import { Plus, Trash2, Save, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";

type SettingsTab = "ssh" | "coolify" | "hestia" | "github";

export default function Settings() {
  const profiles = useStore((s) => s.profiles);
  const refresh = useStore((s) => s.refreshProfiles);
  const [tab, setTab] = useState<SettingsTab>("ssh");

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Einstellungen</h1>
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: "ssh", label: "SSH" },
          { key: "coolify", label: "Coolify" },
          { key: "hestia", label: "Hestia" },
          { key: "github", label: "GitHub" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm border-b-2 transition ${
              tab === t.key
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "ssh" && <SshSettings profiles={profiles.ssh} refresh={refresh} />}
      {tab === "coolify" && (
        <CoolifySettings profiles={profiles.coolify} refresh={refresh} />
      )}
      {tab === "hestia" && (
        <HestiaSettings profiles={profiles.hestia} refresh={refresh} />
      )}
      {tab === "github" && <GithubSettings profile={profiles.github} refresh={refresh} />}
    </div>
  );
}

function SshSettings({
  profiles,
  refresh,
}: {
  profiles: Record<string, SshProfile>;
  refresh: () => Promise<void>;
}) {
  const list = Object.values(profiles);
  const [editing, setEditing] = useState<SshProfile | null>(null);

  return (
    <div className="space-y-3">
      {list.map((p) =>
        editing?.id === p.id ? (
          <SshEditor
            key={p.id}
            initial={p}
            onDone={async (saved) => {
              setEditing(null);
              if (saved) await refresh();
            }}
          />
        ) : (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {p.user}@{p.host}:{p.port} · {authLabel(p.auth_method)}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setEditing(p)}>
                Bearbeiten
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`SSH-Profil "${p.name}" löschen?`)) return;
                  await api.deleteSsh(p.id);
                  await refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ),
      )}
      {editing?.id === "" || (!editing && !list.length) ? (
        <SshEditor
          key="new"
          initial={null}
          onDone={async (saved) => {
            setEditing(null);
            if (saved) await refresh();
          }}
        />
      ) : !editing ? (
        <button
          className="btn"
          onClick={() =>
            setEditing({
              id: "",
              name: "",
              host: "",
              port: 22,
              user: "root",
              auth_method: { type: "key_file", path: "" },
              default_dir: null,
            })
          }
        >
          <Plus size={14} />
          Neues SSH-Profil
        </button>
      ) : null}
    </div>
  );
}

function SshEditor({
  initial,
  onDone,
}: {
  initial: SshProfile | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(initial?.port ?? 22);
  const [user, setUser] = useState(initial?.user ?? "root");
  const [authType, setAuthType] = useState<SshAuthMethod["type"]>(
    (initial?.auth_method as any)?.type ?? "key_file",
  );
  const [keyPath, setKeyPath] = useState(
    (initial?.auth_method as any)?.type === "key_file"
      ? (initial?.auth_method as any).path
      : "",
  );
  const [keyContent, setKeyContent] = useState("");
  const [keyName, setKeyName] = useState(
    initial?.auth_method?.type === "key_content"
      ? initial.auth_method.key_id
      : `ssh-key-${Date.now()}`,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name || !host) {
      setError("Name und Host sind erforderlich.");
      return;
    }
    setSaving(true);
    try {
      let auth_method: SshAuthMethod;
      if (authType === "key_file") {
        if (!keyPath) {
          setError("Key-Pfad ist erforderlich.");
          setSaving(false);
          return;
        }
        auth_method = { type: "key_file", path: keyPath };
      } else if (authType === "key_content") {
        if (!keyContent) {
          setError("Bitte Private-Key einfügen.");
          setSaving(false);
          return;
        }
        await api.setSecret(keyName, keyContent);
        auth_method = { type: "key_content", key_id: keyName };
      } else {
        setError("Passwort-Auth noch nicht implementiert.");
        setSaving(false);
        return;
      }
      const profile: SshProfile = {
        id: initial?.id || uuid(),
        name,
        host,
        port,
        user,
        auth_method,
        default_dir: null,
      };
      await api.upsertSsh(profile);
      const out = await onDone(true);
      void out;
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setError(null);
    try {
      const profile: SshProfile = {
        id: initial?.id || "test",
        name: name || "test",
        host,
        port,
        user,
        auth_method:
          authType === "key_file"
            ? { type: "key_file", path: keyPath }
            : authType === "key_content"
              ? { type: "key_content", key_id: keyName }
              : { type: "agent" },
        default_dir: null,
      };
      const out = await api.testSshWithProfile(profile);
      alert(`OK: ${out.trim()}`);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="card space-y-3">
      <div className="font-medium">{initial ? "SSH-Profil bearbeiten" : "Neues SSH-Profil"}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">User</label>
          <input className="input" value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div>
          <label className="label">Host</label>
          <input className="input" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div>
          <label className="label">Port</label>
          <input
            className="input"
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <label className="label">Authentifizierung</label>
        <select
          className="input"
          value={authType}
          onChange={(e) => setAuthType(e.target.value as any)}
        >
          <option value="key_file">SSH-Key (Dateipfad)</option>
          <option value="key_content">SSH-Key (Inhalt, im Vault)</option>
        </select>
      </div>
      {authType === "key_file" && (
        <div>
          <label className="label">Pfad zur Key-Datei</label>
          <input
            className="input font-mono"
            value={keyPath}
            onChange={(e) => setKeyPath(e.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
        </div>
      )}
      {authType === "key_content" && (
        <>
          <div>
            <label className="label">Vault-Key-Name</label>
            <input
              className="input"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Private Key (OpenSSH-Format)</label>
            <textarea
              className="input font-mono min-h-[120px] text-xs"
              value={keyContent}
              onChange={(e) => setKeyContent(e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;…"
            />
          </div>
        </>
      )}
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      <div className="flex gap-2">
        <button className="btn" onClick={() => onDone(false)}>
          <X size={14} />
          Abbrechen
        </button>
        <button className="btn" onClick={testConnection} disabled={saving}>
          Test
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Speichern
        </button>
      </div>
    </div>
  );
}

function CoolifySettings({
  profiles,
  refresh,
}: {
  profiles: Record<string, CoolifyProfile>;
  refresh: () => Promise<void>;
}) {
  const list = Object.values(profiles);
  const [editing, setEditing] = useState<CoolifyProfile | null>(null);

  return (
    <div className="space-y-3">
      {list.map((p) =>
        editing?.id === p.id ? (
          <CoolifyEditor
            key={p.id}
            initial={p}
            onDone={async (saved) => {
              setEditing(null);
              if (saved) await refresh();
            }}
          />
        ) : (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{p.base_url}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setEditing(p)}>
                Bearbeiten
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`Coolify-Profil "${p.name}" löschen?`)) return;
                  await api.deleteCoolify(p.id);
                  await refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ),
      )}
      {!editing && (
        <button
          className="btn"
          onClick={() =>
            setEditing({ id: "", name: "", base_url: "", token_id: "" })
          }
        >
          <Plus size={14} />
          Neues Coolify-Profil
        </button>
      )}
      {editing && (
        <CoolifyEditor
          key="editing"
          initial={editing.id ? editing : null}
          onDone={async (saved) => {
            setEditing(null);
            if (saved) await refresh();
          }}
        />
      )}
    </div>
  );
}

function CoolifyEditor({
  initial,
  onDone,
}: {
  initial: CoolifyProfile | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [token, setToken] = useState("");
  const [tokenName, setTokenName] = useState(
    initial?.token_id || `coolify-token-${Date.now()}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!name || !baseUrl) {
      setError("Name und URL sind erforderlich.");
      return;
    }
    if (!initial && !token) {
      setError("Bitte Token eingeben.");
      return;
    }
    setSaving(true);
    try {
      if (token) await api.setSecret(tokenName, token);
      const profile: CoolifyProfile = {
        id: initial?.id || uuid(),
        name,
        base_url: baseUrl,
        token_id: tokenName,
      };
      await api.upsertCoolify(profile);
      await onDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="font-medium">
        {initial ? "Coolify-Profil bearbeiten" : "Neues Coolify-Profil"}
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Base URL</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://coolify.example.com"
        />
      </div>
      <div>
        <label className="label">Vault-Token-Name</label>
        <input
          className="input"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Bearer Token (Scopes: read · write · deploy)</label>
        <input
          className="input font-mono"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={initial ? "(unverändert lassen)" : "Token einfügen"}
        />
      </div>
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      <div className="flex gap-2">
        <button className="btn" onClick={() => onDone(false)}>
          Abbrechen
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={14} />
          Speichern
        </button>
      </div>
    </div>
  );
}

function HestiaSettings({
  profiles,
  refresh,
}: {
  profiles: Record<string, HestiaProfile>;
  refresh: () => Promise<void>;
}) {
  const list = Object.values(profiles);
  const [editing, setEditing] = useState<HestiaProfile | null>(null);

  return (
    <div className="space-y-3">
      {list.map((p) =>
        editing?.id === p.id ? (
          <HestiaEditor
            key={p.id}
            initial={p}
            onDone={async (saved) => {
              setEditing(null);
              if (saved) await refresh();
            }}
          />
        ) : (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{p.base_url}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setEditing(p)}>
                Bearbeiten
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`Hestia-Profil "${p.name}" löschen?`)) return;
                  await api.deleteHestia(p.id);
                  await refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ),
      )}
      {!editing && (
        <button
          className="btn"
          onClick={() => setEditing({ id: "", name: "", base_url: "", key_id: "" })}
        >
          <Plus size={14} />
          Neues Hestia-Profil
        </button>
      )}
      {editing && (
        <HestiaEditor
          key="editing"
          initial={editing.id ? editing : null}
          onDone={async (saved) => {
            setEditing(null);
            if (saved) await refresh();
          }}
        />
      )}
    </div>
  );
}

function HestiaEditor({
  initial,
  onDone,
}: {
  initial: HestiaProfile | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [key, setKey] = useState("");
  const [keyName, setKeyName] = useState(
    initial?.key_id || `hestia-key-${Date.now()}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!name || !baseUrl) {
      setError("Name und URL sind erforderlich.");
      return;
    }
    if (!initial && !key) {
      setError("Bitte API-Key eingeben.");
      return;
    }
    setSaving(true);
    try {
      if (key) await api.setSecret(keyName, key);
      const profile: HestiaProfile = {
        id: initial?.id || uuid(),
        name,
        base_url: baseUrl,
        key_id: keyName,
      };
      await api.upsertHestia(profile);
      await onDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="font-medium">
        {initial ? "Hestia-Profil bearbeiten" : "Neues Hestia-Profil"}
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Base URL</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://hestia.example.com:8083"
        />
      </div>
      <div>
        <label className="label">Vault-Key-Name</label>
        <input
          className="input"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">API-Key</label>
        <input
          className="input font-mono"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={initial ? "(unverändert lassen)" : "Key einfügen"}
        />
      </div>
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      <div className="flex gap-2">
        <button className="btn" onClick={() => onDone(false)}>
          Abbrechen
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={14} />
          Speichern
        </button>
      </div>
    </div>
  );
}

function GithubSettings({
  profile,
  refresh,
}: {
  profile: GitHubProfile | null;
  refresh: () => Promise<void>;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [token, setToken] = useState("");
  const [tokenName, setTokenName] = useState(
    profile?.token_id || "github-token",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const save = async () => {
    setError(null);
    if (!profile && !token) {
      setError("Bitte Token eingeben.");
      return;
    }
    setSaving(true);
    try {
      if (token) await api.setSecret(tokenName, token);
      const p: GitHubProfile = {
        username: username || null,
        token_id: tokenName,
      };
      await api.setGithub(p);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3 max-w-2xl">
      <div className="font-medium">GitHub-Profil</div>
      <div>
        <label className="label">GitHub-Benutzername (optional, nur Anzeige)</label>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Vault-Token-Name</label>
        <input
          className="input"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">
          Personal Access Token (Fine-grained: Contents, Issues, Pull requests, Notifications)
        </label>
        <div className="flex gap-2">
          <input
            className="input font-mono"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={profile ? "(unverändert lassen)" : "ghp_… oder github_pat_…"}
          />
          <button
            className="btn"
            onClick={() => setShowToken(!showToken)}
            type="button"
          >
            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={14} />
          Speichern
        </button>
        {profile && (
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("GitHub-Profil entfernen?")) return;
              await api.clearGithub();
              await refresh();
              setUsername("");
              setToken("");
            }}
          >
            <Trash2 size={14} />
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

function authLabel(auth: SshAuthMethod): string {
  switch (auth.type) {
    case "key_file":
      return `Key-Datei: ${auth.path}`;
    case "key_content":
      return "Key (im Vault)";
    case "password":
      return "Passwort";
    case "agent":
      return "SSH-Agent";
  }
}
