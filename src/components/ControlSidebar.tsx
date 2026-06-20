import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import type { AppSettings, CameraConfig, MainViewMode } from "../types";
import {
  CameraIcon,
  EyeIcon,
  IconButton,
  MicIcon,
  RecordIcon,
  ResetZoomIcon,
  SpeakerIcon,
  StopIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./ControlIcons";

interface Props {
  settings: AppSettings;
  viewMode: MainViewMode;
  activeCameraId: string | null;
  focusedCameraId: string | null;
  muted: boolean;
  recording: boolean;
  micEnabled: boolean;
  privacyEnabled: boolean;
  privacyLoading: boolean;
  privacyError: string | null;
  ptzError: string | null;
  captureError: string | null;
  onViewModeChange: (mode: MainViewMode) => void;
  onSelectCamera: (id: string) => void;
  onFocusCamera: (id: string | null) => void;
  onToggleMute: () => void;
  onSnapshot: () => void;
  onToggleRecording: () => void;
  onToggleMic: () => void;
  onTogglePrivacy: () => void;
  onPtzMove: (x: number, y: number) => void;
  onPtzStop: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  zoomLevel: number;
}

export function ControlSidebar({
  settings,
  viewMode,
  activeCameraId,
  focusedCameraId,
  muted,
  recording,
  micEnabled,
  privacyEnabled,
  privacyLoading,
  privacyError,
  ptzError,
  captureError,
  onViewModeChange,
  onSelectCamera,
  onFocusCamera,
  onToggleMute,
  onSnapshot,
  onToggleRecording,
  onToggleMic,
  onTogglePrivacy,
  onPtzMove,
  onPtzStop,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomLevel,
}: Props) {
  const showCameraControls =
    viewMode === "live" && (focusedCameraId || settings.cameras.length === 1);
  const ptzIntervalRef = useRef<number | null>(null);

  const stopPtzRepeat = useCallback(() => {
    if (ptzIntervalRef.current !== null) {
      window.clearInterval(ptzIntervalRef.current);
      ptzIntervalRef.current = null;
    }
    onPtzStop();
  }, [onPtzStop]);

  const startPtzRepeat = useCallback(
    (x: number, y: number) => {
      stopPtzRepeat();
      onPtzMove(x, y);
      ptzIntervalRef.current = window.setInterval(() => onPtzMove(x, y), 250);
    },
    [onPtzMove, stopPtzRepeat]
  );

  useEffect(() => () => stopPtzRepeat(), [stopPtzRepeat]);

  const zoomPercent = `${Math.round(zoomLevel * 100)}%`;

  const ptzPointerHandlers = (x: number, y: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      startPtzRepeat(x, y);
    },
    onPointerUp: stopPtzRepeat,
    onPointerLeave: stopPtzRepeat,
    onPointerCancel: stopPtzRepeat,
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h2>HallMonitor</h2>
      </div>

      <div className="sidebar-section">
        <h3>Cameras</h3>
        <ul className="camera-list">
          {settings.cameras.map((cam) => (
            <li key={cam.id}>
              <button
                type="button"
                className={`camera-btn ${activeCameraId === cam.id ? "active" : ""}`}
                onClick={() => {
                  onSelectCamera(cam.id);
                  onFocusCamera(cam.id);
                  onViewModeChange("live");
                }}
              >
                {cam.name}
              </button>
            </li>
          ))}
          {settings.cameras.length === 0 && (
            <li className="muted-text">No cameras configured</li>
          )}
        </ul>
        {settings.cameras.length > 1 && viewMode === "live" && focusedCameraId && (
          <button type="button" className="btn-secondary" onClick={() => onFocusCamera(null)}>
            Show all cameras
          </button>
        )}
      </div>

      {showCameraControls && (
        <div className="sidebar-section camera-controls">
          <h3>Camera controls</h3>

          <div className="camera-controls-toolbar">
            <IconButton label="Take snapshot" onClick={onSnapshot}>
              <CameraIcon />
            </IconButton>

            <IconButton
              label={recording ? "Stop recording" : "Start recording"}
              onClick={onToggleRecording}
              variant={recording ? "recording" : "record-idle"}
            >
              {recording ? <StopIcon /> : <RecordIcon />}
            </IconButton>

            <IconButton
              label={muted ? "Unmute audio" : "Mute audio"}
              onClick={onToggleMute}
              crossed={muted}
              dimmed={muted}
            >
              <SpeakerIcon />
            </IconButton>

            <IconButton
              label={
                privacyLoading
                  ? "Updating privacy mode"
                  : privacyEnabled
                    ? "Privacy mode on"
                    : "Privacy mode off"
              }
              onClick={onTogglePrivacy}
              disabled={privacyLoading}
              crossed={privacyEnabled}
              dimmed={privacyEnabled}
              active={privacyEnabled}
            >
              <EyeIcon />
            </IconButton>

            <IconButton
              label={micEnabled ? "Mic on (experimental)" : "Mic off"}
              onClick={onToggleMic}
              variant={micEnabled ? "mic-on" : "default"}
              dimmed={!micEnabled}
            >
              <MicIcon />
            </IconButton>
          </div>

          <div className="ptz-pad">
            <button type="button" className="ptz-btn" {...ptzPointerHandlers(0, -1)}>
              ▲
            </button>
            <div className="ptz-row">
              <button type="button" className="ptz-btn" {...ptzPointerHandlers(-1, 0)}>
                ◀
              </button>
              <span className="ptz-center">●</span>
              <button type="button" className="ptz-btn" {...ptzPointerHandlers(1, 0)}>
                ▶
              </button>
            </div>
            <button type="button" className="ptz-btn" {...ptzPointerHandlers(0, 1)}>
              ▼
            </button>
          </div>

          <div className="zoom-controls">
            <IconButton label="Zoom out" onClick={onZoomOut} disabled={zoomLevel <= 1}>
              <ZoomOutIcon />
            </IconButton>
            <span className="zoom-level">{zoomPercent}</span>
            <IconButton label="Zoom in" onClick={onZoomIn} disabled={zoomLevel >= 4}>
              <ZoomInIcon />
            </IconButton>
            <IconButton label="Reset zoom" onClick={onZoomReset}>
              <ResetZoomIcon />
            </IconButton>
          </div>

          <p className="hint camera-controls-disclaimer">
            Two-way audio is experimental: sends mic audio to the camera speaker via Tapo protocol.
            Requires Tapo cloud password and Third-Party Compatibility.
          </p>
        </div>
      )}

      <div className="sidebar-bottom">
        {(ptzError || privacyError || captureError) && (
          <div className="sidebar-messages">
            {ptzError && <p className="hint error-text">{ptzError}</p>}
            {privacyError && <p className="hint error-text">{privacyError}</p>}
            {captureError && <p className="hint error-text">{captureError}</p>}
          </div>
        )}

        <div className="sidebar-section sidebar-nav">
          <button
            type="button"
            className={`nav-btn ${viewMode === "gallery" ? "active" : ""}`}
            onClick={() => onViewModeChange("gallery")}
          >
            Gallery
          </button>
          <button
            type="button"
            className={`nav-btn ${viewMode === "settings" ? "active" : ""}`}
            onClick={() => onViewModeChange("settings")}
          >
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}

export async function pickSaveFolder(current: string): Promise<string | null> {
  const selected = await open({ directory: true, defaultPath: current, multiple: false });
  if (selected && typeof selected === "string") return selected;
  return null;
}

export function newCameraId(): string {
  return `cam_${Date.now()}`;
}

export function defaultCamera(partial?: Partial<CameraConfig>): CameraConfig {
  return {
    id: newCameraId(),
    name: "Tapo C200",
    ip: "",
    username: "",
    password: "",
    cloudPassword: "",
    useStepMotor: true,
    ...partial,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_app_settings", { settings });
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}
