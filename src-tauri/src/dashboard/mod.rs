use crate::error::AppResult;
use crate::ssh::exec_command;
use crate::state::SshProfile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpsStats {
    pub hostname: Option<String>,
    pub uptime: Option<String>,
    pub load: Option<String>,
    pub mem_total_mb: Option<u64>,
    pub mem_used_mb: Option<u64>,
    pub disk_total_gb: Option<f64>,
    pub disk_used_gb: Option<f64>,
    pub disk_pct: Option<f64>,
    pub top_procs: Vec<ProcInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcInfo {
    pub user: String,
    pub pid: String,
    pub cpu: String,
    pub mem: String,
    pub command: String,
}

pub async fn get_vps_stats<R: Runtime>(
    app: &AppHandle<R>,
    profile: SshProfile,
) -> AppResult<VpsStats> {
    let script = r#"
echo "===HOSTNAME==="; hostname
echo "===UPTIME==="; uptime -p 2>/dev/null || cat /proc/uptime
echo "===LOAD==="; cat /proc/loadavg
echo "===MEM==="; free -m | head -2
echo "===DISK==="; df -BG / | tail -1
echo "===TOP==="; ps aux --sort=-%mem | head -4 | tail -3
echo "===END==="
"#;
    let output = exec_command(app, profile, script, 10).await?;
    parse_stats(&output)
}

fn parse_stats(output: &str) -> AppResult<VpsStats> {
    let mut stats = VpsStats {
        hostname: None,
        uptime: None,
        load: None,
        mem_total_mb: None,
        mem_used_mb: None,
        disk_total_gb: None,
        disk_used_gb: None,
        disk_pct: None,
        top_procs: Vec::new(),
    };

    let mut sections: HashMap<&str, String> = HashMap::new();
    let mut current = "";
    for line in output.lines() {
        if let Some(name) = line.strip_prefix("===").and_then(|s| s.strip_suffix("===")) {
            current = match name {
                "HOSTNAME" => "HOSTNAME",
                "UPTIME" => "UPTIME",
                "LOAD" => "LOAD",
                "MEM" => "MEM",
                "DISK" => "DISK",
                "TOP" => "TOP",
                _ => "",
            };
            continue;
        }
        if !current.is_empty() {
            sections.entry(current).or_default().push_str(line.trim());
            sections.entry(current).or_default().push('\n');
        }
    }

    stats.hostname = sections.get("HOSTNAME").map(|s| s.trim().to_string());
    stats.uptime = sections.get("UPTIME").map(|s| s.trim().to_string());
    stats.load = sections.get("LOAD").map(|s| s.trim().to_string());

    if let Some(mem) = sections.get("MEM") {
        let mut lines = mem.lines();
        if let Some(data_line) = lines.nth(1) {
            let parts: Vec<&str> = data_line.split_whitespace().collect();
            if parts.len() >= 3 {
                stats.mem_total_mb = parts[1].parse().ok();
                stats.mem_used_mb = parts[2].parse().ok();
            }
        }
    }

    if let Some(disk) = sections.get("DISK") {
        let parts: Vec<&str> = disk.split_whitespace().collect();
        if parts.len() >= 5 {
            stats.disk_total_gb = parts[1].trim_end_matches('G').parse().ok();
            stats.disk_used_gb = parts[2].trim_end_matches('G').parse().ok();
            stats.disk_pct = parts[4].trim_end_matches('%').parse().ok();
        }
    }

    if let Some(top) = sections.get("TOP") {
        for line in top.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 11 {
                stats.top_procs.push(ProcInfo {
                    user: parts[0].to_string(),
                    pid: parts[1].to_string(),
                    cpu: parts[2].to_string(),
                    mem: parts[3].to_string(),
                    command: parts[10..].join(" "),
                });
            }
        }
    }

    Ok(stats)
}
