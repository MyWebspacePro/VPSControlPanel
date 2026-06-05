import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  ArrowLeft,
  GitMerge,
  CheckCircle2,
  MessageSquare,
  FileCode,
  GitBranch,
  Plus,
  Edit3,
  Save,
  X,
  Loader2,
} from "lucide-react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

export function PullRequestDetail() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const n = Number(number);
  const navigate = useNavigate();
  const [pr, setPr] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<number>(0);
  const [reviewBody, setReviewBody] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [mergeMethod, setMergeMethod] = useState("squash");
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const load = async () => {
    if (!owner || !repo || !n) return;
    setLoading(true);
    try {
      const [p, f, c, r] = await Promise.all([
        api.ghPullRequest(owner, repo, n).catch(() => null),
        api.ghPrFiles(owner, repo, n).catch(() => []),
        api.ghPrComments(owner, repo, n).catch(() => []),
        api.ghPrReviews(owner, repo, n).catch(() => []),
      ]);
      const prObj = p as any;
      setPr(prObj);
      setFiles(f as any[]);
      setComments(c as any[]);
      setReviews(r as any[]);
      if (prObj) {
        setEditTitle(prObj.title);
        setEditBody(prObj.body || "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [owner, repo, n]);

  const submitReview = async (event: string) => {
    if (!owner || !repo || !n) return;
    if (!reviewBody.trim() && event === "COMMENT") {
      alert("Bitte einen Kommentar eingeben.");
      return;
    }
    try {
      await api.ghCreateReview(owner, repo, n, reviewBody, event);
      setReviewBody("");
      const r = (await api.ghPrReviews(owner, repo, n)) as any[];
      setReviews(r);
    } catch (e) {
      alert(String(e));
    }
  };

  const doMerge = async () => {
    if (!owner || !repo || !n) return;
    try {
      await api.ghMergePr(owner!, repo!, n, mergeMethod);
      alert("PR gemerged.");
      setShowMerge(false);
      const p = await api.ghPullRequest(owner, repo, n);
      setPr(p);
    } catch (e) {
      alert(String(e));
    }
  };

  const saveEdit = async () => {
    if (!owner || !repo || !n) return;
    try {
      await api.ghUpdatePullRequest(owner, repo, n, editTitle, editBody, null, null);
      setShowEdit(false);
      const p = await api.ghPullRequest(owner, repo, n);
      setPr(p);
    } catch (e) {
      alert(String(e));
    }
  };

  const closePR = async () => {
    if (!owner || !repo || !n) return;
    if (!confirm("PR wirklich schließen?")) return;
    try {
      await api.ghUpdatePullRequest(owner, repo, n, null, null, "closed", null);
      const p = await api.ghPullRequest(owner, repo, n);
      setPr(p);
    } catch (e) {
      alert(String(e));
    }
  };

  if (loading)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Lade PR …
      </div>
    );
  if (!pr)
    return (
      <div className="p-6 text-sm text-[var(--danger)]">PR nicht gefunden.</div>
    );

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="btn">
          <ArrowLeft size={14} />
        </button>
        <div className="text-sm text-[var(--text-muted)]">
          {owner}/{repo}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{pr.title}</h1>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            #{pr.number} · {pr.user?.login} · {pr.state} ·{" "}
            {pr.merged ? "merged" : pr.state}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`badge ${
              pr.merged
                ? "badge-muted"
                : pr.state === "open"
                  ? "badge-success"
                  : "badge-muted"
            }`}
          >
            {pr.merged ? "merged" : pr.state}
          </span>
          <button
            className="btn"
            onClick={() => setShowEdit(true)}
            title="PR bearbeiten"
          >
            <Edit3 size={14} />
          </button>
          {pr.state === "open" && !pr.merged && (
            <button
              className="btn"
              onClick={closePR}
              title="PR schließen (ohne Merge)"
            >
              <X size={14} />
              Schließen
            </button>
          )}
          {pr.state === "open" && !pr.merged && (
            <button
              className="btn btn-primary"
              onClick={() => setShowMerge(true)}
            >
              <GitMerge size={14} />
              Merge
            </button>
          )}
        </div>
      </div>

      {showEdit && (
        <div className="card space-y-3">
          <div className="font-medium">PR bearbeiten</div>
          <div>
            <label className="label">Titel</label>
            <input
              className="input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Beschreibung (Markdown)</label>
            <textarea
              className="input min-h-[200px] font-mono text-xs"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setShowEdit(false)}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={saveEdit}>
              <Save size={14} />
              Speichern
            </button>
          </div>
        </div>
      )}

      {showMerge && (
        <div className="card space-y-3">
          <div className="font-medium">PR mergen</div>
          <div className="flex gap-2">
            {["merge", "squash", "rebase"].map((m) => (
              <label
                key={m}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="merge_method"
                  checked={mergeMethod === m}
                  onChange={() => setMergeMethod(m)}
                />
                {m}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setShowMerge(false)}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={doMerge}>
              Bestätigen
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="text-sm text-[var(--text-muted)] mb-2">
              Beschreibung
            </div>
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {pr.body || "(keine)"}
            </pre>
          </div>

          {files.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">
                  Geänderte Dateien ({files.length})
                </h3>
                <div className="text-xs text-[var(--text-muted)]">
                  +{pr.additions} / -{pr.deletions}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-1 space-y-1 max-h-[500px] overflow-auto">
                  {files.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFile(i)}
                      className={`w-full text-left px-2 py-1.5 text-xs font-mono rounded transition ${
                        selectedFile === i
                          ? "bg-[var(--accent)] text-white"
                          : "hover:bg-[var(--bg)]"
                      }`}
                    >
                      <div className="truncate">{f.filename}</div>
                      <div className="flex gap-2 text-[10px] opacity-70">
                        <span>+{f.additions}</span>
                        <span>-{f.deletions}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="md:col-span-3 border border-[var(--border)] rounded-lg overflow-auto max-h-[500px]">
                  {files[selectedFile]?.patch ? (
                    <ReactDiffViewer
                      oldValue={extractOld(files[selectedFile].patch)}
                      newValue={extractNew(files[selectedFile].patch)}
                      splitView={false}
                      compareMethod={DiffMethod.LINES}
                      useDarkTheme={document.documentElement.classList.contains(
                        "dark",
                      )}
                    />
                  ) : (
                    <div className="p-4 text-sm text-[var(--text-muted)]">
                      Kein Diff verfügbar.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-medium mb-2">Reviews</h3>
            {reviews.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">
                Noch keine Reviews.
              </div>
            ) : (
              <div className="space-y-2">
                {reviews.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="font-medium">{r.user?.login}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {r.state} · {r.submitted_at?.slice(0, 10)}
                    </div>
                    {r.body && (
                      <pre className="whitespace-pre-wrap text-xs mt-1 font-sans">
                        {r.body}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="font-medium mb-2">Diskussion</h3>
            {comments.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">
                Keine Kommentare.
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="font-medium">{c.user?.login}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {c.created_at?.slice(0, 10)}
                      {c.path && ` · ${c.path}`}
                    </div>
                    <pre className="whitespace-pre-wrap text-xs mt-1 font-sans">
                      {c.body}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="font-medium mb-2">Review abgeben</h3>
            <textarea
              className="input min-h-[100px]"
              placeholder="Kommentar …"
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button
                className="btn"
                onClick={() => submitReview("COMMENT")}
              >
                <MessageSquare size={14} />
                Kommentar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => submitReview("APPROVE")}
              >
                <CheckCircle2 size={14} />
                Approve
              </button>
              <button
                className="btn btn-danger"
                onClick={() => submitReview("REQUEST_CHANGES")}
              >
                Request Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IssueDetail() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const n = Number(number);
  const navigate = useNavigate();
  const [issue, setIssue] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const load = async () => {
    if (!owner || !repo || !n) return;
    const [i, c] = await Promise.all([
      api.ghIssue(owner, repo, n).catch(() => null),
      api.ghIssueComments(owner, repo, n).catch(() => []),
    ]);
    const issueObj = i as any;
    setIssue(issueObj);
    setComments(c as any[]);
    if (issueObj) {
      setEditTitle(issueObj.title);
      setEditBody(issueObj.body || "");
    }
  };

  useEffect(() => {
    load();
  }, [owner, repo, n]);

  const addComment = async () => {
    if (!owner || !repo || !n || !newComment.trim()) return;
    try {
      await api.ghCreateIssueComment(owner, repo, n, newComment);
      setNewComment("");
      const c = (await api.ghIssueComments(owner, repo, n)) as any[];
      setComments(c);
    } catch (e) {
      alert(String(e));
    }
  };

  const saveEdit = async () => {
    if (!owner || !repo || !n) return;
    try {
      await api.ghUpdateIssue(owner, repo, n, editTitle, editBody, null, null, null);
      setShowEdit(false);
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  const toggleState = async () => {
    if (!owner || !repo || !n || !issue) return;
    const next = issue.state === "open" ? "closed" : "open";
    try {
      await api.ghUpdateIssue(owner, repo, n, null, null, next, null, null);
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteComment = async (c: any) => {
    if (!owner || !repo) return;
    if (!confirm("Kommentar löschen?")) return;
    try {
      await api.ghDeleteIssueComment(owner, repo, c.id);
      setComments(comments.filter((x) => x.id !== c.id));
    } catch (e) {
      alert(String(e));
    }
  };

  const editComment = async (c: any) => {
    if (!owner || !repo) return;
    const newBody = prompt("Neuer Kommentartext:", c.body);
    if (!newBody) return;
    try {
      await api.ghUpdateIssueComment(owner, repo, c.id, newBody);
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  if (!issue)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Lade …
      </div>
    );

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="btn">
          <ArrowLeft size={14} />
        </button>
        <div className="text-sm text-[var(--text-muted)]">
          {owner}/{repo}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{issue.title}</h1>
          <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2 flex-wrap">
            <span
              className={`badge ${
                issue.state === "open" ? "badge-success" : "badge-muted"
              }`}
            >
              {issue.state}
            </span>
            #{issue.number} · {issue.user?.login} ·{" "}
            {issue.created_at?.slice(0, 10)}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setShowEdit(true)}>
            <Edit3 size={14} />
            Bearbeiten
          </button>
          <button className="btn" onClick={toggleState}>
            {issue.state === "open" ? (
              <>
                <X size={14} />
                Schließen
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                Wieder öffnen
              </>
            )}
          </button>
        </div>
      </div>

      {showEdit && (
        <div className="card space-y-3">
          <div className="font-medium">Issue bearbeiten</div>
          <div>
            <label className="label">Titel</label>
            <input
              className="input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Beschreibung (Markdown)</label>
            <textarea
              className="input min-h-[200px] font-mono text-xs"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setShowEdit(false)}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={saveEdit}>
              <Save size={14} />
              Speichern
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <pre className="whitespace-pre-wrap text-sm font-sans">
          {issue.body || "(keine Beschreibung)"}
        </pre>
      </div>

      <div className="card">
        <h3 className="font-medium mb-3">Kommentare</h3>
        {comments.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">Keine Kommentare.</div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="text-sm border-t border-[var(--border)] pt-3 first:border-0 first:pt-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{c.user?.login}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">
                      {c.created_at?.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="text-xs text-[var(--accent)] hover:opacity-80"
                      onClick={() => editComment(c)}
                    >
                      bearbeiten
                    </button>
                    <button
                      className="text-xs text-[var(--danger)] hover:opacity-80"
                      onClick={() => deleteComment(c)}
                    >
                      löschen
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs mt-1 font-sans">
                  {c.body}
                </pre>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <textarea
            className="input min-h-[80px]"
            placeholder="Neuer Kommentar (Markdown) …"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button
              className="btn btn-primary"
              onClick={addComment}
              disabled={!newComment.trim()}
            >
              <MessageSquare size={14} />
              Kommentieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RepoView() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ref] = useState("HEAD");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [showNewPr, setShowNewPr] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [commits, setCommits] = useState<any[]>([]);

  const load = async () => {
    if (!owner || !repo) return;
    setLoading(true);
    api
      .ghRepoTree(owner, repo, ref)
      .then((t) => setTree(t as any[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [owner, repo, ref]);

  useEffect(() => {
    if (!owner || !repo || !activePath) return;
    setFileLoading(true);
    api
      .ghFileContent(owner, repo, activePath, ref)
      .then((c) => setFileContent(c))
      .finally(() => setFileLoading(false));
  }, [owner, repo, activePath, ref]);

  if (loading)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Lade Repo …
      </div>
    );

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="btn">
          <ArrowLeft size={14} />
        </button>
        <div className="text-sm text-[var(--text-muted)]">
          {owner}/{repo}
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">
          {owner}/{repo}
        </h1>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={() => setShowNewIssue(true)}
          >
            <Plus size={14} />
            Neues Issue
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewPr(true)}
          >
            <Plus size={14} />
            Neuer PR
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-1">
          <h3 className="font-medium mb-3">Dateien</h3>
          {tree.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">
              Leer oder nicht verfügbar.
            </div>
          ) : (
            <div className="text-sm font-mono">
              {tree.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => setActivePath(entry.path)}
                  className={`w-full text-left py-1 px-2 rounded flex items-center gap-2 ${
                    activePath === entry.path
                      ? "bg-[var(--accent)] text-white"
                      : "hover:bg-[var(--bg)]"
                  }`}
                >
                  {entry.type === "dir" ? (
                    <GitBranch size={12} className="text-[var(--text-muted)]" />
                  ) : (
                    <FileCode size={12} className="text-[var(--text-muted)]" />
                  )}
                  <span className="truncate">{entry.name}</span>
                  {entry.size != null && (
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                      {Math.round(entry.size / 1024)} KB
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card lg:col-span-2">
          {activePath ? (
            <FileViewer
              owner={owner!}
              repo={repo!}
              path={activePath}
              branch={ref}
              content={fileContent}
              loading={fileLoading}
              onSaved={() => {
                setFileContent(null);
                load();
              }}
            />
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              Wähle eine Datei aus der Liste.
            </div>
          )}
        </div>
      </div>

      {showNewIssue && owner && repo && (
        <NewIssueModal
          owner={owner}
          repo={repo}
          onClose={() => setShowNewIssue(false)}
          onCreated={(i) => {
            setShowNewIssue(false);
            navigate(`/github/issues/${owner}/${repo}/${i.number}`);
          }}
        />
      )}
      {showNewPr && owner && repo && (
        <NewPullRequestModal
          owner={owner}
          repo={repo}
          branches={branches}
          defaultBranch="main"
          onLoadBranches={async () => {
            const b = (await api.ghBranches(owner, repo)) as any[];
            setBranches(b);
            return b;
          }}
          onLoadCommits={async (sha) => {
            const c = (await api.ghCommits(owner, repo, sha, null)) as any[];
            setCommits(c);
            return c;
          }}
          commits={commits}
          onClose={() => setShowNewPr(false)}
          onCreated={(pr) => {
            setShowNewPr(false);
            navigate(`/github/prs/${owner}/${repo}/${pr.number}`);
          }}
        />
      )}
    </div>
  );
}

function FileViewer({
  owner,
  repo,
  path,
  branch,
  content,
  loading,
  onSaved,
}: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  content: any;
  loading: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [sha, setSha] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [commits, setCommits] = useState<any[]>([]);

  useEffect(() => {
    if (content) {
      if (content.content && content.encoding === "base64") {
        try {
          const decoded = atob(content.content.replace(/\s/g, ""));
          setText(decoded);
        } catch {
          setText(content.content);
        }
      } else if (content.content) {
        setText(content.content);
      }
      setSha(content.sha || null);
      setMessage(`Update ${path}`);
    }
  }, [content]);

  useEffect(() => {
    api
      .ghCommits(owner, repo, branch, path)
      .then((c) => setCommits(c as any[]))
      .catch(() => {});
  }, [owner, repo, path, branch]);

  const save = async () => {
    if (!message.trim()) {
      alert("Commit-Message ist Pflicht.");
      return;
    }
    setSaving(true);
    try {
      await api.ghUpdateFile(owner, repo, path, message, text, sha, branch);
      setEditing(false);
      onSaved();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Lade Datei …
      </div>
    );

  const isText = content?.encoding === "base64" || content?.type === "file";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium font-mono text-sm">{path}</h3>
        {isText && !editing && (
          <button className="btn" onClick={() => setEditing(true)}>
            <Edit3 size={14} />
            Bearbeiten
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="input font-mono text-xs min-h-[400px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            className="input"
            placeholder="Commit-Message (Pflicht)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="text-xs text-[var(--text-muted)]">
            Branch: {branch} · {text.length} Zeichen
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Commit
            </button>
          </div>
        </div>
      ) : (
        <pre className="text-[11px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded p-3 max-h-[500px] overflow-auto whitespace-pre-wrap break-all">
          {text || "(leer oder binär)"}
        </pre>
      )}
      {commits.length > 0 && !editing && (
        <div className="pt-3 border-t border-[var(--border)]">
          <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">
            Letzte Commits
          </h4>
          <div className="space-y-1 text-[11px]">
            {commits.slice(0, 5).map((c) => (
              <div key={c.sha} className="flex gap-2 font-mono">
                <span className="text-[var(--text-muted)] w-16 truncate">
                  {c.sha?.slice(0, 7)}
                </span>
                <span className="truncate flex-1">
                  {c.commit?.message?.split("\n")[0]}
                </span>
                <span className="text-[var(--text-muted)]">
                  {c.commit?.author?.date?.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NewIssueModal({
  owner,
  repo,
  onClose,
  onCreated,
}: {
  owner: string;
  repo: string;
  onClose: () => void;
  onCreated: (i: any) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      alert("Titel ist Pflicht.");
      return;
    }
    setLoading(true);
    try {
      const i = await api.ghCreateIssue(owner, repo, title, body || null, null, null);
      onCreated(i);
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title={`Neues Issue in ${owner}/${repo}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Titel *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kurze Beschreibung des Problems"
          />
        </div>
        <div>
          <label className="label">Beschreibung (Markdown)</label>
          <textarea
            className="input min-h-[200px] font-mono text-xs"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="## Steps to reproduce&#10;1.&#10;2."
          />
        </div>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={submit}
        submitLabel="Erstellen"
        submitDisabled={!title.trim() || loading}
      />
    </ModalShell>
  );
}

function NewPullRequestModal({
  owner,
  repo,
  branches,
  defaultBranch,
  onLoadBranches,
  onLoadCommits,
  commits,
  onClose,
  onCreated,
}: {
  owner: string;
  repo: string;
  branches: any[];
  defaultBranch: string;
  onLoadBranches: () => Promise<any[]>;
  onLoadCommits: (sha: string) => Promise<any[]>;
  commits: any[];
  onClose: () => void;
  onCreated: (pr: any) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState(defaultBranch);
  const [draft, setDraft] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branches.length === 0) {
      onLoadBranches().then((b) => {
        if (b.length > 0) {
          setHead(b[0].name);
          const main = b.find((br: any) => br.name === "main" || br.name === "master");
          if (main) setBase(main.name);
        }
      });
    } else {
      if (branches.length > 0) {
        setHead(branches[0].name);
        const main = branches.find(
          (br: any) => br.name === "main" || br.name === "master",
        );
        if (main) setBase(main.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (head) onLoadCommits(head);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head]);

  const submit = async () => {
    if (!title.trim() || !head || !base) {
      alert("Titel, Head und Base sind Pflicht.");
      return;
    }
    if (head === base) {
      alert("Head und Base müssen unterschiedlich sein.");
      return;
    }
    setLoading(true);
    try {
      const pr = await api.ghCreatePullRequest(
        owner,
        repo,
        title,
        head,
        base,
        body || null,
        draft,
      );
      onCreated(pr);
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title={`Neuer PR in ${owner}/${repo}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Titel *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Head (dein Branch) *</label>
            <select
              className="input"
              value={head}
              onChange={(e) => setHead(e.target.value)}
            >
              <option value="">— wählen —</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Base (Ziel-Branch) *</label>
            <select
              className="input"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              <option value="">— wählen —</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {head && (
          <div>
            <label className="label">Commits auf {head}</label>
            <div className="text-[11px] font-mono max-h-32 overflow-auto border border-[var(--border)] rounded p-2 space-y-1">
              {commits.length === 0 ? (
                <div className="text-[var(--text-muted)]">Keine Commits.</div>
              ) : (
                commits.slice(0, 10).map((c) => (
                  <div key={c.sha} className="flex gap-2">
                    <span className="text-[var(--text-muted)]">
                      {c.sha?.slice(0, 7)}
                    </span>
                    <span className="truncate flex-1">
                      {c.commit?.message?.split("\n")[0]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <div>
          <label className="label">Beschreibung (Markdown)</label>
          <textarea
            className="input min-h-[150px] font-mono text-xs"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="## Was ändert sich&#10;## Wie testen"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
          />
          Als Draft erstellen
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={submit}
        submitLabel="PR erstellen"
        submitDisabled={!title.trim() || !head || !base || loading}
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
        className="bg-[var(--bg-elevated)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
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

function extractOld(patch: string): string {
  return patch
    .split("\n")
    .filter((l) => !l.startsWith("+") || l.startsWith("+++"))
    .map((l) => (l.startsWith("-") ? l.slice(1) : l.startsWith("+++") ? "" : l))
    .join("\n");
}

function extractNew(patch: string): string {
  return patch
    .split("\n")
    .filter((l) => !l.startsWith("-") || l.startsWith("---"))
    .map((l) => (l.startsWith("+") ? l.slice(1) : l.startsWith("---") ? "" : l))
    .join("\n");
}
