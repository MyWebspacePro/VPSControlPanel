import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, GitMerge, CheckCircle2, MessageSquare, FileCode, GitBranch } from "lucide-react";
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

  useEffect(() => {
    if (!owner || !repo || !n) return;
    setLoading(true);
    Promise.all([
      api.ghPullRequest(owner, repo, n).catch(() => null),
      api.ghPrFiles(owner, repo, n).catch(() => []),
      api.ghPrComments(owner, repo, n).catch(() => []),
      api.ghPrReviews(owner, repo, n).catch(() => []),
    ])
      .then(([p, f, c, r]) => {
        setPr(p);
        setFiles(f as any[]);
        setComments(c as any[]);
        setReviews(r as any[]);
      })
      .finally(() => setLoading(false));
  }, [owner, repo, n]);

  if (loading)
    return <div className="p-6 text-sm text-[var(--text-muted)]">Lade PR …</div>;
  if (!pr)
    return <div className="p-6 text-sm text-[var(--danger)]">PR nicht gefunden.</div>;

  const submitReview = async (event: string) => {
    if (!reviewBody.trim() && event === "COMMENT") {
      alert("Bitte einen Kommentar eingeben.");
      return;
    }
    try {
      await api.ghCreateReview(owner!, repo!, n, reviewBody, event);
      setReviewBody("");
      const r = (await api.ghPrReviews(owner!, repo!, n)) as any[];
      setReviews(r);
    } catch (e) {
      alert(String(e));
    }
  };

  const doMerge = async () => {
    try {
      await api.ghMergePr(owner!, repo!, n, mergeMethod);
      alert("PR gemerged.");
      setShowMerge(false);
      const p = await api.ghPullRequest(owner!, repo!, n);
      setPr(p);
    } catch (e) {
      alert(String(e));
    }
  };

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
        <div className="flex items-center gap-2">
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
          {pr.state === "open" && !pr.merged && (
            <button className="btn btn-primary" onClick={() => setShowMerge(true)}>
              <GitMerge size={14} />
              Merge
            </button>
          )}
        </div>
      </div>

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
            <div className="text-sm text-[var(--text-muted)] mb-2">Beschreibung</div>
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {pr.body || "(keine)"}
            </pre>
          </div>

          {files.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Geänderte Dateien ({files.length})</h3>
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
                      useDarkTheme={document.documentElement.classList.contains("dark")}
                    />
                  ) : (
                    <div className="p-4 text-sm text-[var(--text-muted)]">
                      Kein Diff verfügbar (binary oder zu groß).
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
              <div className="text-sm text-[var(--text-muted)]">Noch keine Reviews.</div>
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
              <div className="text-sm text-[var(--text-muted)]">Keine Kommentare.</div>
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

  useEffect(() => {
    if (!owner || !repo || !n) return;
    Promise.all([
      api.ghIssue(owner, repo, n).catch(() => null),
      api.ghIssueComments(owner, repo, n).catch(() => []),
    ]).then(([i, c]) => {
      setIssue(i);
      setComments(c as any[]);
    });
  }, [owner, repo, n]);

  if (!issue) return <div className="p-6 text-sm text-[var(--text-muted)]">Lade …</div>;

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
      <h1 className="text-xl font-semibold">{issue.title}</h1>
      <div className="text-xs text-[var(--text-muted)]">
        #{issue.number} · {issue.user?.login} · {issue.state} ·{" "}
        {issue.created_at?.slice(0, 10)}
      </div>
      <div className="card">
        <pre className="whitespace-pre-wrap text-sm font-sans">{issue.body || "(keine)"}</pre>
      </div>
      {comments.length > 0 && (
        <div className="card">
          <h3 className="font-medium mb-3">Kommentare</h3>
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="font-medium">{c.user?.login}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {c.created_at?.slice(0, 10)}
                </div>
                <pre className="whitespace-pre-wrap text-xs mt-1 font-sans">
                  {c.body}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RepoView() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ref] = useState("HEAD");

  useEffect(() => {
    if (!owner || !repo) return;
    setLoading(true);
    api
      .ghRepoTree(owner, repo, ref)
      .then((t) => setTree(t as any[]))
      .finally(() => setLoading(false));
  }, [owner, repo, ref]);

  if (loading)
    return <div className="p-6 text-sm text-[var(--text-muted)]">Lade Repo …</div>;

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
      <h1 className="text-xl font-semibold">{owner}/{repo}</h1>
      <div className="card">
        <div className="text-sm font-mono">
          {tree.length === 0 ? (
            <div className="text-[var(--text-muted)]">Leer oder nicht verfügbar.</div>
          ) : (
            tree.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1 px-2 hover:bg-[var(--bg)] rounded"
              >
                {entry.type === "dir" ? (
                  <GitBranch size={12} className="text-[var(--text-muted)]" />
                ) : (
                  <FileCode size={12} className="text-[var(--text-muted)]" />
                )}
                <span>{entry.name}</span>
                {entry.size != null && (
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                    {Math.round(entry.size / 1024)} KB
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
