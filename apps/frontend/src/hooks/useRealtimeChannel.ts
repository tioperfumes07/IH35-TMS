import { useEffect, useRef, useState } from "react";
import { resolveRealtimeWsUrl } from "../api/client";
import { getValidDriverAccessToken } from "../lib/auth-token";

export function useRealtimeChannel(opts: {
  topics: string[];
  enabled?: boolean;
  onMessage?: (topic: string, payload: unknown) => void;
  driverMode?: boolean;
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
      const q = new URLSearchParams();
      if (opts.driverMode) {
        const tok = await getValidDriverAccessToken();
        if (tok) q.set("driver_access_token", tok);
      }
      const base = resolveRealtimeWsUrl();
      const url = q.toString() ? `${base}?${q.toString()}` : base;
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
  }, [opts.enabled, opts.driverMode, topicsKey]);

  return { connected };
}
