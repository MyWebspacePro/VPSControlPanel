use crate::error::{AppError, AppResult};
use crate::secrets::SecretsStore;
use serde::{Deserialize, Serialize};

pub struct HestiaClient {
    pub base_url: String,
    pub key: String,
    pub http: reqwest::Client,
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
        })
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

    pub async fn ping(&self) -> AppResult<String> {
        let resp = self
            .http
            .get(&format!("{}/api/v1/list-web-domains", self.base_url))
            .header("Authorization", format!("Bearer {}", self.key))
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
        let resp = self
            .http
            .get(&format!("{}/api/v1/list-web-domains", self.base_url))
            .header("Authorization", format!("Bearer {}", self.key))
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
        let body: WebDomainsResponse = resp.json().await?;
        Ok(body.data)
    }

    pub async fn list_dns_records(&self, domain: &str) -> AppResult<Vec<DnsRecord>> {
        let resp = self
            .http
            .get(&format!(
                "{}/api/v1/list-dns-records?domain={domain}",
                self.base_url
            ))
            .header("Authorization", format!("Bearer {}", self.key))
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
        let body: DnsRecordsResponse = resp.json().await?;
        Ok(body.data)
    }

    pub async fn add_dns_record(
        &self,
        domain: &str,
        record: &str,
        rtype: &str,
        value: &str,
        priority: Option<u16>,
    ) -> AppResult<String> {
        let mut url = format!(
            "{}/api/v1/add-dns-record?domain={domain}&record={record}&type={rtype}&value={}",
            self.base_url, value
        );
        if let Some(p) = priority {
            url.push_str(&format!("&priority={p}"));
        }
        let resp = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.key))
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

    pub async fn delete_dns_record(
        &self,
        domain: &str,
        record: &str,
        rtype: &str,
        value: &str,
    ) -> AppResult<String> {
        let url = format!(
            "{}/api/v1/delete-dns-record?domain={domain}&record={record}&type={rtype}&value={value}",
            self.base_url
        );
        let resp = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.key))
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

    pub async fn list_mail_accounts(&self, domain: &str) -> AppResult<Vec<MailAccount>> {
        let resp = self
            .http
            .get(&format!(
                "{}/api/v1/list-mail-accounts?domain={domain}",
                self.base_url
            ))
            .header("Authorization", format!("Bearer {}", self.key))
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
        let body: MailAccountsResponse = resp.json().await?;
        Ok(body.data)
    }

    pub async fn list_databases(&self) -> AppResult<Vec<HestiaDatabase>> {
        let resp = self
            .http
            .get(&format!("{}/api/v1/list-databases", self.base_url))
            .header("Authorization", format!("Bearer {}", self.key))
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
        let body: DatabasesResponse = resp.json().await?;
        Ok(body.data)
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebDomainsResponse {
    pub data: Vec<WebDomain>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DnsRecordsResponse {
    pub data: Vec<DnsRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailAccount {
    pub email: String,
    pub quota: Option<String>,
    pub used: Option<String>,
    pub suspended: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MailAccountsResponse {
    pub data: Vec<MailAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HestiaDatabase {
    pub database: String,
    pub dbuser: String,
    pub disk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DatabasesResponse {
    pub data: Vec<HestiaDatabase>,
}
