import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeSyncEvent, subscribeSyncState } from "../lib/upload-sync";

type SyncBarMode = "hidden" | "syncing" | "offline" | "error";

export function PendingSyncBar() {
  const { t } = useTranslation();
  const [pendingCount, setPendingCount] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState<"online" | "connecting" | "offline">(navigator.onLine ? "connecting" : "offline");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const unsubState = subscribeSyncState((state) => {
      setPendingCount(state.pendingCount);
      setOnlineStatus(state.onlineStatus);
      if (state.pendingCount === 0 && state.onlineStatus === "online") {
        setHasError(false);
      }
    });
    const unsubFailed = subscribeSyncEvent("itemFailed", () => setHasError(true));
    const unsubStarted = subscribeSyncEvent("syncStarted", () => setHasError(false));
    const onOnline = () => setOnlineStatus("connecting");
    const onOffline = () => setOnlineStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsubState();
      unsubFailed();
      unsubStarted();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  let mode: SyncBarMode = "hidden";
  if (hasError) mode = "error";
  else if (onlineStatus === "offline") mode = "offline";
  else if (pendingCount > 0) mode = "syncing";

  if (mode === "hidden") return null;

  const label =
    mode === "syncing"
      ? t("sync.syncing", { count: pendingCount })
      : mode === "offline"
        ? t("sync.offline_waiting", { count: pendingCount })
        : t("sync.error_retry");

  const className =
    mode === "syncing"
      ? "bg-[#1e40af] text-white"
      : mode === "offline"
        ? "bg-[#f59e0b] text-[#1f2a44]"
        : "bg-[#dc2626] text-white";

  return (
    <div className={`fixed bottom-[72px] left-0 right-0 z-30 h-8 ${className}`}>
      <div className="mx-auto flex h-full w-full max-w-md items-center px-4 text-xs font-semibold">{label}</div>
    </div>
  );
}
