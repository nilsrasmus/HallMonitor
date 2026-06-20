use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraConfig {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub cloud_password: String,
    #[serde(default = "default_use_step_motor")]
    pub use_step_motor: bool,
}

fn default_use_step_motor() -> bool {
    true
}

impl CameraConfig {
    pub fn hd_rtsp_url(&self) -> String {
        format!(
            "rtsp://{}:{}@{}:554/stream1",
            urlencoding::encode(&self.username),
            urlencoding::encode(&self.password),
            self.ip
        )
    }

    pub fn sd_rtsp_url(&self) -> String {
        format!(
            "rtsp://{}:{}@{}:554/stream2",
            urlencoding::encode(&self.username),
            urlencoding::encode(&self.password),
            self.ip
        )
    }

    pub fn tapo_url(&self) -> Option<String> {
        if self.cloud_password.is_empty() {
            return None;
        }
        Some(format!(
            "tapo://{}@{}?subtype=0",
            urlencoding::encode(&self.cloud_password),
            self.ip
        ))
    }

    pub fn stream_id_hd(&self) -> String {
        format!("{}_hd", self.id)
    }

    pub fn stream_id_sd(&self) -> String {
        format!("{}_sd", self.id)
    }

    pub fn stream_id_tapo(&self) -> String {
        format!("{}_tapo", self.id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_save_folder")]
    pub save_folder: String,
    #[serde(default = "default_max_duration")]
    pub max_recording_duration_secs: u64,
    #[serde(default = "default_max_bytes")]
    pub max_recording_file_bytes: u64,
    #[serde(default)]
    pub cameras: Vec<CameraConfig>,
    #[serde(default = "default_go2rtc_port")]
    pub go2rtc_api_port: u16,
    #[serde(default)]
    pub setup_complete: bool,
}

fn default_save_folder() -> String {
    dirs_default_save()
}

fn default_max_duration() -> u64 {
    3600
}

fn default_max_bytes() -> u64 {
    2 * 1024 * 1024 * 1024
}

fn default_go2rtc_port() -> u16 {
    1984
}

fn dirs_default_save() -> String {
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return format!("{}\\HallMonitor\\Captures", appdata);
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/Pictures/HallMonitor");
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/HallMonitor/Captures");
        }
    }
    "./Captures".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            save_folder: default_save_folder(),
            max_recording_duration_secs: default_max_duration(),
            max_recording_file_bytes: default_max_bytes(),
            cameras: Vec::new(),
            go2rtc_api_port: default_go2rtc_port(),
            setup_complete: false,
        }
    }
}

pub fn settings_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("HallMonitor").join("settings.json");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("HallMonitor")
                .join("settings.json");
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".config")
                .join("HallMonitor")
                .join("settings.json");
        }
    }
    PathBuf::from("settings.json")
}

pub fn load_settings() -> Result<AppSettings, SettingsError> {
    let path = settings_path();
    if path.exists() {
        let data = fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&data)?)
    } else {
        Ok(AppSettings::default())
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), SettingsError> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(settings)?;
    fs::write(path, data)?;
    Ok(())
}

pub fn ensure_save_folder(settings: &AppSettings) -> Result<(), SettingsError> {
    fs::create_dir_all(&settings.save_folder)?;
    Ok(())
}
