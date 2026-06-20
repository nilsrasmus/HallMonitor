import { useGo2RtcStream } from "../hooks/useGo2RtcStream";
import type { CameraConfig, StreamQuality } from "../types";

interface Props {
  camera: CameraConfig;
  apiBase: string;
  quality: StreamQuality;
  muted: boolean;
  micEnabled?: boolean;
  transform?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  className?: string;
  lowFps?: boolean;
  fitContain?: boolean;
  privacyActive?: boolean;
}

function streamId(cam: CameraConfig, quality: StreamQuality, micEnabled: boolean): string {
  if (micEnabled && cam.cloudPassword) {
    return cam.id + "_tapo";
  }
  return quality === "hd" ? cam.id + "_hd" : cam.id + "_sd";
}

export function CameraView({
  camera,
  apiBase,
  quality,
  muted,
  micEnabled = false,
  transform,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className = "",
  lowFps = false,
  fitContain = false,
  privacyActive = false,
}: Props) {
  const sid = streamId(camera, quality, micEnabled);
  const { videoRef, connected, error } = useGo2RtcStream({
    apiBase,
    streamId: sid,
    enabled: !!apiBase && !!camera.ip,
    muted,
    twoWayAudio: micEnabled && !!camera.cloudPassword,
  });

  return (
    <div
      className={`camera-view ${className} ${lowFps ? "low-fps" : ""} ${fitContain ? "fit-contain" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ transform }}
        className="camera-video"
      />
      {!connected && !error && !privacyActive && (
        <div className="camera-overlay">Connecting…</div>
      )}
      {error && <div className="camera-overlay error">{error}</div>}
      {privacyActive && (
        <div className="camera-overlay privacy-overlay">
          <span>Privacy mode is on</span>
        </div>
      )}
      <div className="camera-label">{camera.name}</div>
    </div>
  );
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to capture frame"));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      "image/jpeg",
      0.92
    );
  });
}
