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
} from "lucide-react";

type Tab = "inbox" | "issues" | "notifications" | "repos";

export default function GitHub() {
  const profile = useStore((s) => s.profiles.github);
  const [tab, setTab] = useState<Tab>("inbox");
  const [prs, setPrs] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
  }, [profile]);

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

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">GitHub</h1>
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
        <div className="text-sm text-[var(--text-muted)]">Lade …</div>
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
                notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)),
              );
            } catch (e) {
              alert(String(e));
            }
          }}
        />
      ) : (
        <RepoList repos={repos} />
      )}
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
            className={`mt-1 ${n.unread ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}
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

function RepoList({ repos }: { repos: any[] }) {
  if (repos.length === 0)
    return <div className="text-sm text-[var(--text-muted)]">Keine Repos gefunden.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {repos.map((r) => (
        <Link
          key={r.id}
          to={`/github/repos/${r.owner?.login || r.full_name.split("/")[0]}/${r.name}`}
          className="card hover:border-[var(--accent)] transition"
        >
          <div className="flex items-center justify-between">
            <div className="font-medium truncate">{r.full_name}</div>
            {r.private && <span className="badge badge-muted">privat</span>}
          </div>
          {r.description && (
            <div className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
              {r.description}
            </div>
          )}
          <div className="text-[11px] text-[var(--text-muted)] mt-2 flex gap-3">
            {r.language && <span>{r.language}</span>}
            {r.stargazers_count != null && <span>★ {r.stargazers_count}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
