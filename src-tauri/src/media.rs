use chrono::{DateTime, Local};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: MediaKind,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
}

#[derive(Debug, Error)]
pub enum MediaError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp"];
const VIDEO_EXT: &[&str] = &["mp4", "webm", "mkv", "mov"];

pub fn list_media(save_folder: &str) -> Result<Vec<MediaItem>, MediaError> {
    let dir = Path::new(save_folder);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        let kind = if IMAGE_EXT.contains(&ext.as_str()) {
            MediaKind::Image
        } else if VIDEO_EXT.contains(&ext.as_str()) {
            MediaKind::Video
        } else {
            continue;
        };

        let meta = entry.metadata()?;
        let modified: DateTime<Local> = meta.modified()?.into();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        items.push(MediaItem {
            id: path.to_string_lossy().to_string(),
            name,
            path: path.to_string_lossy().to_string(),
            kind,
            size_bytes: meta.len(),
            modified_at: modified.to_rfc3339(),
        });
    }

    items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(items)
}

pub fn delete_media(path: &str) -> Result<(), MediaError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(MediaError::NotFound(path.to_string()));
    }
    fs::remove_file(p)?;
    Ok(())
}
