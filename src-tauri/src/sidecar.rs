use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

pub fn go2rtc_sidecar_name() -> String {
    sidecar_name("go2rtc")
}

pub fn ffmpeg_sidecar_name() -> String {
    sidecar_name("ffmpeg")
}

fn sidecar_name(base: &str) -> String {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return format!("{base}-x86_64-pc-windows-msvc.exe");
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return format!("{base}-aarch64-apple-darwin");
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return format!("{base}-x86_64-apple-darwin");
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return format!("{base}-x86_64-unknown-linux-gnu");
    #[allow(unreachable_code)]
    base.to_string()
}

/// Resolve a bundled sidecar binary (go2rtc / ffmpeg) for dev and packaged builds.
pub fn resolve_sidecar(app: &AppHandle, lookup_name: &str) -> Option<PathBuf> {
    let filename = match lookup_name {
        "go2rtc" => go2rtc_sidecar_name(),
        "ffmpeg" => ffmpeg_sidecar_name(),
        _ => return None,
    };

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&filename);
    if dev.exists() {
        return Some(dev);
    }

    if let Ok(exe_dir) = app.path().executable_dir() {
        let bundled = exe_dir.join(&filename);
        if bundled.exists() {
            return Some(bundled);
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        for candidate in [
            resource.join("binaries").join(&filename),
            resource.join(&filename),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    lookup_in_path(lookup_name).ok()
}

pub fn dev_sidecar_path(lookup_name: &str) -> Option<PathBuf> {
    let filename = match lookup_name {
        "go2rtc" => go2rtc_sidecar_name(),
        "ffmpeg" => ffmpeg_sidecar_name(),
        _ => return None,
    };
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(filename);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn lookup_in_path(name: &str) -> Result<PathBuf, ()> {
    #[cfg(windows)]
    let lookup_cmd = "where";
    #[cfg(not(windows))]
    let lookup_cmd = "which";

    let output = Command::new(lookup_cmd).arg(name).output().map_err(|_| ())?;
    if !output.status.success() {
        return Err(());
    }

    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if path.is_empty() {
        Err(())
    } else {
        Ok(PathBuf::from(path))
    }
}
