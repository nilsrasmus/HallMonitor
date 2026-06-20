use chrono::Local;
use parking_lot::Mutex;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use thiserror::Error;

use crate::settings::{AppSettings, CameraConfig};
use crate::sidecar::{ffmpeg_sidecar_name, resolve_sidecar};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub active: bool,
    pub camera_id: Option<String>,
    pub output_path: Option<String>,
    pub elapsed_secs: u64,
    pub file_bytes: u64,
}

#[derive(Debug, Error)]
pub enum RecordingError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Already recording")]
    AlreadyRecording,
    #[error("Not recording")]
    NotRecording,
    #[error("FFmpeg not found: {0}")]
    FfmpegNotFound(String),
    #[error("Camera not found")]
    CameraNotFound,
    #[error("Snapshot failed: {0}")]
    SnapshotFailed(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

struct ActiveRecording {
    child: Child,
    camera_id: String,
    output_path: PathBuf,
    started: Instant,
}

pub struct RecordingManager {
    active: Mutex<Option<ActiveRecording>>,
}

impl RecordingManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }

    pub fn status(&self) -> RecordingStatus {
        let guard = self.active.lock();
        if let Some(rec) = guard.as_ref() {
            let bytes = fs::metadata(&rec.output_path).map(|m| m.len()).unwrap_or(0);
            RecordingStatus {
                active: true,
                camera_id: Some(rec.camera_id.clone()),
                output_path: Some(rec.output_path.to_string_lossy().to_string()),
                elapsed_secs: rec.started.elapsed().as_secs(),
                file_bytes: bytes,
            }
        } else {
            RecordingStatus {
                active: false,
                camera_id: None,
                output_path: None,
                elapsed_secs: 0,
                file_bytes: 0,
            }
        }
    }

    pub fn start(
        &self,
        app: &AppHandle,
        settings: &AppSettings,
        camera_id: &str,
    ) -> Result<String, RecordingError> {
        if self.active.lock().is_some() {
            return Err(RecordingError::AlreadyRecording);
        }

        let cam = settings
            .cameras
            .iter()
            .find(|c| c.id == camera_id)
            .ok_or(RecordingError::CameraNotFound)?;

        fs::create_dir_all(&settings.save_folder)?;

        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let filename = format!(
            "HallMonitor_{}_{}.mp4",
            sanitize_filename(&cam.name),
            timestamp
        );
        let output_path = PathBuf::from(&settings.save_folder).join(filename);

        let ffmpeg = ffmpeg_path(app)?;
        let rtsp = cam.hd_rtsp_url();

        let mut cmd = Command::new(&ffmpeg);
        cmd.args([
            "-y",
            "-rtsp_transport",
            "tcp",
            "-i",
            &rtsp,
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
        ]);

        if settings.max_recording_duration_secs > 0 {
            cmd.arg("-t").arg(settings.max_recording_duration_secs.to_string());
        }

        cmd.arg(output_path.to_string_lossy().as_ref())
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let child = cmd.spawn()?;
        *self.active.lock() = Some(ActiveRecording {
            child,
            camera_id: camera_id.to_string(),
            output_path: output_path.clone(),
            started: Instant::now(),
        });

        Ok(output_path.to_string_lossy().to_string())
    }

    pub fn stop(&self) -> Result<Option<String>, RecordingError> {
        let mut guard = self.active.lock();
        if let Some(mut rec) = guard.take() {
            stop_ffmpeg_gracefully(&mut rec.child);
            return Ok(Some(rec.output_path.to_string_lossy().to_string()));
        }
        Err(RecordingError::NotRecording)
    }

    pub fn check_limits(&self, settings: &AppSettings) -> bool {
        let mut guard = self.active.lock();
        let Some(rec) = guard.as_mut() else {
            return false;
        };

        let elapsed = rec.started.elapsed().as_secs();
        let bytes = fs::metadata(&rec.output_path).map(|m| m.len()).unwrap_or(0);

        let duration_exceeded = settings.max_recording_duration_secs > 0
            && elapsed >= settings.max_recording_duration_secs;
        let size_exceeded =
            settings.max_recording_file_bytes > 0 && bytes >= settings.max_recording_file_bytes;

        duration_exceeded || size_exceeded
    }
}

pub async fn capture_snapshot(
    app: &AppHandle,
    settings: &AppSettings,
    go2rtc_api: &str,
    camera_id: &str,
) -> Result<String, RecordingError> {
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or(RecordingError::CameraNotFound)?;

    let stream_id = cam.stream_id_hd();
    let url = format!(
        "{}/api/frame.jpeg?src={}",
        go2rtc_api.trim_end_matches('/'),
        urlencoding::encode(&stream_id)
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;

    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            let bytes = resp.bytes().await?;
            if bytes.len() > 256 {
                return save_snapshot(settings, &cam.name, &bytes);
            }
        }
    }

    let app = app.clone();
    let cam = cam.clone();
    let settings = settings.clone();
    tokio::task::spawn_blocking(move || capture_snapshot_ffmpeg(&app, &settings, &cam))
        .await
        .map_err(|e| RecordingError::SnapshotFailed(e.to_string()))?
}

fn capture_snapshot_ffmpeg(
    app: &AppHandle,
    settings: &AppSettings,
    cam: &CameraConfig,
) -> Result<String, RecordingError> {
    fs::create_dir_all(&settings.save_folder)?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!(
        "HallMonitor_{}_{}.jpg",
        sanitize_filename(&cam.name),
        timestamp
    );
    let path = PathBuf::from(&settings.save_folder).join(&filename);

    let ffmpeg = ffmpeg_path(app)?;
    let rtsp = cam.hd_rtsp_url();

    let output = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-y",
            "-rtsp_transport",
            "tcp",
            "-i",
            &rtsp,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-update",
            "1",
            path.to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(RecordingError::SnapshotFailed(format!(
            "FFmpeg snapshot failed: {stderr}"
        )));
    }

    let meta = fs::metadata(&path)?;
    if meta.len() < 256 {
        let _ = fs::remove_file(&path);
        return Err(RecordingError::SnapshotFailed(
            "Snapshot file was empty".into(),
        ));
    }

    Ok(path.to_string_lossy().to_string())
}

fn stop_ffmpeg_gracefully(child: &mut Child) {
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"q");
        let _ = stdin.flush();
    }

    for _ in 0..150 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn sanitize_filename(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "camera".to_string();
    }

    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '_'
            } else {
                '_'
            }
        })
        .collect()
}

fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf, RecordingError> {
    let name = ffmpeg_sidecar_name();
    resolve_sidecar(app, "ffmpeg").ok_or(RecordingError::FfmpegNotFound(name))
}

pub fn save_snapshot(
    settings: &AppSettings,
    camera_name: &str,
    jpeg_data: &[u8],
) -> Result<String, RecordingError> {
    fs::create_dir_all(&settings.save_folder)?;
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!(
        "HallMonitor_{}_{}.jpg",
        sanitize_filename(camera_name),
        timestamp
    );
    let path = PathBuf::from(&settings.save_folder).join(&filename);
    fs::write(&path, jpeg_data)?;
    Ok(path.to_string_lossy().to_string())
}
