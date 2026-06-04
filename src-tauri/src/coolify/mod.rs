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
