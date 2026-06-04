use crate::error::{AppError, AppResult};
use iota_stronghold::ClientError as InnerClientError;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_stronghold::stronghold::Stronghold as TauriStronghold;
use tokio::sync::RwLock;

const STRONGHOLD_PASSWORD_SALT_FILE: &str = ".salt";
const STRONGHOLD_FILE: &str = "vault.hold";
const CLIENT_PATH: &[u8] = b"vps-control-panel-client";

pub struct SecretsStore {
    pub stronghold: Arc<RwLock<Option<TauriStronghold>>>,
    pub app_data_dir: PathBuf,
}

impl SecretsStore {
    pub async fn new<R: Runtime>(app: &AppHandle<R>) -> AppResult<Self> {
        let dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e| AppError::Other(format!("resolve app data dir: {e}")))?;
        fs::create_dir_all(&dir)?;
        Ok(Self {
            stronghold: Arc::new(RwLock::new(None)),
            app_data_dir: dir,
        })
    }

    pub async fn unlock<R: Runtime>(&self, _app: &AppHandle<R>) -> AppResult<()> {
        let salt_path = self.app_data_dir.join(STRONGHOLD_PASSWORD_SALT_FILE);
        if !salt_path.exists() {
            let salt = random_salt();
            fs::write(&salt_path, &salt)?;
        }
        let salt = fs::read(&salt_path)?;
        let password = derive_password(&salt, b"vps-control-panel-vault");

        let vault_path = self.app_data_dir.join(STRONGHOLD_FILE);
        let stronghold = TauriStronghold::new(&vault_path, password)
            .map_err(|e| AppError::Stronghold(format!("open: {e}")))?;

        // `Stronghold::new` already called `load_snapshot` if the file exists.
        // After that, the snapshot data is in memory but the client HashMap is
        // empty. We must use `load_client` to bring the persisted client into
        // the HashMap (errors with `ClientDataNotPresent` on first run, when
        // there is no client in the snapshot yet).
        let ensure_result: Result<(), String> = (|| {
            let inner = stronghold.inner();
            match inner.load_client(CLIENT_PATH) {
                Ok(_) => Ok(()),
                Err(InnerClientError::ClientDataNotPresent) => {
                    inner
                        .create_client(CLIENT_PATH)
                        .map_err(|e| format!("create client: {e}"))?;
                    Ok(())
                }
                Err(InnerClientError::ClientAlreadyLoaded(_)) => Ok(()),
                Err(e) => Err(format!("load client: {e}")),
            }
        })();
        ensure_result.map_err(AppError::Stronghold)?;

        stronghold
            .save()
            .map_err(|e| AppError::Stronghold(format!("save: {e}")))?;

        *self.stronghold.write().await = Some(stronghold);
        Ok(())
    }

    pub async fn is_unlocked(&self) -> bool {
        self.stronghold.read().await.is_some()
    }

    pub async fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let key = key.to_string();
        let value = value.to_string();
        let stronghold = self.stronghold.clone();
        let result = tokio::task::spawn_blocking(move || -> AppResult<()> {
            let guard = stronghold.blocking_read();
            let sh = guard
                .as_ref()
                .ok_or_else(|| AppError::Stronghold("vault locked".into()))?;
            // Use `get_client` here: the client is already in the HashMap from
            // `unlock()`. Calling `load_client` would error with
            // `ClientAlreadyLoaded`.
            let client = sh
                .inner()
                .get_client(CLIENT_PATH)
                .map_err(|e| AppError::Stronghold(format!("get client: {e}")))?;
            let store = client.store();
            store
                .insert(key.into_bytes(), value.into_bytes(), None)
                .map_err(|e| AppError::Stronghold(format!("insert: {e}")))?;
            sh.save()
                .map_err(|e| AppError::Stronghold(format!("save: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::Other(format!("blocking task: {e}")))??;
        Ok(result)
    }

    pub async fn get(&self, key: &str) -> AppResult<Option<String>> {
        let key = key.to_string();
        let stronghold = self.stronghold.clone();
        let result: AppResult<Option<String>> =
            tokio::task::spawn_blocking(move || -> AppResult<Option<String>> {
                let guard = stronghold.blocking_read();
                let sh = guard
                    .as_ref()
                    .ok_or_else(|| AppError::Stronghold("vault locked".into()))?;
                let client = sh
                    .inner()
                    .get_client(CLIENT_PATH)
                    .map_err(|e| AppError::Stronghold(format!("get client: {e}")))?;
                let store = client.store();
                let bytes = store
                    .get(&key.into_bytes())
                    .map_err(|e| AppError::Stronghold(format!("get: {e}")))?;
                Ok(bytes.map(|b| String::from_utf8_lossy(&b).to_string()))
            })
            .await
            .map_err(|e| AppError::Other(format!("blocking task: {e}")))?;
        result
    }

    pub async fn delete(&self, key: &str) -> AppResult<()> {
        let key = key.to_string();
        let stronghold = self.stronghold.clone();
        let _ = tokio::task::spawn_blocking(move || -> AppResult<()> {
            let guard = stronghold.blocking_read();
            let sh = guard
                .as_ref()
                .ok_or_else(|| AppError::Stronghold("vault locked".into()))?;
            let client = sh
                .inner()
                .get_client(CLIENT_PATH)
                .map_err(|e| AppError::Stronghold(format!("get client: {e}")))?;
            let store = client.store();
            let _ = store.delete(&key.into_bytes());
            let _ = sh.save();
            Ok(())
        })
        .await
        .map_err(|e| AppError::Other(format!("blocking task: {e}")))?;
        Ok(())
    }
}

fn random_salt() -> [u8; 32] {
    use rand::RngCore;
    let mut s = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut s);
    s
}

fn derive_password(salt: &[u8], context: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(context);
    hasher.finalize().to_vec()
}
