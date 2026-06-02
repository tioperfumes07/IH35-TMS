export function IdentityStatusHeader({ equipment }: { equipment: Record<string, unknown> }) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{String(equipment.equipment_number ?? "Trailer")}</h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">{String(equipment.equipment_type ?? "—")}</span>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">{String(equipment.status ?? "—")}</span>
      </div>
      <p className="mt-2 text-xs text-gray-600">VIN: {String(equipment.vin ?? "—")} · Year: {String(equipment.year ?? "—")}</p>
    </section>
  );
}
