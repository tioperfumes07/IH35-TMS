function fmtMin(min: number | undefined) {
  if (min == null || Number.isNaN(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

export function HOSStatusSection({ hos }: { hos: Record<string, unknown> | null }) {
  if (!hos) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">HOS status</h2>
        <p className="text-xs text-slate-500">ELD / HOS data not available for this driver.</p>
      </section>
    );
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">HOS status</h2>
      <p className="mb-2 text-xs capitalize text-slate-700">
        {String(hos.current_status ?? "—").replace(/_/g, " ")} · ELD {String(hos.eld_device_status ?? "—")}
      </p>
      <div className="grid gap-2 text-xs md:grid-cols-3">
        <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">Drive remaining</div>
          <div>{fmtMin(hos.drive_remaining_min as number)}</div>
        </div>
        <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">On-duty window</div>
          <div>{fmtMin(hos.on_duty_remaining_min as number)}</div>
        </div>
        <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="font-semibold">Cycle remaining</div>
          <div>{fmtMin(hos.cycle_remaining_min as number)}</div>
        </div>
      </div>
      {hos.last_log_update_at ? (
        <p className="mt-2 text-xs text-slate-500">Last log {String(hos.last_log_update_at)}</p>
      ) : null}
    </section>
  );
}
