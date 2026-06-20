export interface CameraConfig {
  id: string;
  name: string;
  ip: string;
  username: string;
  password: string;
  cloudPassword?: string;
  useStepMotor?: boolean;
}

export interface AppSettings {
  saveFolder: string;
  maxRecordingDurationSecs: number;
  maxRecordingFileBytes: number;
  cameras: CameraConfig[];
  go2rtcApiPort: number;
  setupComplete: boolean;
}

export interface RecordingStatus {
  active: boolean;
  cameraId: string | null;
  outputPath: string | null;
  elapsedSecs: number;
  fileBytes: number;
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  kind: "image" | "video";
  sizeBytes: number;
  modifiedAt: string;
}

export type MainViewMode = "live" | "gallery" | "settings" | "setup";

export type StreamQuality = "hd" | "sd";
