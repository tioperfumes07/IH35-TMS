import { useEffect } from "react";
import { useToast } from "./Toast";

const STORAGE_KEY = "ih35:postReloadToast";

export type PostReloadToastPayload = { message: string; kind?: "success" | "error" | "info" };

export function setPostReloadToast(payload: PostReloadToastPayload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Call once under ToastProvider to surface messages after `location.reload()`. */
export function PostReloadToastHost() {
  const { pushToast } = useToast();

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    try {
      const parsed = JSON.parse(raw) as PostReloadToastPayload;
      pushToast(parsed.message, parsed.kind === "error" ? "error" : parsed.kind === "info" ? "info" : "success");
    } catch {
      pushToast("Workspace reloaded", "info");
    }
  }, [pushToast]);

  return null;
}
