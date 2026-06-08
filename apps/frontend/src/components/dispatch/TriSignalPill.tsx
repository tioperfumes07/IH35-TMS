import { TriSignalHoverDetail, type TriSignalResult } from "../../pages/dispatch/TriSignalHoverDetail";

type Props = {
  signal: TriSignalResult | null | undefined;
  loading?: boolean;
};

function pillClass(signal: TriSignalResult["signal"]) {
  if (signal === "delayed") return "bg-red-100 text-red-700";
  if (signal === "behind") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function pillLabel(signal: TriSignalResult["signal"]) {
  if (signal === "delayed") return "DELAYED";
  if (signal === "behind") return "BEHIND";
  return "ON TRACK";
}

export function TriSignalPill({ signal, loading }: Props) {
  if (loading) {
    return <span className="text-[10px] text-gray-400">Signal …</span>;
  }
  if (!signal) {
    return <span className="text-[10px] text-gray-300">—</span>;
  }

  return (
    <span
      data-testid="tri-signal-pill"
      data-signal={signal.signal}
      className={`group relative inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(signal.signal)}`}
    >
      {pillLabel(signal.signal)}
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden min-w-[220px] rounded border border-slate-200 bg-white p-2 text-left shadow-lg group-hover:block">
        <TriSignalHoverDetail signal={signal} />
      </span>
    </span>
  );
}
