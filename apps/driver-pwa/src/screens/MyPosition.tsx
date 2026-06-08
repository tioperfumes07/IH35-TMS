import { useEffect, useState } from "react";

type Position = { lat: number; lng: number; speed_mph: number | null; recorded_at: string; stale: boolean };

export function MyPositionScreen() {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed_mph: pos.coords.speed != null ? pos.coords.speed * 2.23694 : null,
          recorded_at: new Date(pos.timestamp).toISOString(),
          stale: false,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  return (
    <div className="p-4 space-y-2" data-testid="my-position-screen">
      <h1 className="text-lg font-semibold">My Position</h1>
      {position ? (
        <>
          <p className="text-sm">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>
          <p className="text-sm">Speed: {position.speed_mph?.toFixed(1) ?? "—"} mph</p>
          <p className="text-xs text-slate-500">Updated {new Date(position.recorded_at).toLocaleTimeString()}</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Waiting for GPS…</p>
      )}
    </div>
  );
}
