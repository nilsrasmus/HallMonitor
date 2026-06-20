mod go2rtc;
mod media;
mod recording;
mod settings;
mod sidecar;
mod tapo;
mod tapo_camera;

use go2rtc::Go2RtcManager;
use media::{delete_media, list_media, MediaItem};
use parking_lot::Mutex;
use recording::{capture_snapshot, RecordingManager, RecordingStatus};
use settings::{ensure_save_folder, load_settings, save_settings, AppSettings};
use std::path::PathBuf;
use tapo::TapoClient;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder,
};

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub go2rtc: Go2RtcManager,
    pub tapo: TapoClient,
    pub recording: RecordingManager,
    pub pip_camera_id: Mutex<Option<String>>,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.lock().clone()
}

#[tauri::command]
fn save_app_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    ensure_save_folder(&settings).map_err(|e| e.to_string())?;
    save_settings(&settings).map_err(|e| e.to_string())?;
    *state.settings.lock() = settings.clone();
    Ok(())
}

#[tauri::command]
async fn restart_go2rtc(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.settings.lock().clone();
    state
        .go2rtc
        .restart(&app, &settings)
        .or_else(|_| state.go2rtc.restart_dev(&settings))
        .map_err(|e| e.to_string())?;
    Ok(state.go2rtc.api_base(settings.go2rtc_api_port))
}

#[tauri::command]
fn get_go2rtc_api_base(state: State<'_, AppState>) -> String {
    let settings = state.settings.lock();
    state.go2rtc.api_base(settings.go2rtc_api_port)
}

#[tauri::command]
async fn ptz_move(
    state: State<'_, AppState>,
    camera_id: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let settings = state.settings.lock().clone();
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or("Camera not found")?
        .clone();
    state.tapo.move_motor(&cam, x, y).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ptz_stop(state: State<'_, AppState>, camera_id: String) -> Result<(), String> {
    let settings = state.settings.lock().clone();
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or("Camera not found")?
        .clone();
    state.tapo.stop_motor(&cam).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_camera(state: State<'_, AppState>, camera_id: String) -> Result<String, String> {
    let settings = state.settings.lock().clone();
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or("Camera not found")?
        .clone();
    state.tapo.test_connection(&cam).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_privacy_mode(
    state: State<'_, AppState>,
    camera_id: String,
) -> Result<bool, String> {
    let settings = state.settings.lock().clone();
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or("Camera not found")?
        .clone();
    state
        .tapo
        .get_privacy_mode(&cam)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_privacy_mode(
    state: State<'_, AppState>,
    camera_id: String,
    enabled: bool,
) -> Result<(), String> {
    let settings = state.settings.lock().clone();
    let cam = settings
        .cameras
        .iter()
        .find(|c| c.id == camera_id)
        .ok_or("Camera not found")?
        .clone();
    state
        .tapo
        .set_privacy_mode(&cam, enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn take_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
    camera_id: String,
) -> Result<String, String> {
    let settings = state.settings.lock().clone();
    let api_base = state.go2rtc.api_base(settings.go2rtc_api_port);
    capture_snapshot(&app, &settings, &api_base, &camera_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_recording(
    app: AppHandle,
    state: State<'_, AppState>,
    camera_id: String,
) -> Result<String, String> {
    let settings = state.settings.lock().clone();
    state
        .recording
        .start(&app, &settings, &camera_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_recording(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.recording.stop().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recording_status(state: State<'_, AppState>) -> RecordingStatus {
    state.recording.status()
}

#[tauri::command]
fn check_recording_limits(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().clone();
    if state.recording.check_limits(&settings) {
        let _ = state.recording.stop();
        let _ = app.emit("recording-stopped", ());
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn list_media_files(state: State<'_, AppState>) -> Result<Vec<MediaItem>, String> {
    let settings = state.settings.lock();
    list_media(&settings.save_folder).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_media_file(path: String) -> Result<(), String> {
    delete_media(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn enter_pip(app: AppHandle, state: State<'_, AppState>, camera_id: String) -> Result<(), String> {
    *state.pip_camera_id.lock() = Some(camera_id.clone());

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.minimize();
    }

    if let Some(existing) = app.get_webview_window("pip") {
        let _ = existing.close();
    }

    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let scale = monitor.scale_factor();
    let screen_w = monitor.size().width as f64 / scale;
    let work_area = monitor.work_area();
    let work_x = work_area.position.x as f64 / scale;
    let work_y = work_area.position.y as f64 / scale;
    let work_w = work_area.size.width as f64 / scale;
    let work_h = work_area.size.height as f64 / scale;

    let pip_w = screen_w / (4.0 * 2f64.sqrt());
    let pip_h = pip_w * 9.0 / 16.0;
    let margin = 16.0;
    let x = work_x + work_w - pip_w - margin;
    let y = work_y + work_h - pip_h - margin;

    let pip = WebviewWindowBuilder::new(&app, "pip", WebviewUrl::App("pip.html".into()))
        .title("HallMonitor PiP")
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .inner_size(pip_w, pip_h)
        .position(x, y)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = pip.emit("pip-camera", camera_id);
    Ok(())
}

#[tauri::command]
async fn exit_pip(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    *state.pip_camera_id.lock() = None;
    if let Some(pip) = app.get_webview_window("pip") {
        let _ = pip.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn get_pip_camera_id(state: State<'_, AppState>) -> Option<String> {
    state.pip_camera_id.lock().clone()
}

fn config_dir() -> PathBuf {
    settings::settings_path()
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = load_settings().unwrap_or_default();
    let go2rtc = Go2RtcManager::new(config_dir());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            settings: Mutex::new(settings.clone()),
            go2rtc,
            tapo: TapoClient::new(),
            recording: RecordingManager::new(),
            pip_camera_id: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            let settings = state.settings.lock().clone();

            let _ = state.go2rtc.generate_config(&settings.cameras, settings.go2rtc_api_port);
            let _ = state
                .go2rtc
                .restart(&handle, &settings)
                .or_else(|_| state.go2rtc.restart_dev(&settings));

            ensure_save_folder(&settings).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_app_settings,
            restart_go2rtc,
            get_go2rtc_api_base,
            ptz_move,
            ptz_stop,
            test_camera,
            get_privacy_mode,
            set_privacy_mode,
            take_snapshot,
            start_recording,
            stop_recording,
            get_recording_status,
            check_recording_limits,
            list_media_files,
            delete_media_file,
            open_in_explorer,
            enter_pip,
            exit_pip,
            get_pip_camera_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
