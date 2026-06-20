import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";


interface UseGo2RtcStreamOptions {
  apiBase: string;
  streamId: string;
  enabled?: boolean;
  muted?: boolean;
  twoWayAudio?: boolean;
}

export function useGo2RtcStream({
  apiBase,
  streamId,
  enabled = true,
  muted = false,
  twoWayAudio = false,
}: UseGo2RtcStreamOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    setConnected(false);
  }, []);

  const connectMse = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !enabled || !streamId) return;

    const url = `${apiBase}/api/stream.mp4?src=${encodeURIComponent(streamId)}`;
    video.src = url;
    await video.play().catch(() => undefined);
    setConnected(true);
    setError(null);
  }, [apiBase, streamId, enabled]);

  const connectWebRtc = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !enabled || !streamId) return;

    cleanup();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: twoWayAudio ? "sendrecv" : "recvonly" });

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => undefined);
    };

    if (twoWayAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      } catch {
        setError("Microphone access denied");
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
        setError("WebRTC connection lost");
        setConnected(false);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(`${apiBase}/api/webrtc?src=${encodeURIComponent(streamId)}`, {
      method: "POST",
      body: offer.sdp,
      headers: { "Content-Type": "application/sdp" },
    });

    if (!res.ok) {
      throw new Error(`WebRTC failed: ${res.status}`);
    }

    const answerSdp = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    setConnected(true);
    setError(null);
  }, [apiBase, streamId, enabled, twoWayAudio, cleanup]);

  const connect = useCallback(async () => {
    if (!enabled || !streamId) return;
    try {
      await connectWebRtc();
    } catch {
      try {
        await connectMse();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Stream connection failed");
        setConnected(false);
      }
    }
  }, [enabled, streamId, connectWebRtc, connectMse]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }
    connect();
    return cleanup;
  }, [enabled, streamId, apiBase, connect, cleanup]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  return { videoRef, connected, error, reconnect: connect };
}

export async function getGo2RtcApiBase(): Promise<string> {
  return invoke<string>("get_go2rtc_api_base");
}

export async function restartGo2Rtc(): Promise<string> {
  return invoke<string>("restart_go2rtc");
}
