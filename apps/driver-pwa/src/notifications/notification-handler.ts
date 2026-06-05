export type PushPayload = {
  title?: string;
  body?: string;
  tag?: string;
  data?: Record<string, string>;
};

export function parsePushPayload(raw: unknown): PushPayload {
  if (typeof raw === "string") {
    try {
      return parsePushPayload(JSON.parse(raw));
    } catch {
      return { title: "IH35 Driver", body: raw };
    }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const data =
      obj.data && typeof obj.data === "object" && obj.data !== null
        ? Object.fromEntries(
            Object.entries(obj.data as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])
          )
        : undefined;
    return {
      title: typeof obj.title === "string" ? obj.title : "IH35 Driver",
      body: typeof obj.body === "string" ? obj.body : "",
      tag: typeof obj.tag === "string" ? obj.tag : undefined,
      data,
    };
  }
  return { title: "IH35 Driver", body: "" };
}

export function resolvePushDeepLink(data?: Record<string, string>): string {
  const kind = String(data?.kind ?? "").trim();
  const loadId = String(data?.load_id ?? "").trim();
  const settlementId = String(data?.settlement_id ?? "").trim();
  const disputeId = String(data?.dispute_id ?? "").trim();

  if (kind === "load_assigned" || kind === "load_reassigned_away") {
    return loadId ? `/loads/${loadId}` : "/today";
  }
  if (kind === "settlement_available") {
    return settlementId ? `/earnings?settlement=${settlementId}` : "/earnings";
  }
  if (kind === "dispute_decided") {
    return disputeId ? `/my-disputes?highlight=${disputeId}` : "/my-disputes";
  }
  if (kind === "hos_warning") return "/hos";
  if (kind === "dispatch_message") return "/messages";
  return "/today";
}

export async function postPushAck(endpoint: string, tag?: string): Promise<void> {
  try {
    await fetch("/api/v1/driver/push-subscription/ack", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, tag: tag ?? null }),
    });
  } catch {
    // offline — ack is best-effort
  }
}

/** Page-side listener for SW navigation messages after notification click. */
export function installPushNavigationListener(onNavigate: (path: string) => void): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; path?: string } | null;
    if (data?.type === "ih35-push-navigate" && typeof data.path === "string") {
      onNavigate(data.path);
    }
    if (data?.type === "ih35-push-resubscribe") {
      void import("./web-push-subscriber.js").then((m) => {
        const vapid = m.readVapidPublicKeyFromEnv();
        if (vapid) void m.registerDriverPwaWebPush(vapid);
      });
    }
  });
}
