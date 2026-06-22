const STATUS_LABELS: Record<string, string> = {
  InService: "Active",
  OutOfService: "OOS",
  InMaintenance: "Maintenance",
  Sold: "Sold",
  Damaged: "Damaged",
  Transferred: "Transferred",
  Lost: "Lost",
};

export function IdentityStatusHeader({
  equipment,
  onChangeStatus,
}: {
  equipment: Record<string, unknown>;
  onChangeStatus?: (nextStatus?: string) => void;
}) {
  const status = String(equipment.status ?? "—");
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{String(equipment.equipment_number ?? "Trailer")}</h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">{String(equipment.equipment_type ?? "—")}</span>
        <label className="text-xs text-gray-600">
          Status
          <select
            className="ml-1 rounded border px-2 py-0.5 text-xs font-medium text-slate-700"
            value={status}
            onChange={(e) => onChangeStatus?.(e.target.value)}
            data-testid="tp-status-badge-dropdown"
          >
            <option value={status}>{STATUS_LABELS[status] ?? status}</option>
            <option value="__change__">Change status…</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-600">VIN: {String(equipment.vin ?? "—")} · Year: {String(equipment.year ?? "—")}</p>
    </section>
  );
}
