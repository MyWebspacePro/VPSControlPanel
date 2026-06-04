use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use serde::{Deserialize, Serialize};

pub struct CoolifyClient {
    pub base_url: String,
    pub token: String,
    pub http: reqwest::Client,
}

impl CoolifyClient {
    pub fn new(base_url: String, token: String) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent("VPSControlPanel/0.1")
            .build()?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
            http,
        })
    }

    pub async fn from_profile_id(
        store: &SecretsStore,
        base_url: &str,
        token_id: &str,
    ) -> AppResult<Self> {
        let token = store
            .get(token_id)
            .await?
            .ok_or_else(|| AppError::ProfileNotFound(format!("token '{token_id}'")))?;
        Self::new(base_url.to_string(), token)
    }

    async fn request<T: for<'de> Deserialize<'de>>(
        &self,
        method: reqwest::Method,
        path: &str,
    ) -> AppResult<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .request(method, &url)
            .bearer_auth(&self.token)
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
        Ok(resp.json().await?)
    }

    async fn request_body<Req: Serialize, T: for<'de> Deserialize<'de>>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: &Req,
    ) -> AppResult<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .request(method, &url)
            .bearer_auth(&self.token)
            .json(body)
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
        Ok(resp.json().await?)
    }

    pub async fn projects(&self) -> AppResult<Vec<serde_json::Value>> {
        self.request(reqwest::Method::GET, "/api/v1/projects").await
    }

    pub async fn project_environments(&self, project_uuid: &str) -> AppResult<Vec<serde_json::Value>> {
        let path = format!("/api/v1/projects/{project_uuid}/environments");
        self.request(reqwest::Method::GET, &path).await
    }

    pub async fn create_application_public(
        &self,
        body: serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        self.request_body(
            reqwest::Method::POST,
            "/api/v1/applications/public",
            &body,
        )
        .await
    }

    pub async fn delete_application(
        &self,
        uuid: &str,
        delete_volumes: bool,
    ) -> AppResult<String> {
        let path = format!(
            "/api/v1/applications/{uuid}?delete_volumes={delete_volumes}"
        );
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn add_application_env(
        &self,
        uuid: &str,
        key: &str,
        value: &str,
        is_literal: bool,
        is_multiline: bool,
        is_shown_once: bool,
    ) -> AppResult<serde_json::Value> {
        let body = serde_json::json!({
            "key": key,
            "value": value,
            "is_literal": is_literal,
            "is_multiline": is_multiline,
            "is_shown_once": is_shown_once,
        });
        let path = format!("/api/v1/applications/{uuid}/envs");
        self.request_body(reqwest::Method::POST, &path, &body).await
    }

    pub async fn update_application_env(
        &self,
        uuid: &str,
        key: &str,
        value: &str,
        is_literal: bool,
        is_multiline: bool,
        is_shown_once: bool,
    ) -> AppResult<serde_json::Value> {
        let body = serde_json::json!({
            "key": key,
            "value": value,
            "is_literal": is_literal,
            "is_multiline": is_multiline,
            "is_shown_once": is_shown_once,
        });
        let path = format!("/api/v1/applications/{uuid}/envs");
        self.request_body(reqwest::Method::PATCH, &path, &body).await
    }

    pub async fn delete_application_env(
        &self,
        uuid: &str,
        env_uuid: &str,
    ) -> AppResult<String> {
        let path = format!("/api/v1/applications/{uuid}/envs/{env_uuid}");
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn create_postgres(
        &self,
        body: serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        self.request_body(
            reqwest::Method::POST,
            "/api/v1/databases/postgresql",
            &body,
        )
        .await
    }

    pub async fn delete_database(&self, uuid: &str) -> AppResult<String> {
        let path = format!("/api/v1/databases/{uuid}");
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn start_database(&self, uuid: &str) -> AppResult<String> {
        self.app_action_db(uuid, "start").await
    }

    pub async fn stop_database(&self, uuid: &str) -> AppResult<String> {
        self.app_action_db(uuid, "stop").await
    }

    pub async fn restart_database(&self, uuid: &str) -> AppResult<String> {
        self.app_action_db(uuid, "restart").await
    }

    async fn app_action_db(&self, uuid: &str, action: &str) -> AppResult<String> {
        let url = format!(
            "{}/api/v1/databases/{uuid}/{action}",
            self.base_url
        );
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn ping(&self) -> AppResult<serde_json::Value> {
        self.request(reqwest::Method::GET, "/api/v1/servers").await
    }

    pub async fn servers(&self) -> AppResult<Vec<Server>> {
        self.request(reqwest::Method::GET, "/api/v1/servers").await
    }

    pub async fn applications(&self) -> AppResult<Vec<Application>> {
        self.request(reqwest::Method::GET, "/api/v1/applications").await
    }

    pub async fn services(&self) -> AppResult<Vec<Service>> {
        self.request(reqwest::Method::GET, "/api/v1/services").await
    }

    pub async fn databases(&self) -> AppResult<Vec<Database>> {
        self.request(reqwest::Method::GET, "/api/v1/databases").await
    }

    pub async fn application(&self, uuid: &str) -> AppResult<Application> {
        self.request(reqwest::Method::GET, &format!("/api/v1/applications/{uuid}"))
            .await
    }

    pub async fn deploy_application(&self, uuid: &str, tag: Option<&str>) -> AppResult<()> {
        let path = match tag {
            Some(t) => format!("/api/v1/applications/{uuid}/deploy?tag={t}"),
            None => format!("/api/v1/applications/{uuid}/deploy"),
        };
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
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

    async fn app_action(&self, uuid: &str, action: &str) -> AppResult<String> {
        let url = format!(
            "{}/api/v1/applications/{uuid}/{action}",
            self.base_url
        );
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn start_application(&self, uuid: &str) -> AppResult<String> {
        self.app_action(uuid, "start").await
    }

    pub async fn stop_application(&self, uuid: &str) -> AppResult<String> {
        self.app_action(uuid, "stop").await
    }

    pub async fn restart_application(&self, uuid: &str) -> AppResult<String> {
        self.app_action(uuid, "restart").await
    }

    async fn service_action(&self, uuid: &str, action: &str) -> AppResult<String> {
        let url = format!(
            "{}/api/v1/services/{uuid}/{action}",
            self.base_url
        );
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Api {
                status: status.as_u16(),
                message: text,
            });
        }
        Ok(text)
    }

    pub async fn start_service(&self, uuid: &str) -> AppResult<String> {
        self.service_action(uuid, "start").await
    }

    pub async fn stop_service(&self, uuid: &str) -> AppResult<String> {
        self.service_action(uuid, "stop").await
    }

    pub async fn restart_service(&self, uuid: &str) -> AppResult<String> {
        self.service_action(uuid, "restart").await
    }

    pub async fn application_envs(&self, uuid: &str) -> AppResult<Vec<EnvVar>> {
        self.request(
            reqwest::Method::GET,
            &format!("/api/v1/applications/{uuid}/envs"),
        )
        .await
    }

    pub async fn application_logs(
        &self,
        uuid: &str,
        lines: Option<u32>,
    ) -> AppResult<String> {
        let n = lines.unwrap_or(100);
        let path = format!("/api/v1/applications/{uuid}/logs?lines={n}");
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: Option<serde_json::Value>,
    pub name: Option<String>,
    pub ip: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub is_reachable: Option<bool>,
    pub is_usable: Option<bool>,
    #[serde(default)]
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    pub id: Option<serde_json::Value>,
    pub uuid: String,
    pub name: String,
    pub fqdn: Option<String>,
    pub status: Option<String>,
    pub git_repository: Option<String>,
    pub git_branch: Option<String>,
    pub build_pack: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    pub id: Option<serde_json::Value>,
    pub uuid: String,
    pub name: String,
    pub status: Option<String>,
    pub service_type: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Database {
    pub id: Option<serde_json::Value>,
    pub uuid: String,
    pub name: String,
    pub status: Option<String>,
    pub type_: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}
