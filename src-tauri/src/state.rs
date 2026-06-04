use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Profiles {
    #[serde(default)]
    pub ssh: HashMap<String, SshProfile>,
    #[serde(default)]
    pub coolify: HashMap<String, CoolifyProfile>,
    #[serde(default)]
    pub hestia: HashMap<String, HestiaProfile>,
    #[serde(default)]
    pub github: Option<GitHubProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth_method: SshAuthMethod,
    pub default_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuthMethod {
    KeyFile { path: String },
    KeyContent { key_id: String },
    Password { password_id: String },
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoolifyProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub token_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HestiaProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub key_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubProfile {
    pub username: Option<String>,
    pub token_id: String,
}

pub struct AppState {
    pub profiles: Arc<RwLock<Profiles>>,
    pub secrets: Arc<SecretsStore>,
    pub ssh_sessions: Arc<RwLock<HashMap<String, crate::ssh::SshHandle>>>,
}

impl AppState {
    pub fn new(secrets: Arc<SecretsStore>) -> Self {
        Self {
            profiles: Arc::new(RwLock::new(Profiles::default())),
            secrets,
            ssh_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn snapshot_profiles(&self) -> Profiles {
        self.profiles.read().await.clone()
    }
}

pub async fn read_secret_key<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key_id: &str,
) -> AppResult<String> {
    use tauri::Manager;
    let state = app
        .state::<AppState>();
    state
        .secrets
        .get(key_id)
        .await?
        .ok_or_else(|| AppError::ProfileNotFound(format!("key '{key_id}'")))
}
