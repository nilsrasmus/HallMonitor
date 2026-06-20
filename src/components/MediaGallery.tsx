import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "../types";
import { CameraView } from "./CameraView";

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

interface Props {
  saveFolder: string;
}

export function MediaGallery({ saveFolder }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<MediaItem[]>("list_media_files");
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, saveFolder]);

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    await invoke("delete_media_file", { path: item.path });
    if (selected?.id === item.id) setSelected(null);
    refresh();
  };

  const handleOpenExplorer = async (path: string) => {
    await invoke("open_in_explorer", { path });
  };

  return (
    <div className="gallery">
      <div className="gallery-header">
        <h2>Captured media</h2>
        <p className="muted-text">{saveFolder}</p>
        <button type="button" className="btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>

      {loading && <p>Loading…</p>}

      <div className="gallery-layout">
        <div className="gallery-grid">
          {items.map((item) => (
            <div
              key={item.id}
              className={`gallery-item ${selected?.id === item.id ? "selected" : ""}`}
              onClick={() => setSelected(item)}
              onKeyDown={(e) => e.key === "Enter" && setSelected(item)}
              role="button"
              tabIndex={0}
            >
              {item.kind === "image" ? (
                <img src={convertFileSrc(item.path)} alt={item.name} />
              ) : (
                <video src={convertFileSrc(item.path)} muted preload="metadata" />
              )}
              <span className="gallery-item-name">{item.name}</span>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="empty-state">No photos or videos yet.</p>
          )}
        </div>

        {selected && (
          <div className="gallery-preview">
            <h3>{selected.name}</h3>
            <p className="muted-text">{formatBytes(selected.sizeBytes)}</p>
            {selected.kind === "image" ? (
              <img src={convertFileSrc(selected.path)} alt={selected.name} className="preview-media" />
            ) : (
              <video src={convertFileSrc(selected.path)} controls autoPlay className="preview-media" />
            )}
            <div className="gallery-actions">
              <button type="button" className="btn-secondary" onClick={() => handleOpenExplorer(selected.path)}>
                Show in folder
              </button>
              <button type="button" className="btn-danger" onClick={() => handleDelete(selected)}>
                Delete permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PipApp() {
  const [apiBase, setApiBase] = useState("");
  const [camera, setCamera] = useState<import("../types").CameraConfig | null>(null);
  const [muted, setMuted] = useState(false);

  const loadCamera = useCallback(async (id: string) => {
    const s = await invoke<import("../types").AppSettings>("get_settings");
    const cam = s.cameras.find((c) => c.id === id);
    if (cam) setCamera(cam);
  }, []);

  useEffect(() => {
    invoke<string>("get_go2rtc_api_base").then(setApiBase);
    invoke<string | null>("get_pip_camera_id").then((id) => {
      if (id) {
        loadCamera(id);
      }
    });

    const unlisten = listen<string>("pip-camera", (ev) => {
      loadCamera(ev.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadCamera]);

  if (!camera || !apiBase) {
    return <div className="pip-window">Loading…</div>;
  }

  return (
    <div className="pip-window">
      <div className="pip-toolbar">
        <button type="button" className="pip-btn" onClick={() => invoke("exit_pip")} title="Restore">
          ⛶
        </button>
        <button type="button" className="pip-btn" onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <CameraView camera={camera} apiBase={apiBase} quality="hd" muted={muted} className="pip-camera" fitContain />
    </div>
  );
}
