import { useEffect, useState } from "react";
import { driverOfflineQueueCount, replayDriverOfflineQueue } from "../../lib/driver-offline-queue";

export function DriverOfflineBanner() {
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    const tick = async () => {
      const n = await driverOfflineQueueCount();
      if (!canceled) setCount(n);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    const onOnline = () => {
      void (async () => {
             const res = await replayDriverOfflineQueue();
             if (!canceled && res.failed > 0) setFailed(true);
             await tick();
           })();
    };
    window.addEventListener("online", onOnline);
    return () => {
      canceled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (count <= 0 && !failed) return null;

  return (
    <div
      className={`mb-2 rounded border px-2 py-1 text-xs ${failed ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
      role="status"
    >
      {failed ? (
        <div className="flex items-center justify-between gap-2">
          <span>Failed to sync — retry?</span>
          <button
            type="button"
            className="rounded border border-red-400 px-2 py-0.5"
            onClick={() => {
              setFailed(false);
              void (async () => {
                const res = await replayDriverOfflineQueue();
                if (res.failed > 0) setFailed(true);
                setCount(await driverOfflineQueueCount());
              })();
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <span>{`${count} action${count === 1 ? "" : "s"} queued offline — will sync when online`}</span>
      )}
    </div>
  );
}
