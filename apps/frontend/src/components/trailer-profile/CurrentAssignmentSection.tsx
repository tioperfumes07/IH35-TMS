export function CurrentAssignmentSection({ assignment }: { assignment: Record<string, unknown> }) {
  const unit = assignment.attached_to_unit as Record<string, unknown> | null;
  const load = assignment.current_load as Record<string, unknown> | null;
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Current assignment</h2>
      <p className="mt-2 text-xs text-gray-700">
        Attached truck: {unit ? `${unit.unit_number ?? unit.unit_id}` : "None"}
      </p>
      <p className="text-xs text-gray-700">
        Current load: {load ? `${load.load_number ?? load.load_id} (${load.status ?? "—"})` : "None"}
      </p>
    </section>
  );
}
