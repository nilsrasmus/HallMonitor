use crate::settings::{AppSettings, CameraConfig};
use crate::sidecar::{dev_sidecar_path, go2rtc_sidecar_name, resolve_sidecar};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use tauri::AppHandle;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Go2RtcError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Sidecar not found: {0}")]
    SidecarNotFound(String),
    #[error("Sidecar already running")]
    AlreadyRunning,
}

pub struct Go2RtcManager {
    child: Mutex<Option<Child>>,
    config_path: PathBuf,
}

impl Go2RtcManager {
    pub fn new(config_dir: PathBuf) -> Self {
        Self {
            child: Mutex::new(None),
            config_path: config_dir.join("go2rtc.yaml"),
        }
    }

    pub fn generate_config(&self, cameras: &[CameraConfig], port: u16) -> Result<(), Go2RtcError> {
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut streams: HashMap<String, String> = HashMap::new();
        for cam in cameras {
            streams.insert(cam.stream_id_hd(), cam.hd_rtsp_url());
            streams.insert(cam.stream_id_sd(), cam.sd_rtsp_url());
            if let Some(tapo) = cam.tapo_url() {
                streams.insert(cam.stream_id_tapo(), tapo);
            }
        }

        let mut yaml = format!(
            "api:\n  listen: \"127.0.0.1:{}\"\nwebrtc:\n  listen: \":8555\"\nstreams:\n",
            port
        );
        for (name, url) in &streams {
            yaml.push_str(&format!("  {}:\n    - \"{}\"\n", name, url.replace('"', "\\\"")));
        }
        fs::write(&self.config_path, yaml)?;
        Ok(())
    }

    fn spawn_sidecar(&self, binary: &PathBuf) -> Result<(), Go2RtcError> {
        let mut cmd = Command::new(binary);
        cmd.arg("-config")
            .arg(&self.config_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let child = cmd.spawn()?;
        *self.child.lock() = Some(child);
        Ok(())
    }

    pub fn restart(
        &self,
        app: &AppHandle,
        settings: &AppSettings,
    ) -> Result<(), Go2RtcError> {
        self.stop();
        self.generate_config(&settings.cameras, settings.go2rtc_api_port)?;

        let sidecar_name = go2rtc_sidecar_name();
        let binary = resolve_sidecar(app, "go2rtc")
            .ok_or(Go2RtcError::SidecarNotFound(sidecar_name))?;

        self.spawn_sidecar(&binary)
    }

    pub fn restart_dev(&self, settings: &AppSettings) -> Result<(), Go2RtcError> {
        self.stop();
        self.generate_config(&settings.cameras, settings.go2rtc_api_port)?;

        let sidecar_name = go2rtc_sidecar_name();
        let binary = dev_sidecar_path("go2rtc")
            .ok_or(Go2RtcError::SidecarNotFound(sidecar_name))?;

        self.spawn_sidecar(&binary)
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn api_base(&self, port: u16) -> String {
        format!("http://127.0.0.1:{}", port)
    }
}

impl Drop for Go2RtcManager {
    fn drop(&mut self) {
        self.stop();
    }
}
