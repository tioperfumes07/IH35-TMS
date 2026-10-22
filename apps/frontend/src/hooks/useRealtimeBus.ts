import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { resolveApiUrl } from "../api/client";
import { invalidateLoadViews, type LoadChangedPayload } from "../lib/invalidateLoadViews";
import { useAuth } from "../auth/useAuth";

/**
 * LEAD 443.208R — the app-wide realtime bus, mounted ONCE (main.tsx), not in the bell.
 * One EventSource on /api/v1/notifications/stream?channels=loads; every `load.changed` (any writer, any tab, any user of
 * the company) refreshes every load + money view through invalidateLoadViews. Before: the only EventSource (the bell's)
 * closed for good on its first error. Here: reconnect with backoff (1s → 30s), reset after a healthy minute.
 */
export const REALTIME_BUS_PATH = "/api/v1/notifications/stream?channels=loads";

export function nextBackoffMs(prev: number): number {
  return Math.min(Math.max(1000, prev * 2), 30_000);
}

export function useRealtimeBus(enabled = true): void {
  const qc = useQueryClient();
  useEffect(() => {
    // LEAD 443.232 a — a signed-out tab (login page, expired session) never opens the stream: before, it got a 401 every
    // 30 s forever (the backoff cap), each one a server error.
    if (!enabled) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 0;
    let openedAt = 0;
    let stopped = false;
    const onChanged = (ev: MessageEvent) => {
      let payload: LoadChangedPayload | undefined;
      try {
        payload = JSON.parse(String(ev.data)) as LoadChangedPayload;
      } catch {
        payload = undefined;
      }
      void invalidateLoadViews(qc, payload);
    };
    const connect = () => {
      if (stopped) return;
      es = new EventSource(resolveApiUrl(REALTIME_BUS_PATH), { withCredentials: true });
      es.addEventListener("load.changed", onChanged as EventListener);
      es.onopen = () => {
        openedAt = Date.now();
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        if (openedAt && Date.now() - openedAt > 60_000) delay = 0;
        delay = nextBackoffMs(delay);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [qc, enabled]);
}

/** Mounted once (main.tsx); opens the stream only for a signed-in user (the same ["auth","me"] query the app runs). */
export function RealtimeBus(): null {
  const { user } = useAuth();
  useRealtimeBus(Boolean(user));
  return null;
}
