import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { AppSettings, CameraConfig } from "../types";
import {
  defaultCamera,
  newCameraId,
  pickSaveFolder,
  saveSettings,
} from "./ControlSidebar";

interface Props {
  settings: AppSettings;
  onSaved: (settings: AppSettings) => void;
}

function bytesToMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

export function SettingsPanel({ settings, onSaved }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [editingCam, setEditingCam] = useState<CameraConfig | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateCam = (cam: CameraConfig) => {
    setDraft((d) => ({
      ...d,
      cameras: d.cameras.map((c) => (c.id === cam.id ? cam : c)),
    }));
  };

  const addCamera = () => {
    const cam = defaultCamera();
    setDraft((d) => ({ ...d, cameras: [...d.cameras, cam] }));
    setEditingCam(cam);
  };

  const removeCamera = (id: string) => {
    setDraft((d) => ({ ...d, cameras: d.cameras.filter((c) => c.id !== id) }));
    if (editingCam?.id === id) setEditingCam(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ ...draft, setupComplete: true });
      await invoke("restart_go2rtc");
      onSaved({ ...draft, setupComplete: true });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (cam: CameraConfig) => {
    setTestResult("Testing…");
    try {
      const temp = { ...draft, cameras: [cam] };
      await saveSettings(temp);
      await invoke("restart_go2rtc");
      const result = await invoke<string>("test_camera", { cameraId: cam.id });
      setTestResult(result);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Connection failed");
    }
  };

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section>
        <h3>Save folder</h3>
        <div className="field-row">
          <input type="text" value={draft.saveFolder} readOnly className="field-input" />
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const folder = await pickSaveFolder(draft.saveFolder);
              if (folder) setDraft((d) => ({ ...d, saveFolder: folder }));
            }}
          >
            Browse
          </button>
        </div>
      </section>

      <section>
        <h3>Recording limits</h3>
        <label className="field-label">
          Max duration (seconds, 0 = unlimited)
          <input
            type="number"
            min={0}
            value={draft.maxRecordingDurationSecs}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                maxRecordingDurationSecs: parseInt(e.target.value, 10) || 0,
              }))
            }
            className="field-input"
          />
        </label>
        <label className="field-label">
          Max file size (MB, 0 = unlimited)
          <input
            type="number"
            min={0}
            value={bytesToMb(draft.maxRecordingFileBytes)}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                maxRecordingFileBytes: mbToBytes(parseInt(e.target.value, 10) || 0),
              }))
            }
            className="field-input"
          />
        </label>
      </section>

      <section>
        <h3>Cameras</h3>
        <button type="button" className="btn" onClick={addCamera}>
          Add camera
        </button>
        <ul className="settings-camera-list">
          {draft.cameras.map((cam) => (
            <li key={cam.id}>
              <button type="button" onClick={() => setEditingCam(cam)}>
                {cam.name || cam.ip || "Unnamed"}
              </button>
              <button type="button" className="btn-danger small" onClick={() => removeCamera(cam.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>

        {editingCam && (
          <div className="camera-form">
            <label className="field-label">
              Name
              <input
                value={editingCam.name}
                onChange={(e) => {
                  const c = { ...editingCam, name: e.target.value };
                  setEditingCam(c);
                  updateCam(c);
                }}
                className="field-input"
              />
            </label>
            <label className="field-label">
              IP address
              <input
                value={editingCam.ip}
                onChange={(e) => {
                  const c = { ...editingCam, ip: e.target.value };
                  setEditingCam(c);
                  updateCam(c);
                }}
                className="field-input"
                placeholder="192.168.1.100"
              />
            </label>
            <label className="field-label">
              Camera Account username
              <input
                value={editingCam.username}
                onChange={(e) => {
                  const c = { ...editingCam, username: e.target.value };
                  setEditingCam(c);
                  updateCam(c);
                }}
                className="field-input"
              />
            </label>
            <label className="field-label">
              Camera Account password
              <input
                type="password"
                value={editingCam.password}
                onChange={(e) => {
                  const c = { ...editingCam, password: e.target.value };
                  setEditingCam(c);
                  updateCam(c);
                }}
                className="field-input"
              />
            </label>
            <label className="field-label">
              Tapo cloud password (for two-way audio)
              <input
                type="password"
                value={editingCam.cloudPassword ?? ""}
                onChange={(e) => {
                  const c = { ...editingCam, cloudPassword: e.target.value };
                  setEditingCam(c);
                  updateCam(c);
                }}
                className="field-input"
              />
            </label>
            <label className="field-label checkbox">
              <input
                type="checkbox"
                checked={editingCam.useStepMotor ?? true}
                onChange={(e) => {
                  const c = { ...editingCam, useStepMotor: e.target.checked };
                  setEditingCam(c);
                  updateCam(c);
                }}
              />
              Use step motor (recommended for C200)
            </label>
            <button type="button" className="btn-secondary" onClick={() => handleTest(editingCam)}>
              Test connection
            </button>
            {testResult && <p className="test-result">{testResult}</p>}
          </div>
        )}
      </section>

      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

export function SetupWizard({ onComplete }: { onComplete: (settings: AppSettings) => void }) {
  const [cam, setCam] = useState(defaultCamera());
  const [saveFolder, setSaveFolder] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (!cam.ip || !cam.username || !cam.password) {
      setError("Please fill in camera IP and Camera Account credentials.");
      return;
    }
    const settings: AppSettings = {
      saveFolder: saveFolder || (await loadDefaultFolder()),
      maxRecordingDurationSecs: 3600,
      maxRecordingFileBytes: 2 * 1024 * 1024 * 1024,
      cameras: [{ ...cam, id: newCameraId() }],
      go2rtcApiPort: 1984,
      setupComplete: true,
    };
    await saveSettings(settings);
    await invoke("restart_go2rtc");
    onComplete(settings);
  };

  return (
    <div className="setup-wizard">
      <h2>Welcome to HallMonitor</h2>
      <p>Connect your Tapo C200 camera on your local WiFi.</p>

      <label className="field-label">
        Camera name
        <input value={cam.name} onChange={(e) => setCam({ ...cam, name: e.target.value })} className="field-input" />
      </label>
      <label className="field-label">
        Camera IP
        <input
          value={cam.ip}
          onChange={(e) => setCam({ ...cam, ip: e.target.value })}
          className="field-input"
          placeholder="192.168.1.100"
        />
      </label>
      <label className="field-label">
        Camera Account username
        <input
          value={cam.username}
          onChange={(e) => setCam({ ...cam, username: e.target.value })}
          className="field-input"
        />
      </label>
      <label className="field-label">
        Camera Account password
        <input
          type="password"
          value={cam.password}
          onChange={(e) => setCam({ ...cam, password: e.target.value })}
          className="field-input"
        />
      </label>
      <label className="field-label">
        Tapo cloud password (optional, for two-way audio)
        <input
          type="password"
          value={cam.cloudPassword ?? ""}
          onChange={(e) => setCam({ ...cam, cloudPassword: e.target.value })}
          className="field-input"
        />
      </label>
      <div className="field-row">
        <input type="text" value={saveFolder} readOnly placeholder="Default save folder" className="field-input" />
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            const f = await pickSaveFolder(saveFolder);
            if (f) setSaveFolder(f);
          }}
        >
          Choose save folder
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <button type="button" className="btn btn-primary" onClick={handleFinish}>
        Get started
      </button>

      <div className="setup-hints">
        <h4>Prerequisites in Tapo app:</h4>
        <ul>
          <li>Enable Camera Account under Advanced Settings</li>
          <li>Enable RTSP/ONVIF</li>
          <li>For two-way audio: Me → Tapo Lab → Third-Party Compatibility</li>
        </ul>
      </div>
    </div>
  );
}

async function loadDefaultFolder(): Promise<string> {
  const s = await invoke<AppSettings>("get_settings");
  return s.saveFolder;
}
