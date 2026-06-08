export type TriSignalKind = "on_track" | "behind" | "delayed";

export type TriSignalResult = {
  load_uuid: string;
  signal: TriSignalKind;
  reason: string;
  slip_minutes: number | null;
  hos_remaining_minutes: number | null;
  driver_ack_age_minutes: number | null;
};

function fmtMinutes(value: number | null) {
  if (value == null) return "—";
  return `${value} min`;
}

export function TriSignalHoverDetail({ signal }: { signal: TriSignalResult }) {
  return (
    <div className="space-y-1 text-[11px] text-slate-700" data-testid="tri-signal-hover-detail">
      <div className="font-semibold text-slate-900">{signal.reason}</div>
      <div>ETA slip: {fmtMinutes(signal.slip_minutes)}</div>
      <div>HOS remaining: {fmtMinutes(signal.hos_remaining_minutes)}</div>
      <div>Driver ack age: {fmtMinutes(signal.driver_ack_age_minutes)}</div>
    </div>
  );
}
