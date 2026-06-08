import { Link } from "react-router-dom";

export type LivePosition = {
  lat: number;
  lng: number;
  recorded_at: string;
  stale: boolean;
  speed_mph?: number | null;
};

export function LoadLivePositionCell({ position, loadId }: { position: LivePosition | null; loadId: string }) {
  if (!position) return <span className="text-[10px] text-slate-400">No GPS</span>;
  return (
    <div className="flex flex-col gap-0.5 text-[10px]" data-testid="load-live-gps-cell">
      <span className={position.stale ? "text-red-600 font-semibold" : "text-emerald-700"}>
        {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
        {position.stale ? " (stale)" : ""}
      </span>
      <span className="text-slate-500">{new Date(position.recorded_at).toLocaleTimeString()}</span>
      <Link to={`/dispatch/map?load=${loadId}`} className="text-[#1f2a44] underline">View map</Link>
    </div>
  );
}
