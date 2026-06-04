use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use serde::{Deserialize, Serialize};

pub struct GitHubClient {
    pub token: String,
    pub http: reqwest::Client,
    pub base: String,
}

impl GitHubClient {
    pub fn new(token: String) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent("VPSControlPanel/0.1")
            .build()?;
        Ok(Self {
            token,
            http,
            base: "https://api.github.com".to_string(),
        })
    }

    pub async fn from_profile_id(store: &SecretsStore, token_id: &str) -> AppResult<Self> {
        let token = store
            .get(token_id)
            .await?
            .ok_or_else(|| AppError::ProfileNotFound(format!("token '{token_id}'")))?;
        Self::new(token)
    }

    async fn gh<T: for<'de> Deserialize<'de>>(
        &self,
        method: reqwest::Method,
        path: &str,
    ) -> AppResult<T> {
        let url = format!("{}{}", self.base, path);
        let resp = self
            .http
            .request(method, &url)
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;
        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED
            || status == reqwest::StatusCode::FORBIDDEN
        {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status: status.as_u16(),
                message: format!("Auth fehlgeschlagen. Bitte PAT prüfen. {text}"),
            });
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(resp.json().await?)
    }

    async fn gh_text(
        &self,
        method: reqwest::Method,
        path: &str,
    ) -> AppResult<String> {
        let url = format!("{}{}", self.base, path);
        let resp = self
            .http
            .request(method, &url)
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(resp.text().await?)
    }

    pub async fn ping(&self) -> AppResult<GitHubUser> {
        self.gh(reqwest::Method::GET, "/user").await
    }

    pub async fn current_user(&self) -> AppResult<GitHubUser> {
        self.gh(reqwest::Method::GET, "/user").await
    }

    pub async fn notifications(&self) -> AppResult<Vec<Notification>> {
        self.gh(reqwest::Method::GET, "/notifications?per_page=50")
            .await
    }

    pub async fn mark_notification_read(&self, thread_id: &str) -> AppResult<()> {
        let _ = self
            .gh_text(
                reqwest::Method::PATCH,
                &format!("/notifications/threads/{thread_id}"),
            )
            .await?;
        Ok(())
    }

    pub async fn mark_all_notifications_read(&self) -> AppResult<()> {
        let _ = self
            .gh_text(reqwest::Method::PUT, "/notifications")
            .await?;
        Ok(())
    }

    pub async fn assigned_issues(&self) -> AppResult<Vec<Issue>> {
        self.gh(
            reqwest::Method::GET,
            "/issues?filter=assigned&state=open&per_page=50",
        )
        .await
    }

    pub async fn search_prs_inbox(&self) -> AppResult<Vec<PullRequestSummary>> {
        let query = "is:open is:pr author:@me OR review-requested:@me OR assignee:@me";
        let encoded = url_encode(query);
        let path = format!("/search/issues?q={encoded}&per_page=50");
        let resp: SearchIssuesResponse = self.gh(reqwest::Method::GET, &path).await?;
        let mut prs = Vec::new();
        for item in resp.items {
            if let Some(url_val) = item.pull_request {
                let url = match &url_val {
                    serde_json::Value::String(s) => s.clone(),
                    _ => continue,
                };
                if let Some(rest) = url.strip_prefix("https://api.github.com/repos/") {
                    let parts: Vec<&str> = rest.split('/').collect();
                    if parts.len() >= 4 {
                        prs.push(PullRequestSummary {
                            owner: parts[0].to_string(),
                            repo: parts[1].to_string(),
                            number: parts[3].parse().unwrap_or(0),
                            title: item.title,
                            state: item.state,
                            user: item.user.map(|u| u.login).unwrap_or_default(),
                            updated_at: item.updated_at.unwrap_or_default(),
                            html_url: item.html_url.unwrap_or_default(),
                        });
                    }
                }
            }
        }
        Ok(prs)
    }

    pub async fn pull_request(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<PullRequest> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/pulls/{number}"),
        )
        .await
    }

    pub async fn pr_files(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<Vec<PrFile>> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/pulls/{number}/files?per_page=100"),
        )
        .await
    }

    pub async fn pr_comments(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<Vec<PrComment>> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/issues/{number}/comments?per_page=50"),
        )
        .await
    }

    pub async fn pr_reviews(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<Vec<PrReview>> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/pulls/{number}/reviews"),
        )
        .await
    }

    pub async fn create_review(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
        body: &str,
        event: &str,
    ) -> AppResult<()> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}/reviews");
        let url = format!("{}{}", self.base, path);
        let payload = serde_json::json!({
            "body": body,
            "event": event,
        });
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&payload)
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(())
    }

    pub async fn merge_pr(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
        merge_method: &str,
    ) -> AppResult<()> {
        let path = format!("/repos/{owner}/{repo}/pulls/{number}/merge");
        let url = format!("{}{}", self.base, path);
        let payload = serde_json::json!({
            "merge_method": merge_method,
        });
        let resp = self
            .http
            .put(&url)
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&payload)
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(())
    }

    pub async fn issue(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<IssueFull> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/issues/{number}"),
        )
        .await
    }

    pub async fn issue_comments(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> AppResult<Vec<PrComment>> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/issues/{number}/comments?per_page=50"),
        )
        .await
    }

    pub async fn repos(&self) -> AppResult<Vec<Repo>> {
        self.gh(reqwest::Method::GET, "/user/repos?per_page=50&sort=updated")
            .await
    }

    pub async fn repo_tree(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
    ) -> AppResult<Vec<RepoContent>> {
        self.gh(
            reqwest::Method::GET,
            &format!("/repos/{owner}/{repo}/contents?ref={ref_name}"),
        )
        .await
    }

    pub async fn file_content(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        ref_name: &str,
    ) -> AppResult<FileContent> {
        self.gh(
            reqwest::Method::GET,
            &format!(
                "/repos/{owner}/{repo}/contents/{}?ref={ref_name}",
                url_encode(path)
            ),
        )
        .await
    }
}

fn url_encode(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
                c.to_string()
            } else {
                format!("%{:02X}", c as u32)
            }
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub html_url: Option<String>,
    #[serde(rename = "type")]
    pub user_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub unread: bool,
    pub reason: Option<String>,
    pub updated_at: Option<String>,
    pub subject: NotificationSubject,
    pub repository: Option<NotificationRepo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSubject {
    pub title: String,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub subject_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationRepo {
    pub full_name: String,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub state: String,
    pub html_url: Option<String>,
    pub updated_at: Option<String>,
    pub user: Option<GhUser>,
    pub repository_url: Option<String>,
    pub pull_request: Option<serde_json::Value>,
    pub labels: Vec<Label>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueFull {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub user: Option<GhUser>,
    pub labels: Vec<Label>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhUser {
    pub login: String,
    pub avatar_url: Option<String>,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestSummary {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub state: String,
    pub user: String,
    pub updated_at: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub merged: Option<bool>,
    pub mergeable: Option<bool>,
    pub html_url: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub head: PrRef,
    pub base: PrRef,
    pub user: Option<GhUser>,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub changed_files: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrRef {
    pub label: String,
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
    pub repo: Option<RepoRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoRef {
    pub full_name: String,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrFile {
    pub filename: String,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub changes: u64,
    pub patch: Option<String>,
    pub previous_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrComment {
    pub id: u64,
    pub body: String,
    pub user: Option<GhUser>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub diff_hunk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrReview {
    pub id: u64,
    pub state: String,
    pub body: Option<String>,
    pub user: Option<GhUser>,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchIssuesResponse {
    pub total_count: u64,
    pub items: Vec<Issue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub description: Option<String>,
    pub html_url: Option<String>,
    pub default_branch: Option<String>,
    pub updated_at: Option<String>,
    pub stargazers_count: Option<u64>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RepoContent {
    File {
        name: String,
        path: String,
        size: u64,
        download_url: Option<String>,
        html_url: Option<String>,
    },
    Dir {
        name: String,
        path: String,
        html_url: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub name: String,
    pub path: String,
    pub size: Option<u64>,
    pub content: Option<String>,
    pub encoding: Option<String>,
    pub html_url: Option<String>,
}
