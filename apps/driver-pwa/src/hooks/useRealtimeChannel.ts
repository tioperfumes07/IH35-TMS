import { useEffect, useRef, useState } from "react";
import { resolveRealtimeWsUrl } from "../api/client";

/** Realtime WebSocket — office session cookie auth. Driver channel is auto-subscribed server-side when role is Driver. */
export function useRealtimeChannel(opts: {
  topics: string[];
  enabled?: boolean;
  onMessage?: (topic: string, payload: unknown) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(opts.onMessage);
  cbRef.current = opts.onMessage;
  const topicsKey = opts.topics.slice().sort().join(",");

  useEffect(() => {
    if (opts.enabled === false) return;
    let cancelled = false;
    let ws: WebSocket | null = null;

    void (async () => {
      const url = resolveRealtimeWsUrl();
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        for (const t of opts.topics) {
          ws?.send(JSON.stringify({ op: "sub", topic: t }));
        }
      };
      ws.onclose = () => setConnected(false);
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as { topic?: string; payload?: unknown };
          if (parsed.topic) cbRef.current?.(parsed.topic, parsed.payload);
        } catch {
          /* ignore */
        }
      };
    })();

    return () => {
      cancelled = true;
      ws?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [opts.enabled, topicsKey]);

  return { connected };
}
