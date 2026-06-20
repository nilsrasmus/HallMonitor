import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraGrid } from "./components/CameraGrid";
import { CameraView } from "./components/CameraView";
import { ControlSidebar, loadSettings } from "./components/ControlSidebar";
import { MediaGallery } from "./components/MediaGallery";
import { SettingsPanel, SetupWizard } from "./components/SettingsPanel";
import { useDigitalZoom } from "./hooks/useDigitalZoom";
import { getGo2RtcApiBase } from "./hooks/useGo2RtcStream";
import type { AppSettings, MainViewMode } from "./types";
import "./App.css";

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [viewMode, setViewMode] = useState<MainViewMode>("live");
  const [apiBase, setApiBase] = useState("");
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [privacyEnabled, setPrivacyEnabled] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [ptzError, setPtzError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const zoom = useDigitalZoom();

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (!s.setupComplete) setViewMode("setup");
      else if (s.cameras.length > 0) {
        setActiveCameraId(s.cameras[0].id);
        setFocusedCameraId(s.cameras.length === 1 ? s.cameras[0].id : null);
      }
    });
    getGo2RtcApiBase().then(setApiBase);
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!recording) return;
      const stopped = await invoke<boolean>("check_recording_limits");
      if (stopped) setRecording(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    const unlisten = listen("recording-stopped", () => setRecording(false));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const activeCamera = settings?.cameras.find((c) => c.id === (focusedCameraId ?? activeCameraId));
  const controlCameraId = focusedCameraId ?? activeCameraId;

  const refreshPrivacyMode = useCallback(async (cameraId: string | null) => {
    if (!cameraId) {
      setPrivacyEnabled(false);
      setPrivacyError(null);
      return;
    }
    try {
      const enabled = await invoke<boolean>("get_privacy_mode", { cameraId });
      setPrivacyEnabled(enabled);
      setPrivacyError(null);
    } catch (e) {
      setPrivacyEnabled(false);
      setPrivacyError(String(e));
    }
  }, []);

  useEffect(() => {
    if (viewMode === "live") {
      refreshPrivacyMode(controlCameraId);
    }
  }, [controlCameraId, viewMode, refreshPrivacyMode]);

  const handleTogglePrivacy = useCallback(async () => {
    if (!controlCameraId) return;
    setPrivacyLoading(true);
    try {
      const next = !privacyEnabled;
      await invoke("set_privacy_mode", { cameraId: controlCameraId, enabled: next });
      setPrivacyEnabled(next);
      setPrivacyError(null);
    } catch (e) {
      setPrivacyError(String(e));
      console.error(e);
    } finally {
      setPrivacyLoading(false);
    }
  }, [controlCameraId, privacyEnabled]);

  const handlePtzMove = useCallback(
    async (x: number, y: number) => {
      const id = focusedCameraId ?? activeCameraId;
      if (!id) return;
      try {
        await invoke("ptz_move", { cameraId: id, x, y });
        setPtzError(null);
      } catch (e) {
        setPtzError(String(e));
      }
    },
    [focusedCameraId, activeCameraId]
  );

  const handlePtzStop = useCallback(async () => {
    const id = focusedCameraId ?? activeCameraId;
    if (!id) return;
    await invoke("ptz_stop", { cameraId: id });
  }, [focusedCameraId, activeCameraId]);

  const handleSnapshot = useCallback(async () => {
    const id = focusedCameraId ?? activeCameraId;
    if (!id) return;
    try {
      await invoke<string>("take_snapshot", { cameraId: id });
      setCaptureError(null);
    } catch (e) {
      setCaptureError(String(e));
    }
  }, [focusedCameraId, activeCameraId]);

  const handleToggleRecording = useCallback(async () => {
    const id = focusedCameraId ?? activeCameraId;
    if (!id) return;
    if (recording) {
      await invoke("stop_recording");
      setRecording(false);
    } else {
      await invoke("start_recording", { cameraId: id });
      setRecording(true);
      setCaptureError(null);
    }
  }, [focusedCameraId, activeCameraId, recording]);

  const handlePip = useCallback(async () => {
    const id = focusedCameraId ?? activeCameraId;
    if (!id) return;
    await invoke("enter_pip", { cameraId: id });
  }, [focusedCameraId, activeCameraId]);

  const handleSettingsSaved = useCallback(async (s: AppSettings) => {
    setSettings(s);
    setApiBase(await getGo2RtcApiBase());
    if (s.cameras.length > 0 && !activeCameraId) {
      setActiveCameraId(s.cameras[0].id);
    }
  }, [activeCameraId]);

  if (!settings) {
    return <div className="loading">Loading HallMonitor…</div>;
  }

  const showFocused =
    viewMode === "live" &&
    activeCamera &&
    (focusedCameraId !== null || settings.cameras.length === 1);

  return (
    <div className="app-shell">
      <ControlSidebar
        settings={settings}
        viewMode={viewMode}
        activeCameraId={activeCameraId}
        focusedCameraId={focusedCameraId}
        muted={muted}
        recording={recording}
        micEnabled={micEnabled}
        privacyEnabled={privacyEnabled}
        privacyLoading={privacyLoading}
        privacyError={privacyError}
        ptzError={ptzError}
        captureError={captureError}
        onViewModeChange={setViewMode}
        onSelectCamera={setActiveCameraId}
        onFocusCamera={setFocusedCameraId}
        onToggleMute={() => setMuted((m) => !m)}
        onSnapshot={handleSnapshot}
        onToggleRecording={handleToggleRecording}
        onToggleMic={() => setMicEnabled((m) => !m)}
        onTogglePrivacy={handleTogglePrivacy}
        onPtzMove={handlePtzMove}
        onPtzStop={handlePtzStop}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onZoomReset={zoom.reset}
        zoomLevel={zoom.scale}
      />

      <main className="main-view">
        {viewMode === "setup" && (
          <SetupWizard
            onComplete={(s) => {
              setSettings(s);
              setViewMode("live");
              setActiveCameraId(s.cameras[0]?.id ?? null);
              setFocusedCameraId(s.cameras.length === 1 ? s.cameras[0]?.id ?? null : null);
            }}
          />
        )}

        {viewMode === "gallery" && <MediaGallery saveFolder={settings.saveFolder} />}

        {viewMode === "settings" && (
          <SettingsPanel settings={settings} onSaved={handleSettingsSaved} />
        )}

        {viewMode === "live" && (
          <div className="live-view" ref={videoContainerRef}>
            {showFocused && activeCamera ? (
              <div className="focused-view">
                <CameraView
                  camera={activeCamera}
                  apiBase={apiBase}
                  quality="hd"
                  muted={muted}
                  micEnabled={micEnabled}
                  transform={zoom.transform}
                  onPointerDown={zoom.onPointerDown}
                  onPointerMove={zoom.onPointerMove}
                  onPointerUp={zoom.onPointerUp}
                  className="focused-camera"
                  privacyActive={privacyEnabled === true}
                />
                <button type="button" className="pip-trigger" onClick={handlePip}>
                  Show in corner
                </button>
              </div>
            ) : (
              <CameraGrid
                cameras={settings.cameras}
                apiBase={apiBase}
                focusedId={focusedCameraId}
                muted={muted}
                onSelect={(id) => {
                  setActiveCameraId(id);
                  setFocusedCameraId(id);
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
