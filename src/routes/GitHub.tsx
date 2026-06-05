import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useStore } from "../state/useStore";
import {
  AlertCircle,
  Bell,
  GitPullRequest,
  CircleDot,
  Box,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
  Edit3,
  RefreshCw,
  Search,
} from "lucide-react";

type Tab = "inbox" | "issues" | "notifications" | "repos" | "search";

export default function GitHub() {
  const profile = useStore((s) => s.profiles.github);
  const [tab, setTab] = useState<Tab>("inbox");
  const [prs, setPrs] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [editingRepo, setEditingRepo] = useState<any | null>(null);
  const [newRepo, setNewRepo] = useState({
    name: "",
    description: "",
    isPrivate: false,
    autoInit: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchReposResults, setSearchReposResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    Promise.all([
      api.ghSearchPrs().catch(() => []),
      api.ghAssignedIssues().catch(() => []),
      api.ghNotifications().catch(() => []),
      api.ghRepos().catch(() => []),
    ])
      .then(([p, i, n, r]) => {
        setPrs(p as any[]);
        setIssues(i as any[]);
        setNotifications(n as any[]);
        setRepos(r as any[]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setSearchReposResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const [issues, repos] = await Promise.all([
        api.ghSearch(q).catch(() => []),
        api.ghSearchRepositories(q).catch(() => []),
      ]);
      setSearchResults(issues as any[]);
      setSearchReposResults(repos as any[]);
    } finally {
      setSearchLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <h1 className="text-xl font-semibold mb-4">GitHub</h1>
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[var(--warning)] mt-0.5" size={18} />
            <div>
              <div className="font-medium">Kein GitHub-Profil</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Füge deinen Personal Access Token in den{" "}
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

  const createRepo = async () => {
    if (!newRepo.name) return;
    try {
      await api.ghCreateRepo(
        newRepo.name,
        newRepo.description || null,
        newRepo.isPrivate,
        newRepo.autoInit,
      );
      setNewRepo({ name: "", description: "", isPrivate: false, autoInit: true });
      setShowCreateRepo(false);
      const r = (await api.ghRepos()) as any[];
      setRepos(r);
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteRepo = async (r: any) => {
    if (
      !confirm(
        `Repo "${r.full_name}" wirklich löschen? Tippe OK zum Bestätigen.`,
      )
    )
      return;
    try {
      await api.ghDeleteRepo(r.owner.login, r.name);
      const list = (await api.ghRepos()) as any[];
      setRepos(list);
    } catch (e) {
      alert(String(e));
    }
  };

  const updateRepo = async () => {
    if (!editingRepo) return;
    try {
      await api.ghUpdateRepo(
        editingRepo.owner.login,
        editingRepo.name,
        editingRepo.description ?? null,
        editingRepo.private,
        null,
        null,
      );
      setEditingRepo(null);
      const list = (await api.ghRepos()) as any[];
      setRepos(list);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">GitHub</h1>
        <div className="flex gap-2">
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Aktualisieren
          </button>
          {tab === "repos" && (
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateRepo(true)}
            >
              <Plus size={14} />
              Neues Repo
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: "inbox", label: "PR-Inbox", icon: GitPullRequest, count: prs.length },
          { key: "issues", label: "Issues", icon: CircleDot, count: issues.length },
          {
            key: "notifications",
            label: "Notifications",
            icon: Bell,
            count: notifications.filter((n) => n.unread).length,
          },
          { key: "repos", label: "Repos", icon: Box, count: repos.length },
          { key: "search", label: "Suche", icon: Search, count: 0 },
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
            {t.count > 0 && (
              <span className="badge badge-muted ml-1">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Lade …
        </div>
      ) : tab === "inbox" ? (
        <PrList prs={prs} />
      ) : tab === "issues" ? (
        <IssueList issues={issues} />
      ) : tab === "notifications" ? (
        <NotificationList
          notifications={notifications}
          onMarkRead={async (id) => {
            try {
              await api.ghMarkNotificationRead(id);
              setNotifications(
                notifications.map((n) =>
                  n.id === id ? { ...n, unread: false } : n,
                ),
              );
            } catch (e) {
              alert(String(e));
            }
          }}
        />
      ) : tab === "repos" ? (
        <RepoList
          repos={repos}
          onDelete={deleteRepo}
          onEdit={(r) => setEditingRepo(r)}
        />
      ) : (
        <SearchView
          query={searchQuery}
          setQuery={setSearchQuery}
          onSearch={runSearch}
          loading={searchLoading}
          issues={searchResults}
          repos={searchReposResults}
        />
      )}

      {showCreateRepo && (
        <CreateRepoModal
          value={newRepo}
          onChange={setNewRepo}
          onClose={() => setShowCreateRepo(false)}
          onSubmit={createRepo}
        />
      )}
      {editingRepo && (
        <EditRepoModal
          repo={editingRepo}
          onChange={setEditingRepo}
          onClose={() => setEditingRepo(null)}
          onSubmit={updateRepo}
        />
      )}
    </div>
  );
}

function CreateRepoModal({
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  value: { name: string; description: string; isPrivate: boolean; autoInit: boolean };
  onChange: (v: typeof value) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell title="Neues Repository" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input
            className="input"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="mein-projekt"
          />
        </div>
        <div>
          <label className="label">Beschreibung (optional)</label>
          <textarea
            className="input min-h-[60px]"
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            placeholder="Kurze Beschreibung"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={value.isPrivate}
            onChange={(e) => onChange({ ...value, isPrivate: e.target.checked })}
          />
          Privat (nur du siehst es)
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={value.autoInit}
            onChange={(e) => onChange({ ...value, autoInit: e.target.checked })}
          />
          Mit README initialisieren
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={onSubmit}
        submitLabel="Erstellen"
        submitDisabled={!value.name}
      />
    </ModalShell>
  );
}

function EditRepoModal({
  repo,
  onChange,
  onClose,
  onSubmit,
}: {
  repo: any;
  onChange: (r: any) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell title={`Bearbeite ${repo.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Beschreibung</label>
          <textarea
            className="input min-h-[80px]"
            value={repo.description || ""}
            onChange={(e) => onChange({ ...repo, description: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!repo.private}
            onChange={(e) => onChange({ ...repo, private: e.target.checked })}
          />
          Privat
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={onSubmit}
        submitLabel="Speichern"
      />
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="btn">
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-3 mt-3 border-t border-[var(--border)]">
      <button className="btn" onClick={onClose}>
        Abbrechen
      </button>
      <button
        className="btn btn-primary ml-auto"
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        <Save size={14} />
        {submitLabel}
      </button>
    </div>
  );
}

function PrList({ prs }: { prs: any[] }) {
  if (prs.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine offenen PRs.</div>;
  return (
    <div className="space-y-2">
      {prs.map((p) => (
        <Link
          key={`${p.owner}/${p.repo}#${p.number}`}
          to={`/github/prs/${p.owner}/${p.repo}/${p.number}`}
          className="card flex items-start gap-3 hover:border-[var(--accent)] transition"
        >
          <GitPullRequest size={16} className="mt-1 text-[var(--accent)]" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{p.title}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {p.owner}/{p.repo} · #{p.number} · {p.user} ·{" "}
              {p.updated_at?.slice(0, 10)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: any[] }) {
  if (issues.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine zugewiesenen Issues.</div>;
  return (
    <div className="space-y-2">
      {issues.map((i) => {
        const url: string = i.repository_url || "";
        const parts = url.split("/");
        const owner = parts[parts.length - 2];
        const repo = parts[parts.length - 1];
        return (
          <Link
            key={i.id}
            to={`/github/issues/${owner}/${repo}/${i.number}`}
            className="card flex items-start gap-3 hover:border-[var(--accent)] transition"
          >
            <CircleDot size={16} className="mt-1 text-[var(--success)]" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{i.title}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {owner}/{repo} · #{i.number} · {i.user?.login}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function NotificationList({
  notifications,
  onMarkRead,
}: {
  notifications: any[];
  onMarkRead: (id: string) => void;
}) {
  if (notifications.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Benachrichtigungen.</div>;
  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="card flex items-start gap-3"
          style={{ opacity: n.unread ? 1 : 0.6 }}
        >
          <Bell
            size={16}
            className={`mt-1 ${
              n.unread ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{n.subject?.title}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {n.repository?.full_name} · {n.subject?.subject_type} · {n.reason}
            </div>
          </div>
          {n.unread && (
            <button
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() => onMarkRead(n.id)}
            >
              gelesen
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function RepoList({
  repos,
  onDelete,
  onEdit,
}: {
  repos: any[];
  onDelete: (r: any) => void;
  onEdit: (r: any) => void;
}) {
  if (repos.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Repos.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {repos.map((r) => (
        <div key={r.id} className="card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Link
              to={`/github/repos/${r.owner?.login || r.full_name.split("/")[0]}/${r.name}`}
              className="font-medium truncate hover:text-[var(--accent)]"
            >
              {r.full_name}
            </Link>
            {r.private && <span className="badge badge-muted">privat</span>}
          </div>
          {r.description && (
            <div className="text-xs text-[var(--text-muted)] line-clamp-2">
              {r.description}
            </div>
          )}
          <div className="text-[11px] text-[var(--text-muted)] flex gap-3">
            {r.language && <span>{r.language}</span>}
            {r.stargazers_count != null && <span>★ {r.stargazers_count}</span>}
          </div>
          <div className="flex gap-1 pt-2 border-t border-[var(--border)]">
            <button className="btn text-xs flex-1" onClick={() => onEdit(r)}>
              <Edit3 size={12} />
              Bearbeiten
            </button>
            <button
              className="btn text-xs text-[var(--danger)]"
              onClick={() => onDelete(r)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchView({
  query,
  setQuery,
  onSearch,
  loading,
  issues,
  repos,
}: {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (q: string) => void;
  loading: boolean;
  issues: any[];
  repos: any[];
}) {
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query);
        }}
        className="flex gap-2"
      >
        <input
          className="input flex-1"
          placeholder="z.B. repo:mein-org/mein-repo is:open author:@me"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          Suchen
        </button>
      </form>
      <div className="text-[11px] text-[var(--text-muted)]">
        GitHub-Suchsyntax: <code>is:open</code> <code>is:pr</code>{" "}
        <code>is:issue</code> <code>label:bug</code> <code>author:@me</code>
      </div>
      {loading ? (
        <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Suche …
        </div>
      ) : query.trim() && issues.length === 0 && repos.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)]">Keine Ergebnisse.</div>
      ) : (
        <div className="space-y-4">
          {repos.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-muted)] mb-2">
                Repositories ({repos.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {repos.map((r) => (
                  <Link
                    key={r.id}
                    to={`/github/repos/${r.owner?.login || r.full_name.split("/")[0]}/${r.name}`}
                    className="card hover:border-[var(--accent)] transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">{r.full_name}</div>
                      {r.private && (
                        <span className="badge badge-muted">privat</span>
                      )}
                    </div>
                    {r.description && (
                      <div className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                        {r.description}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-muted)] mb-2">
                Issues & PRs ({issues.length})
              </h3>
              <div className="space-y-2">
                {issues.map((i) => {
                  const url: string = i.repository_url || "";
                  const parts = url.split("/");
                  const owner = parts[parts.length - 2];
                  const repo = parts[parts.length - 1];
                  const isPr = !!i.pull_request;
                  const path = isPr ? "prs" : "issues";
                  return (
                    <Link
                      key={i.id}
                      to={`/github/${path}/${owner}/${repo}/${i.number}`}
                      className="card flex items-start gap-3 hover:border-[var(--accent)] transition"
                    >
                      {isPr ? (
                        <GitPullRequest
                          size={16}
                          className="mt-1 text-[var(--accent)]"
                        />
                      ) : (
                        <CircleDot
                          size={16}
                          className={`mt-1 ${
                            i.state === "open"
                              ? "text-[var(--success)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{i.title}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {owner}/{repo} · #{i.number} · {i.user?.login}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
