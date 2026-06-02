export function MaintenanceSnapshotSection({ maintenance }: { maintenance: Record<string, unknown> }) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Maintenance snapshot</h2>
      <p className="mt-2 text-xs text-gray-700">Open work orders: {String(maintenance.open_wo_count ?? 0)}</p>
      <p className="text-xs text-gray-700">
        Next PM: {String((maintenance.next_pm_due as { label?: string })?.label ?? "—")}
      </p>
      <p className="text-xs text-gray-700">
        Last service: {String((maintenance.last_service as { date?: string })?.date ?? "—")}
      </p>
    </section>
  );
}
