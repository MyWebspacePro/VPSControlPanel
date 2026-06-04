use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use serde::{Deserialize, Serialize};
use url::form_urlencoded;

pub struct HestiaClient {
    pub base_url: String,
    pub key: String,
    pub http: reqwest::Client,
    pub user: String,
}

impl HestiaClient {
    pub fn new(base_url: String, key: String) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent("VPSControlPanel/0.1")
            .build()?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            key,
            http,
            user: "admin".to_string(),
        })
    }

    pub fn with_user(mut self, user: String) -> Self {
        self.user = user;
        self
    }

    pub async fn from_profile_id(
        store: &SecretsStore,
        base_url: &str,
        key_id: &str,
    ) -> AppResult<Self> {
        let key = store
            .get(key_id)
            .await?
            .ok_or_else(|| AppError::ProfileNotFound(format!("key '{key_id}'")))?;
        Self::new(base_url.to_string(), key)
    }

    fn build_body(&self, cmd: &str, returncode: &str, args: &[&str]) -> String {
        let mut form = form_urlencoded::Serializer::new(String::new());
        form.append_pair("hash", &self.key);
        form.append_pair("cmd", cmd);
        form.append_pair("returncode", returncode);
        for (i, a) in args.iter().enumerate() {
            form.append_pair(&format!("arg{}", i + 1), a);
        }
        form.finish()
    }

    async fn call(&self, cmd: &str, args: &[&str]) -> AppResult<String> {
        let body = self.build_body(cmd, "yes", args);
        let resp = self
            .http
            .post(format!("{}/api/", self.base_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await?;
        let exit: i32 = resp
            .headers()
            .get("Hestia-Exit-Code")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(-1);
        let text = resp.text().await.unwrap_or_default();
        if exit != 0 {
            return Err(AppError::Api {
                status: exit as u16,
                message: text.trim().to_string(),
            });
        }
        Ok(text)
    }

    async fn call_json<T: for<'de> Deserialize<'de>>(
        &self,
        cmd: &str,
        args: &[&str],
    ) -> AppResult<T> {
        let body = self.build_body(cmd, "no", args);
        let resp = self
            .http
            .post(format!("{}/api/", self.base_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await?;
        let exit: i32 = resp
            .headers()
            .get("Hestia-Exit-Code")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(-1);
        let text = resp.text().await.unwrap_or_default();
        if exit != 0 {
            return Err(AppError::Api {
                status: exit as u16,
                message: text.trim().to_string(),
            });
        }
        serde_json::from_str(&text).map_err(|e| {
            AppError::Api {
                status: 0,
                message: format!("Hestia JSON parse: {e}: {text}"),
            }
        })
    }

    pub async fn ping(&self) -> AppResult<String> {
        let resp = self
            .http
            .post(format!("{}/api/", self.base_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(format!("hash={}&cmd=v-list-sys-config&arg1=json", self.key))
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

    pub async fn list_web_domains(&self) -> AppResult<Vec<WebDomain>> {
        let map: std::collections::HashMap<String, WebDomain> = self
            .call_json("v-list-web-domains", &[&self.user, "json"])
            .await?;
        Ok(map.into_values().collect())
    }

    pub async fn add_web_domain(
        &self,
        domain: &str,
        ip: Option<&str>,
        aliases: Option<&str>,
    ) -> AppResult<String> {
        let mut args: Vec<&str> = vec![&self.user, domain];
        if let Some(ip) = ip {
            args.push(ip);
        } else {
            args.push("");
        }
        args.push("yes");
        if let Some(a) = aliases {
            args.push(a);
        }
        self.call("v-add-web-domain", &args).await
    }

    pub async fn delete_web_domain(&self, domain: &str) -> AppResult<String> {
        self.call("v-delete-web-domain", &[&self.user, domain]).await
    }

    pub async fn suspend_web_domain(&self, domain: &str) -> AppResult<String> {
        self.call("v-suspend-web-domain", &[&self.user, domain]).await
    }

    pub async fn unsuspend_web_domain(&self, domain: &str) -> AppResult<String> {
        self.call("v-unsuspend-web-domain", &[&self.user, domain]).await
    }

    pub async fn add_letsencrypt(&self, domain: &str) -> AppResult<String> {
        self.call("v-add-letsencrypt-domain", &[&self.user, domain])
            .await
    }

    pub async fn delete_letsencrypt(&self, domain: &str) -> AppResult<String> {
        self.call("v-delete-letsencrypt-domain", &[&self.user, domain])
            .await
    }

    pub async fn list_mail_accounts(&self, domain: &str) -> AppResult<Vec<MailAccount>> {
        let map: std::collections::HashMap<String, MailAccount> = self
            .call_json("v-list-mail-accounts", &[&self.user, domain, "json"])
            .await?;
        Ok(map.into_values().collect())
    }

    pub async fn list_mail_domains(&self) -> AppResult<Vec<MailDomain>> {
        let map: std::collections::HashMap<String, MailDomain> = self
            .call_json("v-list-mail-domains", &[&self.user, "json"])
            .await?;
        Ok(map.into_values().collect())
    }

    pub async fn add_mail_domain(&self, domain: &str) -> AppResult<String> {
        self.call("v-add-mail-domain", &[&self.user, domain]).await
    }

    pub async fn delete_mail_domain(&self, domain: &str) -> AppResult<String> {
        self.call("v-delete-mail-domain", &[&self.user, domain]).await
    }

    pub async fn add_mail_account(
        &self,
        domain: &str,
        account: &str,
        password: &str,
        quota_mb: Option<u32>,
    ) -> AppResult<String> {
        let q_owned;
        let mut args: Vec<&str> = vec![&self.user, domain, account, password];
        if let Some(q) = quota_mb {
            q_owned = q.to_string();
            args.push(&q_owned);
        }
        self.call("v-add-mail-account", &args).await
    }

    pub async fn delete_mail_account(&self, domain: &str, account: &str) -> AppResult<String> {
        self.call("v-delete-mail-account", &[&self.user, domain, account])
            .await
    }

    pub async fn change_mail_account_password(
        &self,
        domain: &str,
        account: &str,
        new_password: &str,
    ) -> AppResult<String> {
        self.call(
            "v-change-mail-account-password",
            &[&self.user, domain, account, new_password],
        )
        .await
    }

    pub async fn list_dns_records(&self, domain: &str) -> AppResult<Vec<DnsRecord>> {
        let map: std::collections::HashMap<String, DnsRecord> = self
            .call_json("v-list-dns-records", &[&self.user, domain, "json"])
            .await?;
        Ok(map.into_values().collect())
    }

    pub async fn add_dns_record(
        &self,
        domain: &str,
        record: &str,
        rtype: &str,
        value: &str,
        priority: Option<u16>,
        ttl: Option<u32>,
    ) -> AppResult<String> {
        let mut args: Vec<String> = vec![
            self.user.clone(),
            domain.to_string(),
            record.to_string(),
            rtype.to_string(),
            value.to_string(),
        ];
        if let Some(p) = priority {
            args.push(p.to_string());
        } else {
            args.push(String::new());
        }
        args.push(String::new());
        args.push("yes".to_string());
        if let Some(t) = ttl {
            args.push(t.to_string());
        }
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        self.call("v-add-dns-record", &refs).await
    }

    pub async fn delete_dns_record(&self, domain: &str, record_id: &str) -> AppResult<String> {
        self.call("v-delete-dns-record", &[&self.user, domain, record_id])
            .await
    }

    pub async fn list_databases(&self) -> AppResult<Vec<HestiaDatabase>> {
        let map: std::collections::HashMap<String, HestiaDatabase> = self
            .call_json("v-list-databases", &[&self.user, "json"])
            .await?;
        Ok(map.into_values().collect())
    }

    pub async fn add_database(
        &self,
        database: &str,
        dbuser: &str,
        dbpass: &str,
        dbtype: Option<&str>,
    ) -> AppResult<String> {
        let mut args: Vec<&str> = vec![&self.user, database, dbuser, dbpass];
        if let Some(t) = dbtype {
            args.push(t);
        }
        self.call("v-add-database", &args).await
    }

    pub async fn delete_database(&self, database: &str) -> AppResult<String> {
        self.call("v-delete-database", &[&self.user, database]).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDomain {
    pub domain: String,
    pub ip: Option<String>,
    #[serde(default)]
    pub alias: Option<String>,
    pub ssl: Option<String>,
    pub ssl_issuer: Option<String>,
    pub ssl_expires: Option<String>,
    pub suspended: Option<bool>,
    pub document_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailDomain {
    pub domain: String,
    pub antispam: Option<String>,
    pub antivirus: Option<String>,
    pub dkim: Option<String>,
    pub suspended: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailAccount {
    #[serde(default)]
    pub email: Option<String>,
    pub alias: Option<String>,
    pub fwd: Option<String>,
    pub quota: Option<String>,
    #[serde(rename = "U_DISK")]
    pub u_disk: Option<String>,
    pub suspended: Option<bool>,
    pub time: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsRecord {
    pub id: Option<String>,
    pub domain: Option<String>,
    pub record: String,
    #[serde(rename = "type")]
    pub rtype: String,
    pub value: String,
    pub priority: Option<String>,
    pub ttl: Option<String>,
    pub suspended: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HestiaDatabase {
    pub database: String,
    pub dbuser: String,
    pub host: Option<String>,
    #[serde(rename = "TYPE")]
    pub db_type: Option<String>,
    pub charset: Option<String>,
    #[serde(rename = "U_DISK")]
    pub u_disk: Option<String>,
    pub suspended: Option<bool>,
}
