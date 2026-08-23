function fmtMin(min: number | undefined | null) {
  if (min == null || Number.isNaN(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

// HOS-PRC-DATA / HOS-PRC2 (Jorge 2026-07-05) — shape of the certified Samsara ELD snapshot attached
// by driver-aggregate.service.ts. Verbatim, no re-derivation.
type EldCertified = {
  drive_remaining_min: number | null;
  shift_remaining_min: number | null;
  cycle_remaining_min: number | null;
  break_remaining_min: number | null;
  violation: boolean;
  polled_at: string;
} | null;

export function HOSStatusSection({ hos, unavailable = false }: { hos: Record<string, unknown> | null; unavailable?: boolean }) {
  if (!hos) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">HOS status</h2>
        <p className={`text-xs ${unavailable ? "text-red-700" : "text-slate-500"}`}>
          {unavailable ? "ELD / HOS data could not be loaded." : "ELD / HOS data not available for this driver."}
        </p>
      </section>
    );
  }

  // HOS-PRC2: the certified Samsara ELD snapshot is the single source of truth when present — the
  // SAME numbers the dispatch board shows for this driver (board == roster == certified ELD). Falls
  // back to the in-app recompute only when Samsara has never polled this driver.
  const eld = (hos.eld_certified ?? null) as EldCertified;
  const drive = eld ? eld.drive_remaining_min : (hos.drive_remaining_min as number | null | undefined);
  const onDuty = eld ? eld.shift_remaining_min : (hos.on_duty_remaining_min as number | null | undefined);
  const cycle = eld ? eld.cycle_remaining_min : (hos.cycle_remaining_min as number | null | undefined);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        HOS status
        {eld ? (
          <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3px] text-emerald-700">
            Certified ELD
          </span>
        ) : null}
      </h2>
      <p className="mb-2 text-xs capitalize text-slate-700">
        {String(hos.current_status ?? "—").replace(/_/g, " ")} · ELD {String(hos.eld_device_status ?? "—")}
      </p>
      <div className="grid gap-2 text-xs md:grid-cols-3">
        <div className="rounded-sm border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">Drive remaining</div>
          <div>{fmtMin(drive)}</div>
        </div>
        <div className="rounded-sm border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">On-duty window</div>
          <div>{fmtMin(onDuty)}</div>
        </div>
        <div className="rounded-sm border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">Cycle remaining</div>
          <div>{fmtMin(cycle)}</div>
        </div>
      </div>
      {eld?.polled_at ? (
        <p className="mt-2 text-xs text-slate-500">Certified ELD polled {String(eld.polled_at)}</p>
      ) : hos.last_log_update_at ? (
        <p className="mt-2 text-xs text-slate-500">Last log {String(hos.last_log_update_at)}</p>
      ) : null}
    </section>
  );
}
