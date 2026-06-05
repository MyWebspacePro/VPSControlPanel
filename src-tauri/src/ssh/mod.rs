use crate::error::{AppError, AppResult};
use crate::state::SshProfile;
use russh::client::{self, Handle, Msg};
use russh::keys::{self as rkeys, PrivateKey, PrivateKeyWithHashAlg};
use russh::Channel;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::AsyncReadExt;
use tokio::sync::{mpsc, Mutex};

const OUTPUT_BUFFER_MAX: usize = 1024 * 1024; // 1 MB cap per session

#[derive(Clone)]
pub struct SshHandle {
    pub session_id: String,
    pub profile_id: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    pub output_buffer: Arc<Mutex<Vec<u8>>>,
    inner: Arc<SshInner>,
}

struct SshInner {
    cmd_tx: mpsc::UnboundedSender<SshCommand>,
    connected: Arc<Mutex<bool>>,
}

enum SshCommand {
    Write(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Disconnect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshSessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub user: String,
    pub host: String,
    pub port: u16,
}

impl SshHandle {
    pub async fn is_connected(&self) -> bool {
        *self.inner.connected.lock().await
    }

    pub async fn write(&self, data: &[u8]) -> AppResult<()> {
        self.inner
            .cmd_tx
            .send(SshCommand::Write(data.to_vec()))
            .map_err(|e| AppError::Other(format!("send write: {e}")))?;
        Ok(())
    }

    pub async fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        self.inner
            .cmd_tx
            .send(SshCommand::Resize { cols, rows })
            .map_err(|e| AppError::Other(format!("send resize: {e}")))?;
        Ok(())
    }

    pub async fn disconnect(&self) -> AppResult<()> {
        let _ = self.inner.cmd_tx.send(SshCommand::Disconnect);
        *self.inner.connected.lock().await = false;
        Ok(())
    }

    /// Read the buffered output, draining the buffer.
    pub async fn drain_output(&self) -> Vec<u8> {
        let mut buf = self.output_buffer.lock().await;
        std::mem::take(&mut *buf)
    }
}

pub async fn open_session<R: Runtime>(
    app: &AppHandle<R>,
    session_id: String,
    profile: SshProfile,
    initial_cols: u16,
    initial_rows: u16,
) -> AppResult<SshHandle> {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<SshCommand>();
    let output_buffer: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let inner = Arc::new(SshInner {
        cmd_tx: cmd_tx.clone(),
        connected: Arc::new(Mutex::new(false)),
    });
    let handle = SshHandle {
        session_id: session_id.clone(),
        profile_id: profile.id.clone(),
        user: profile.user.clone(),
        host: profile.host.clone(),
        port: profile.port,
        output_buffer: output_buffer.clone(),
        inner: inner.clone(),
    };

    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let inner_clone = inner.clone();
    let output_buffer_clone = output_buffer.clone();

    tokio::spawn(async move {
        if let Err(e) = run_session(
            app_clone,
            session_id_clone,
            profile,
            initial_cols,
            initial_rows,
            cmd_rx,
            inner_clone,
            output_buffer_clone,
        )
        .await
        {
            tracing::error!("ssh session error: {e:#}");
        }
    });

    Ok(handle)
}

pub async fn exec_command<R: Runtime>(
    app: &AppHandle<R>,
    profile: SshProfile,
    command: &str,
    timeout_secs: u64,
) -> AppResult<String> {
    let (sh, channel) = open_channel(app, &profile).await?;
    let ch: Channel<Msg> = channel;
    ch.exec(true, command)
        .await
        .map_err(|e| AppError::Ssh(format!("exec: {e}")))?;

    let mut output = String::new();
    let mut buf = vec![0u8; 4096];
    let mut stream = ch.into_stream();
    let deadline = tokio::time::Duration::from_secs(timeout_secs);

    let result = tokio::time::timeout(deadline, async {
        loop {
            match stream.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    output.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
                Err(e) => {
                    return Err(AppError::Ssh(format!("read: {e}")));
                }
            }
        }
        Ok::<(), AppError>(())
    })
    .await;

    let _ = sh
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;
    match result {
        Ok(inner) => {
            inner?;
            Ok(output)
        }
        Err(_) => Err(AppError::Ssh(format!(
            "exec timeout after {timeout_secs}s"
        ))),
    }
}

async fn open_channel<R: Runtime>(
    app: &AppHandle<R>,
    profile: &SshProfile,
) -> AppResult<(Handle<SshHandler>, Channel<Msg>)> {
    let config = Arc::new(client::Config::default());
    let mut sh: Handle<SshHandler> = client::connect(
        config,
        (profile.host.as_str(), profile.port),
        SshHandler,
    )
    .await
    .map_err(|e| AppError::Ssh(format!("connect: {e}")))?;

    let auth_result = match &profile.auth_method {
        crate::state::SshAuthMethod::KeyFile { path } => {
            let key = load_key(Path::new(path))?;
            let wrapped = PrivateKeyWithHashAlg::new(Arc::new(key), None);
            sh.authenticate_publickey(&profile.user, wrapped).await
        }
        crate::state::SshAuthMethod::KeyContent { key_id } => {
            let key_str = crate::state::read_secret_key(app, key_id).await?;
            let key = parse_private_key(&key_str)?;
            let wrapped = PrivateKeyWithHashAlg::new(Arc::new(key), None);
            sh.authenticate_publickey(&profile.user, wrapped).await
        }
        crate::state::SshAuthMethod::Password { password_id } => {
            let pw = crate::state::read_secret_key(app, password_id).await?;
            sh.authenticate_password(&profile.user, &pw).await
        }
        crate::state::SshAuthMethod::Agent => {
            return Err(AppError::Ssh(
                "SSH-Agent wird auf dieser Plattform noch nicht unterstützt".into(),
            ));
        }
    }
    .map_err(|e| AppError::Ssh(format!("auth: {e}")))?;

    if !auth_result.success() {
        return Err(AppError::Ssh("Authentifizierung fehlgeschlagen".into()));
    }

    let channel = sh
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("channel: {e}")))?;
    Ok((sh, channel))
}

async fn run_session<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    profile: SshProfile,
    cols: u16,
    rows: u16,
    mut cmd_rx: mpsc::UnboundedReceiver<SshCommand>,
    inner: Arc<SshInner>,
    output_buffer: Arc<Mutex<Vec<u8>>>,
) -> AppResult<()> {
    emit_status(&app, &session_id, "connecting");

    let (_sh, channel) = match open_channel(&app, &profile).await {
        Ok(v) => v,
        Err(e) => {
            emit_status(&app, &session_id, &format!("error: {e}"));
            return Err(e);
        }
    };

    channel
        .request_pty(true, "xterm-256color", cols.into(), rows.into(), 0, 0, &[])
        .await
        .map_err(|e| AppError::Ssh(format!("pty: {e}")))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| AppError::Ssh(format!("shell: {e}")))?;

    *inner.connected.lock().await = true;
    emit_status(&app, &session_id, "connected");

    let (mut read_half, write_half) = channel.split();
    let mut data_buf = vec![0u8; 4096];

    loop {
        let mut reader = read_half.make_reader();
        tokio::select! {
            biased;
            cmd = cmd_rx.recv() => {
                let Some(cmd) = cmd else { break };
                match cmd {
                    SshCommand::Write(data) => {
                        use tokio::io::AsyncWriteExt;
                        let mut writer = write_half.make_writer();
                        if let Err(e) = writer.write_all(&data).await {
                            emit_status(&app, &session_id, &format!("write error: {e}"));
                            break;
                        }
                        if let Err(e) = writer.flush().await {
                            tracing::warn!("flush: {e}");
                        }
                    }
                    SshCommand::Resize { cols, rows } => {
                        if let Err(e) = write_half.window_change(cols.into(), rows.into(), 0, 0).await {
                            tracing::warn!("resize: {e}");
                        }
                    }
                    SshCommand::Disconnect => break,
                }
            }
            read = reader.read(&mut data_buf) => {
                match read {
                    Ok(0) => break,
                    Ok(n) => {
                        // Append to ring buffer (capped at OUTPUT_BUFFER_MAX)
                        {
                            let mut buf = output_buffer.lock().await;
                            buf.extend_from_slice(&data_buf[..n]);
                            if buf.len() > OUTPUT_BUFFER_MAX {
                                let drop_n = buf.len() - OUTPUT_BUFFER_MAX;
                                buf.drain(..drop_n);
                            }
                        }
                        let payload = data_buf[..n].to_vec();
                        let _ = app.emit("ssh://data", SshDataPayload {
                            session_id: session_id.clone(),
                            data: payload,
                        });
                    }
                    Err(e) => {
                        emit_status(&app, &session_id, &format!("read error: {e}"));
                        break;
                    }
                }
            }
        }
    }

    let _ = write_half.close().await;
    *inner.connected.lock().await = false;
    emit_status(&app, &session_id, "disconnected");
    Ok(())
}

fn load_key(path: &Path) -> AppResult<PrivateKey> {
    rkeys::load_secret_key(path, None).map_err(|e| AppError::Ssh(format!("load key {path:?}: {e}")))
}

fn parse_private_key(s: &str) -> AppResult<PrivateKey> {
    rkeys::decode_secret_key(s, None).map_err(|e| AppError::Ssh(format!("parse key: {e}")))
}

fn emit_status<R: Runtime>(app: &AppHandle<R>, session_id: &str, status: &str) {
    let _ = app.emit(
        "ssh://status",
        SshStatusPayload {
            session_id: session_id.to_string(),
            status: status.to_string(),
        },
    );
}

#[derive(serde::Serialize, Clone)]
pub struct SshDataPayload {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(serde::Serialize, Clone)]
pub struct SshStatusPayload {
    pub session_id: String,
    pub status: String,
}

pub struct SshHandler;

impl client::Handler for SshHandler {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        async move { Ok(true) }
    }
}
