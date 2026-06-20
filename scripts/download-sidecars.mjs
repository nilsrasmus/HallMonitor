/**
 * Downloads go2rtc and FFmpeg static binaries for Tauri sidecars.
 * Run: npm run download-sidecars
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, "..", "src-tauri", "binaries");

const GO2RTC_VERSION = "1.9.12";

const TARGETS = {
  "win32-x64": {
    go2rtc: `go2rtc_win64.zip`,
    ffmpeg: `ffmpeg-master-latest-win64-gpl.zip`,
    ffmpegInner: "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe",
  },
  "darwin-arm64": {
    go2rtc: `go2rtc_mac_arm64.zip`,
    ffmpeg: `ffmpeg-master-latest-macosarm64-gpl.zip`,
    ffmpegInner: "ffmpeg-master-latest-macosarm64-gpl/bin/ffmpeg",
  },
  "darwin-x64": {
    go2rtc: `go2rtc_mac_amd64.zip`,
    ffmpeg: `ffmpeg-master-latest-macos64-gpl.zip`,
    ffmpegInner: "ffmpeg-master-latest-macos64-gpl/bin/ffmpeg",
  },
  "linux-x64": {
    go2rtc: `go2rtc_linux_amd64`,
    ffmpeg: `ffmpeg-master-latest-linux64-gpl.tar.xz`,
    ffmpegInner: "ffmpeg-master-latest-linux64-gpl/bin/ffmpeg",
    ffmpegIsTar: true,
  },
};

const TAURI_NAMES = {
  "win32-x64": { go2rtc: "go2rtc-x86_64-pc-windows-msvc.exe", ffmpeg: "ffmpeg-x86_64-pc-windows-msvc.exe" },
  "darwin-arm64": { go2rtc: "go2rtc-aarch64-apple-darwin", ffmpeg: "ffmpeg-aarch64-apple-darwin" },
  "darwin-x64": { go2rtc: "go2rtc-x86_64-apple-darwin", ffmpeg: "ffmpeg-x86_64-apple-darwin" },
  "linux-x64": { go2rtc: "go2rtc-x86_64-unknown-linux-gnu", ffmpeg: "ffmpeg-x86_64-unknown-linux-gnu" },
};

function platformKey() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${process.platform}-${arch}`;
}

async function download(url, dest) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractZip(zipPath, outDir) {
  const { execSync } = await import("child_process");
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "inherit" });
  }
}

async function main() {
  const key = platformKey();
  const target = TARGETS[key];
  const names = TAURI_NAMES[key];
  if (!target) {
    console.log(`No sidecar config for ${key}; skipping.`);
    return;
  }

  mkdirSync(BIN_DIR, { recursive: true });
  const tmpDir = path.join(BIN_DIR, "_tmp");
  mkdirSync(tmpDir, { recursive: true });

  const go2rtcOut = path.join(BIN_DIR, names.go2rtc);
  const ffmpegOut = path.join(BIN_DIR, names.ffmpeg);

  if (!existsSync(go2rtcOut)) {
    if (key === "linux-x64") {
      const url = `https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/${target.go2rtc}`;
      const raw = path.join(tmpDir, "go2rtc");
      await download(url, raw);
      const { copyFileSync } = await import("fs");
      copyFileSync(raw, go2rtcOut);
      chmodSync(go2rtcOut, 0o755);
    } else {
      const url = `https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/${target.go2rtc}`;
      const zip = path.join(tmpDir, "go2rtc.zip");
      await download(url, zip);
      await extractZip(zip, tmpDir);
      const { copyFileSync, readdirSync } = await import("fs");
      const exe = readdirSync(tmpDir).find((f) => f.startsWith("go2rtc") && !f.endsWith(".zip"));
      copyFileSync(path.join(tmpDir, exe), go2rtcOut);
      if (process.platform !== "win32") chmodSync(go2rtcOut, 0o755);
    }
    console.log(`go2rtc -> ${go2rtcOut}`);
  } else {
    console.log(`go2rtc already exists: ${go2rtcOut}`);
  }

  if (!existsSync(ffmpegOut)) {
    const url = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${target.ffmpeg}`;
    const archive = path.join(tmpDir, target.ffmpeg);
    await download(url, archive);
    if (target.ffmpegIsTar) {
      const { execSync } = await import("child_process");
      execSync(`tar -xf "${archive}" -C "${tmpDir}"`, { stdio: "inherit" });
    } else {
      await extractZip(archive, tmpDir);
    }
    const { copyFileSync } = await import("fs");
    copyFileSync(path.join(tmpDir, target.ffmpegInner), ffmpegOut);
    if (process.platform !== "win32") chmodSync(ffmpegOut, 0o755);
    console.log(`ffmpeg -> ${ffmpegOut}`);
  } else {
    console.log(`ffmpeg already exists: ${ffmpegOut}`);
  }

  console.log("Sidecar download complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
