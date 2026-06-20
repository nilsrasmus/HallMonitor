# HallMonitor

Cross-platform desktop app for viewing and controlling Tapo cameras (C200 and similar) on your local WiFi.

Supported platforms: **Windows** (x64), **macOS** (Apple Silicon and Intel), **Linux** (x64).

## Features

- Live video and audio via embedded [go2rtc](https://github.com/AlexxIT/go2rtc) sidecar
- Pan/tilt controls (Tapo HTTPS API)
- Digital zoom with drag-to-pan
- Multi-camera grid (SD substream) with click-to-focus HD view
- Snapshot and MP4 recording with configurable duration/size limits
- Media gallery with permanent delete
- Always-on-top corner window (PiP)
- Experimental two-way audio (mic → camera speaker via Tapo protocol)

## Prerequisites

In the Tapo app for your camera:

1. **Camera Account** — Settings → Advanced Settings → Camera Account
2. **RTSP/ONVIF** enabled
3. **Third-Party Compatibility** — Me → Tapo Lab (for two-way audio)

## Development

```bash
npm install
npm run download-sidecars   # Downloads go2rtc + FFmpeg for your OS/arch
npm run tauri dev
```

Requires [Rust](https://rustup.rs/) and Node.js 20+ (Vite 7 requirement).

### Platform notes

| Platform | Extra requirements |
|----------|-------------------|
| **Windows** | None beyond Rust and Node |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | WebKitGTK dev packages (Debian/Ubuntu example below) |

Linux dependencies (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf unzip
```

The sidecar download script also needs `unzip` on macOS/Linux and `tar` on Linux (usually preinstalled).

## Build

```bash
npm run download-sidecars
npm run tauri build
```

Installers/bundles are written to `src-tauri/target/release/bundle/`.

CI builds all three platforms on push/PR (see `.github/workflows/build.yml`).

## Settings location

| Platform | Settings | Default captures folder |
|----------|----------|-------------------------|
| Windows | `%APPDATA%\HallMonitor\settings.json` | `%APPDATA%\HallMonitor\Captures` |
| macOS | `~/Library/Application Support/HallMonitor/settings.json` | `~/Pictures/HallMonitor` |
| Linux | `~/.config/HallMonitor/settings.json` | `~/HallMonitor/Captures` |

The captures folder is configurable in Settings.

## Stack

- Tauri 2 + React 19 + TypeScript
- go2rtc (RTSP/WebRTC streaming)
- FFmpeg (recording)
