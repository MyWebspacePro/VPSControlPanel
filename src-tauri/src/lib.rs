pub mod coolify;
pub mod dashboard;
pub mod error;
pub mod github;
pub mod hestia;
pub mod secrets;
pub mod ssh;
pub mod state;

use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use crate::state::{AppState, Profiles, *};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

#[tauri::command]
async fn unlock_secrets<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    let state = app.state::<AppState>();
    state.secrets.unlock(&app).await
}

#[tauri::command]
async fn secrets_status<R: Runtime>(app: AppHandle<R>) -> AppResult<bool> {
    let state = app.state::<AppState>();
    Ok(state.secrets.is_unlocked().await)
}

#[tauri::command]
async fn set_secret<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: String,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    state.secrets.set(&key, &value).await
}

#[tauri::command]
async fn delete_secret<R: Runtime>(app: AppHandle<R>, key: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    state.secrets.delete(&key).await
}

#[tauri::command]
async fn get_profiles<R: Runtime>(app: AppHandle<R>) -> AppResult<Profiles> {
    let state = app.state::<AppState>();
    let profiles = state.profiles.read().await.clone();
    Ok(profiles)
}

#[tauri::command]
async fn save_profiles<R: Runtime>(app: AppHandle<R>, profiles: Profiles) -> AppResult<()> {
    let state = app.state::<AppState>();
    *state.profiles.write().await = profiles;
    Ok(())
}

#[tauri::command]
async fn upsert_ssh_profile<R: Runtime>(app: AppHandle<R>, profile: SshProfile) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.ssh.insert(profile.id.clone(), profile);
    Ok(())
}

#[tauri::command]
async fn delete_ssh_profile<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.ssh.remove(&id);
    Ok(())
}

#[tauri::command]
async fn upsert_coolify_profile<R: Runtime>(
    app: AppHandle<R>,
    profile: CoolifyProfile,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.coolify.insert(profile.id.clone(), profile);
    Ok(())
}

#[tauri::command]
async fn delete_coolify_profile<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.coolify.remove(&id);
    Ok(())
}

#[tauri::command]
async fn upsert_hestia_profile<R: Runtime>(
    app: AppHandle<R>,
    profile: HestiaProfile,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.hestia.insert(profile.id.clone(), profile);
    Ok(())
}

#[tauri::command]
async fn delete_hestia_profile<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.hestia.remove(&id);
    Ok(())
}

#[tauri::command]
async fn set_github_profile<R: Runtime>(
    app: AppHandle<R>,
    profile: GitHubProfile,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.github = Some(profile);
    Ok(())
}

#[tauri::command]
async fn clear_github_profile<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut p = state.profiles.write().await;
    p.github = None;
    Ok(())
}

#[tauri::command]
async fn test_coolify_connection<R: Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> AppResult<serde_json::Value> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .coolify
        .get(&profile_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("coolify:{profile_id}")))?;
    let client =
        coolify::CoolifyClient::from_profile_id(&state.secrets, &profile.base_url, &profile.token_id)
            .await?;
    client.ping().await
}

#[tauri::command]
async fn test_hestia_connection<R: Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> AppResult<String> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .hestia
        .get(&profile_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("hestia:{profile_id}")))?;
    let client =
        hestia::HestiaClient::from_profile_id(&state.secrets, &profile.base_url, &profile.key_id)
            .await?;
    client.ping().await
}

#[tauri::command]
async fn test_github_connection<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<github::GitHubUser> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .github
        .as_ref()
        .ok_or_else(|| AppError::ProfileNotFound("github".into()))?;
    let client = github::GitHubClient::from_profile_id(&state.secrets, &profile.token_id).await?;
    client.ping().await
}

#[tauri::command]
async fn test_ssh_connection<R: Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> AppResult<String> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .ssh
        .get(&profile_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("ssh:{profile_id}")))?
        .clone();
    drop(p);
    let output = ssh::exec_command(&app, profile, "echo ok-from-vps", 5).await?;
    Ok(output)
}

#[tauri::command]
async fn get_dashboard_data<R: Runtime>(app: AppHandle<R>) -> AppResult<DashboardData> {
    let state = app.state::<AppState>();
    let profiles = state.profiles.read().await.clone();

    let mut vps_stats: Option<dashboard::VpsStats> = None;
    let mut vps_error: Option<String> = None;
    if let Some((_, profile)) = profiles.ssh.iter().next() {
        match dashboard::get_vps_stats(&app, profile.clone()).await {
            Ok(s) => vps_stats = Some(s),
            Err(e) => vps_error = Some(e.to_string()),
        }
    }

    let mut coolify_summary: Option<CoolifySummary> = None;
    let mut coolify_error: Option<String> = None;
    if let Some((_, profile)) = profiles.coolify.iter().next() {
        match coolify::CoolifyClient::from_profile_id(
            &state.secrets,
            &profile.base_url,
            &profile.token_id,
        )
        .await
        {
            Ok(client) => {
                let apps = client.applications().await.ok();
                let services = client.services().await.ok();
                let dbs = client.databases().await.ok();
                let running = apps
                    .as_ref()
                    .map(|v| v.iter().filter(|a| a.status.as_deref() == Some("running")).count())
                    .unwrap_or(0);
                coolify_summary = Some(CoolifySummary {
                    apps_total: apps.as_ref().map(|v| v.len()).unwrap_or(0),
                    apps_running: running,
                    services_total: services.as_ref().map(|v| v.len()).unwrap_or(0),
                    databases_total: dbs.as_ref().map(|v| v.len()).unwrap_or(0),
                });
            }
            Err(e) => coolify_error = Some(e.to_string()),
        }
    }

    let mut hestia_summary: Option<HestiaSummary> = None;
    let mut hestia_error: Option<String> = None;
    if let Some((_, profile)) = profiles.hestia.iter().next() {
        match hestia::HestiaClient::from_profile_id(
            &state.secrets,
            &profile.base_url,
            &profile.key_id,
        )
        .await
        {
            Ok(client) => {
                let domains = client.list_web_domains().await.ok();
                let total = domains.as_ref().map(|v| v.len()).unwrap_or(0);
                let ssl_errors = domains
                    .as_ref()
                    .map(|v| {
                        v.iter()
                            .filter(|d| {
                                d.ssl.as_deref() != Some("Let's Encrypt")
                                    && d.ssl.as_deref() != Some("self-signed")
                                    && d.ssl.is_some()
                            })
                            .count()
                    })
                    .unwrap_or(0);
                hestia_summary = Some(HestiaSummary {
                    domains_total: total,
                    ssl_problems: ssl_errors,
                });
            }
            Err(e) => hestia_error = Some(e.to_string()),
        }
    }

    let mut github_summary: Option<GitHubSummary> = None;
    let mut github_error: Option<String> = None;
    if let Some(profile) = profiles.github.as_ref() {
        match github::GitHubClient::from_profile_id(&state.secrets, &profile.token_id).await {
            Ok(client) => {
                let user = client.ping().await.ok();
                let notifications = client.notifications().await.ok();
                let issues = client.assigned_issues().await.ok();
                github_summary = Some(GitHubSummary {
                    username: user.map(|u| u.login).unwrap_or_default(),
                    unread_notifications: notifications
                        .as_ref()
                        .map(|v| v.iter().filter(|n| n.unread).count())
                        .unwrap_or(0),
                    assigned_issues: issues.as_ref().map(|v| v.len()).unwrap_or(0),
                });
            }
            Err(e) => github_error = Some(e.to_string()),
        }
    }

    Ok(DashboardData {
        vps_stats,
        vps_error,
        coolify_summary,
        coolify_error,
        hestia_summary,
        hestia_error,
        github_summary,
        github_error,
    })
}

#[derive(serde::Serialize, Clone)]
pub struct DashboardData {
    pub vps_stats: Option<dashboard::VpsStats>,
    pub vps_error: Option<String>,
    pub coolify_summary: Option<CoolifySummary>,
    pub coolify_error: Option<String>,
    pub hestia_summary: Option<HestiaSummary>,
    pub hestia_error: Option<String>,
    pub github_summary: Option<GitHubSummary>,
    pub github_error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct CoolifySummary {
    pub apps_total: usize,
    pub apps_running: usize,
    pub services_total: usize,
    pub databases_total: usize,
}

#[derive(serde::Serialize, Clone)]
pub struct HestiaSummary {
    pub domains_total: usize,
    pub ssl_problems: usize,
}

#[derive(serde::Serialize, Clone)]
pub struct GitHubSummary {
    pub username: String,
    pub unread_notifications: usize,
    pub assigned_issues: usize,
}

#[tauri::command]
async fn coolify_servers<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<coolify::Server>> {
    let client = coolify_client(&app).await?;
    client.servers().await
}

#[tauri::command]
async fn coolify_applications<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<coolify::Application>> {
    let client = coolify_client(&app).await?;
    client.applications().await
}

#[tauri::command]
async fn coolify_services<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<coolify::Service>> {
    let client = coolify_client(&app).await?;
    client.services().await
}

#[tauri::command]
async fn coolify_databases<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<coolify::Database>> {
    let client = coolify_client(&app).await?;
    client.databases().await
}

#[tauri::command]
async fn coolify_application<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
) -> AppResult<coolify::Application> {
    let client = coolify_client(&app).await?;
    client.application(&uuid).await
}

#[tauri::command]
async fn coolify_application_envs<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
) -> AppResult<Vec<coolify::EnvVar>> {
    let client = coolify_client(&app).await?;
    client.application_envs(&uuid).await
}

#[tauri::command]
async fn coolify_application_logs<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
    lines: Option<u32>,
) -> AppResult<String> {
    let client = coolify_client(&app).await?;
    client.application_logs(&uuid, lines).await
}

#[tauri::command]
async fn coolify_deploy<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
    tag: Option<String>,
) -> AppResult<()> {
    let client = coolify_client(&app).await?;
    client.deploy_application(&uuid, tag.as_deref()).await
}

async fn coolify_client<R: Runtime>(app: &AppHandle<R>) -> AppResult<coolify::CoolifyClient> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .coolify
        .values()
        .next()
        .ok_or_else(|| AppError::ProfileNotFound("no coolify profile".into()))?;
    coolify::CoolifyClient::from_profile_id(&state.secrets, &profile.base_url, &profile.token_id)
        .await
}

#[tauri::command]
async fn hestia_web_domains<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<hestia::WebDomain>> {
    let client = hestia_client(&app).await?;
    client.list_web_domains().await
}

#[tauri::command]
async fn hestia_dns_records<R: Runtime>(
    app: AppHandle<R>,
    domain: String,
) -> AppResult<Vec<hestia::DnsRecord>> {
    let client = hestia_client(&app).await?;
    client.list_dns_records(&domain).await
}

#[tauri::command]
async fn hestia_add_dns<R: Runtime>(
    app: AppHandle<R>,
    domain: String,
    record: String,
    rtype: String,
    value: String,
    priority: Option<u16>,
) -> AppResult<String> {
    let client = hestia_client(&app).await?;
    client
        .add_dns_record(&domain, &record, &rtype, &value, priority)
        .await
}

#[tauri::command]
async fn hestia_delete_dns<R: Runtime>(
    app: AppHandle<R>,
    domain: String,
    record: String,
    rtype: String,
    value: String,
) -> AppResult<String> {
    let client = hestia_client(&app).await?;
    client.delete_dns_record(&domain, &record, &rtype, &value).await
}

#[tauri::command]
async fn hestia_mail_accounts<R: Runtime>(
    app: AppHandle<R>,
    domain: String,
) -> AppResult<Vec<hestia::MailAccount>> {
    let client = hestia_client(&app).await?;
    client.list_mail_accounts(&domain).await
}

#[tauri::command]
async fn hestia_databases<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<Vec<hestia::HestiaDatabase>> {
    let client = hestia_client(&app).await?;
    client.list_databases().await
}

async fn hestia_client<R: Runtime>(app: &AppHandle<R>) -> AppResult<hestia::HestiaClient> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .hestia
        .values()
        .next()
        .ok_or_else(|| AppError::ProfileNotFound("no hestia profile".into()))?;
    hestia::HestiaClient::from_profile_id(&state.secrets, &profile.base_url, &profile.key_id)
        .await
}

#[tauri::command]
async fn gh_current_user<R: Runtime>(app: AppHandle<R>) -> AppResult<github::GitHubUser> {
    let client = gh_client(&app).await?;
    client.current_user().await
}

#[tauri::command]
async fn gh_notifications<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<github::Notification>> {
    let client = gh_client(&app).await?;
    client.notifications().await
}

#[tauri::command]
async fn gh_mark_notification_read<R: Runtime>(
    app: AppHandle<R>,
    thread_id: String,
) -> AppResult<()> {
    let client = gh_client(&app).await?;
    client.mark_notification_read(&thread_id).await
}

#[tauri::command]
async fn gh_mark_all_read<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    let client = gh_client(&app).await?;
    client.mark_all_notifications_read().await
}

#[tauri::command]
async fn gh_assigned_issues<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<github::Issue>> {
    let client = gh_client(&app).await?;
    client.assigned_issues().await
}

#[tauri::command]
async fn gh_search_prs<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<Vec<github::PullRequestSummary>> {
    let client = gh_client(&app).await?;
    client.search_prs_inbox().await
}

#[tauri::command]
async fn gh_pull_request<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<github::PullRequest> {
    let client = gh_client(&app).await?;
    client.pull_request(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_pr_files<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<Vec<github::PrFile>> {
    let client = gh_client(&app).await?;
    client.pr_files(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_pr_comments<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<Vec<github::PrComment>> {
    let client = gh_client(&app).await?;
    client.pr_comments(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_pr_reviews<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<Vec<github::PrReview>> {
    let client = gh_client(&app).await?;
    client.pr_reviews(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_create_review<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
    body: String,
    event: String,
) -> AppResult<()> {
    let client = gh_client(&app).await?;
    client
        .create_review(&owner, &repo, number, &body, &event)
        .await
}

#[tauri::command]
async fn gh_merge_pr<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
    merge_method: String,
) -> AppResult<()> {
    let client = gh_client(&app).await?;
    client.merge_pr(&owner, &repo, number, &merge_method).await
}

#[tauri::command]
async fn gh_issue<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<github::IssueFull> {
    let client = gh_client(&app).await?;
    client.issue(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_issue_comments<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<Vec<github::PrComment>> {
    let client = gh_client(&app).await?;
    client.issue_comments(&owner, &repo, number).await
}

#[tauri::command]
async fn gh_repos<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<github::Repo>> {
    let client = gh_client(&app).await?;
    client.repos().await
}

#[tauri::command]
async fn gh_repo_tree<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    ref_name: String,
) -> AppResult<Vec<github::RepoContent>> {
    let client = gh_client(&app).await?;
    client.repo_tree(&owner, &repo, &ref_name).await
}

#[tauri::command]
async fn gh_file_content<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    repo: String,
    path: String,
    ref_name: String,
) -> AppResult<github::FileContent> {
    let client = gh_client(&app).await?;
    client.file_content(&owner, &repo, &path, &ref_name).await
}

async fn gh_client<R: Runtime>(app: &AppHandle<R>) -> AppResult<github::GitHubClient> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .github
        .as_ref()
        .ok_or_else(|| AppError::ProfileNotFound("no github profile".into()))?;
    github::GitHubClient::from_profile_id(&state.secrets, &profile.token_id).await
}

#[tauri::command]
async fn ssh_open<R: Runtime>(
    app: AppHandle<R>,
    profile_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<String> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .ssh
        .get(&profile_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("ssh:{profile_id}")))?
        .clone();
    drop(p);

    let session_id = Uuid::new_v4().to_string();
    let handle = ssh::open_session(&app, session_id.clone(), profile, cols, rows).await?;
    state
        .ssh_sessions
        .write()
        .await
        .insert(session_id.clone(), handle);
    Ok(session_id)
}

#[tauri::command]
async fn ssh_write<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let sessions = state.ssh_sessions.read().await;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("session:{session_id}")))?;
    handle.write(&data).await
}

#[tauri::command]
async fn ssh_resize<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let sessions = state.ssh_sessions.read().await;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("session:{session_id}")))?;
    handle.resize(cols, rows).await
}

#[tauri::command]
async fn ssh_disconnect<R: Runtime>(app: AppHandle<R>, session_id: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut sessions = state.ssh_sessions.write().await;
    if let Some(handle) = sessions.remove(&session_id) {
        let _ = handle.disconnect().await;
    }
    Ok(())
}

#[tauri::command]
async fn ssh_exec<R: Runtime>(
    app: AppHandle<R>,
    profile_id: String,
    command: String,
    timeout_secs: Option<u64>,
) -> AppResult<String> {
    let state = app.state::<AppState>();
    let p = state.profiles.read().await;
    let profile = p
        .ssh
        .get(&profile_id)
        .ok_or_else(|| AppError::ProfileNotFound(format!("ssh:{profile_id}")))?
        .clone();
    drop(p);
    ssh::exec_command(&app, profile, &command, timeout_secs.unwrap_or(5)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|_pw| Vec::new()).build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let secrets = tauri::async_runtime::block_on(async {
                let store = SecretsStore::new(&app_handle).await?;
                store.unlock(&app_handle).await?;
                AppResult::Ok(Arc::new(store))
            })?;
            app.manage(AppState::new(secrets));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            unlock_secrets,
            secrets_status,
            set_secret,
            delete_secret,
            get_profiles,
            save_profiles,
            upsert_ssh_profile,
            delete_ssh_profile,
            upsert_coolify_profile,
            delete_coolify_profile,
            upsert_hestia_profile,
            delete_hestia_profile,
            set_github_profile,
            clear_github_profile,
            test_coolify_connection,
            test_hestia_connection,
            test_github_connection,
            test_ssh_connection,
            get_dashboard_data,
            coolify_servers,
            coolify_applications,
            coolify_services,
            coolify_databases,
            coolify_application,
            coolify_application_envs,
            coolify_application_logs,
            coolify_deploy,
            hestia_web_domains,
            hestia_dns_records,
            hestia_add_dns,
            hestia_delete_dns,
            hestia_mail_accounts,
            hestia_databases,
            gh_current_user,
            gh_notifications,
            gh_mark_notification_read,
            gh_mark_all_read,
            gh_assigned_issues,
            gh_search_prs,
            gh_pull_request,
            gh_pr_files,
            gh_pr_comments,
            gh_pr_reviews,
            gh_create_review,
            gh_merge_pr,
            gh_issue,
            gh_issue_comments,
            gh_repos,
            gh_repo_tree,
            gh_file_content,
            ssh_open,
            ssh_write,
            ssh_resize,
            ssh_disconnect,
            ssh_exec,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
