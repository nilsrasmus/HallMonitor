import type { CameraConfig } from "../types";
import { CameraView } from "./CameraView";

interface Props {
  cameras: CameraConfig[];
  apiBase: string;
  focusedId: string | null;
  muted: boolean;
  onSelect: (id: string) => void;
}

export function CameraGrid({ cameras, apiBase, focusedId, muted, onSelect }: Props) {
  if (cameras.length === 0) {
    return (
      <div className="empty-state">
        <p>No cameras configured. Open Settings to add your Tapo C200.</p>
      </div>
    );
  }

  const count = cameras.length;
  const gridClass =
    count === 1 ? "grid-1" : count <= 4 ? "grid-2" : count <= 9 ? "grid-3" : "grid-4";

  return (
    <div className={`camera-grid ${gridClass}`}>
      {cameras.map((cam) => (
        <button
          key={cam.id}
          type="button"
          className={`grid-tile ${focusedId === cam.id ? "focused" : ""}`}
          onClick={() => onSelect(cam.id)}
        >
          <CameraView
            camera={cam}
            apiBase={apiBase}
            quality="sd"
            muted={muted}
            lowFps
            className="grid-camera"
          />
        </button>
      ))}
    </div>
  );
}
