"use client";

import * as React from "react";
import { STREAMING_GATEWAY_URL } from "@/lib/api-client";

export type TouchAction = "down" | "up" | "move" | "tap" | "long_press";

/**
 * Owns the single WebSocket that carries both directions of the device
 * stream: binary video frames in, JSON input commands out. One socket keeps
 * input latency as low as the frame path, and matches the streaming-gateway
 * proxy (services/streaming-gateway/src/proxy.ts), which multiplexes both
 * over one upstream connection to the emulator-worker.
 */
export function useDeviceStream(sessionId: string, streamingToken: string | undefined, enabled: boolean) {
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [fps, setFps] = React.useState(0);
  const wsRef = React.useRef<WebSocket | null>(null);
  const frameCountRef = React.useRef(0);
  const lastUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !streamingToken) return;

    const ws = new WebSocket(`${STREAMING_GATEWAY_URL}/sessions/${sessionId}/stream?token=${streamingToken}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      if (typeof event.data === "string") return; // control-channel error messages, not frames
      frameCountRef.current += 1;
      // The worker emits PNG frames in real mode and SVG text frames in mock
      // mode; sniff the first byte since the binary WS protocol carries no
      // separate content-type field. PNG magic is 0x89, SVG/XML starts with '<'.
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const contentType = bytes[0] === 0x89 ? "image/png" : "image/svg+xml";
      const blob = new Blob([event.data], { type: contentType });
      const url = URL.createObjectURL(blob);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setFrameUrl(url);
    };

    const fpsTimer = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(fpsTimer);
      ws.close();
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, [sessionId, streamingToken, enabled]);

  const sendInput = React.useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { frameUrl, connected, fps, sendInput };
}
