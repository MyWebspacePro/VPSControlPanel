import { invoke } from "@tauri-apps/api/core";

export type SshAuthMethod =
  | { type: "key_file"; path: string }
  | { type: "key_content"; key_id: string }
  | { type: "password"; password_id: string }
  | { type: "agent" };

export interface SshProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth_method: SshAuthMethod;
  default_dir: string | null;
}

export interface CoolifyProfile {
  id: string;
  name: string;
  base_url: string;
  token_id: string;
}

export interface HestiaProfile {
  id: string;
  name: string;
  base_url: string;
  key_id: string;
}

export interface GitHubProfile {
  username: string | null;
  token_id: string;
}

export interface Profiles {
  ssh: Record<string, SshProfile>;
  coolify: Record<string, CoolifyProfile>;
  hestia: Record<string, HestiaProfile>;
  github: GitHubProfile | null;
}

export interface VpsStats {
  hostname: string | null;
  uptime: string | null;
  load: string | null;
  mem_total_mb: number | null;
  mem_used_mb: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_pct: number | null;
  top_procs: Array<{
    user: string;
    pid: string;
    cpu: string;
    mem: string;
    command: string;
  }>;
}

export interface CoolifySummary {
  apps_total: number;
  apps_running: number;
  services_total: number;
  databases_total: number;
}

export interface HestiaSummary {
  domains_total: number;
  ssl_problems: number;
}

export interface GitHubSummary {
  username: string;
  unread_notifications: number;
  assigned_issues: number;
}

export interface DashboardData {
  vps_stats: VpsStats | null;
  vps_error: string | null;
  coolify_summary: CoolifySummary | null;
  coolify_error: string | null;
  hestia_summary: HestiaSummary | null;
  hestia_error: string | null;
  github_summary: GitHubSummary | null;
  github_error: string | null;
}

export const api = {
  unlockSecrets: () => invoke<void>("unlock_secrets"),
  secretsStatus: () => invoke<boolean>("secrets_status"),
  setSecret: (key: string, value: string) =>
    invoke<void>("set_secret", { key, value }),
  deleteSecret: (key: string) => invoke<void>("delete_secret", { key }),

  getProfiles: () => invoke<Profiles>("get_profiles"),
  saveProfiles: (profiles: Profiles) =>
    invoke<void>("save_profiles", { profiles }),

  upsertSsh: (profile: SshProfile) =>
    invoke<void>("upsert_ssh_profile", { profile }),
  deleteSsh: (id: string) => invoke<void>("delete_ssh_profile", { id }),
  upsertCoolify: (profile: CoolifyProfile) =>
    invoke<void>("upsert_coolify_profile", { profile }),
  deleteCoolify: (id: string) =>
    invoke<void>("delete_coolify_profile", { id }),
  upsertHestia: (profile: HestiaProfile) =>
    invoke<void>("upsert_hestia_profile", { profile }),
  deleteHestia: (id: string) => invoke<void>("delete_hestia_profile", { id }),
  setGithub: (profile: GitHubProfile) =>
    invoke<void>("set_github_profile", { profile }),
  clearGithub: () => invoke<void>("clear_github_profile"),

  testCoolify: (profileId: string) =>
    invoke<unknown>("test_coolify_connection", { profileId }),
  testHestia: (profileId: string) =>
    invoke<string>("test_hestia_connection", { profileId }),
  testGithub: () => invoke<unknown>("test_github_connection"),
  testSsh: (profileId: string) =>
    invoke<string>("test_ssh_connection", { profileId }),

  getDashboard: () => invoke<DashboardData>("get_dashboard_data"),

  coolifyServers: () => invoke<unknown[]>("coolify_servers"),
  coolifyApplications: () => invoke<unknown[]>("coolify_applications"),
  coolifyServices: () => invoke<unknown[]>("coolify_services"),
  coolifyDatabases: () => invoke<unknown[]>("coolify_databases"),
  coolifyApplication: (uuid: string) =>
    invoke<unknown>("coolify_application", { uuid }),
  coolifyApplicationEnvs: (uuid: string) =>
    invoke<unknown[]>("coolify_application_envs", { uuid }),
  coolifyApplicationLogs: (uuid: string, lines: number | null) =>
    invoke<string>("coolify_application_logs", { uuid, lines }),
  coolifyDeploy: (uuid: string, tag: string | null) =>
    invoke<void>("coolify_deploy", { uuid, tag }),

  hestiaWebDomains: () => invoke<unknown[]>("hestia_web_domains"),
  hestiaDnsRecords: (domain: string) =>
    invoke<unknown[]>("hestia_dns_records", { domain }),
  hestiaAddDns: (
    domain: string,
    record: string,
    rtype: string,
    value: string,
    priority: number | null,
  ) =>
    invoke<string>("hestia_add_dns", {
      domain,
      record,
      rtype,
      value,
      priority,
    }),
  hestiaDeleteDns: (
    domain: string,
    record: string,
    rtype: string,
    value: string,
  ) =>
    invoke<string>("hestia_delete_dns", { domain, record, rtype, value }),
  hestiaMailAccounts: (domain: string) =>
    invoke<unknown[]>("hestia_mail_accounts", { domain }),
  hestiaDatabases: () => invoke<unknown[]>("hestia_databases"),

  ghCurrentUser: () => invoke<unknown>("gh_current_user"),
  ghNotifications: () => invoke<unknown[]>("gh_notifications"),
  ghMarkNotificationRead: (threadId: string) =>
    invoke<void>("gh_mark_notification_read", { threadId }),
  ghMarkAllRead: () => invoke<void>("gh_mark_all_read"),
  ghAssignedIssues: () => invoke<unknown[]>("gh_assigned_issues"),
  ghSearchPrs: () => invoke<unknown[]>("gh_search_prs"),
  ghPullRequest: (owner: string, repo: string, number: number) =>
    invoke<unknown>("gh_pull_request", { owner, repo, number }),
  ghPrFiles: (owner: string, repo: string, number: number) =>
    invoke<unknown[]>("gh_pr_files", { owner, repo, number }),
  ghPrComments: (owner: string, repo: string, number: number) =>
    invoke<unknown[]>("gh_pr_comments", { owner, repo, number }),
  ghPrReviews: (owner: string, repo: string, number: number) =>
    invoke<unknown[]>("gh_pr_reviews", { owner, repo, number }),
  ghCreateReview: (
    owner: string,
    repo: string,
    number: number,
    body: string,
    event: string,
  ) => invoke<void>("gh_create_review", { owner, repo, number, body, event }),
  ghMergePr: (
    owner: string,
    repo: string,
    number: number,
    mergeMethod: string,
  ) => invoke<void>("gh_merge_pr", { owner, repo, number, mergeMethod }),
  ghIssue: (owner: string, repo: string, number: number) =>
    invoke<unknown>("gh_issue", { owner, repo, number }),
  ghIssueComments: (owner: string, repo: string, number: number) =>
    invoke<unknown[]>("gh_issue_comments", { owner, repo, number }),
  ghRepos: () => invoke<unknown[]>("gh_repos"),
  ghRepoTree: (owner: string, repo: string, refName: string) =>
    invoke<unknown[]>("gh_repo_tree", { owner, repo, refName }),
  ghFileContent: (owner: string, repo: string, path: string, refName: string) =>
    invoke<unknown>("gh_file_content", { owner, repo, path, refName }),

  sshOpen: (profileId: string, cols: number, rows: number) =>
    invoke<string>("ssh_open", { profileId, cols, rows }),
  sshWrite: (sessionId: string, data: number[]) =>
    invoke<void>("ssh_write", { sessionId, data }),
  sshResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("ssh_resize", { sessionId, cols, rows }),
  sshDisconnect: (sessionId: string) =>
    invoke<void>("ssh_disconnect", { sessionId }),
  sshExec: (profileId: string, command: string, timeoutSecs: number | null) =>
    invoke<string>("ssh_exec", { profileId, command, timeoutSecs }),
};
