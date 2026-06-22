function statusClass(status: string | undefined) {
  if (status === "red") return "text-red-700";
  if (status === "yellow") return "text-yellow-700";
  if (status === "green") return "text-green-700";
  return "text-gray-600";
}

export function TrainingRecordsSection({
  records,
  onAddTraining,
}: {
  records: Array<Record<string, unknown>>;
  onAddTraining?: () => void;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Training records</h2>
        <button
          type="button"
          className="text-xs text-slate-700 underline disabled:cursor-not-allowed disabled:text-gray-400"
          data-testid="dp-add-training"
          onClick={onAddTraining}
          disabled={!onAddTraining}
        >
          + Add training
        </button>
      </div>
      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-gray-500">
            <th>Type</th>
            <th>Completed</th>
            <th>Expiration</th>
            <th>Certificate</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-gray-500">
                No training records.
              </td>
            </tr>
          ) : (
            records.map((row, idx) => (
              <tr key={`${row.type}-${idx}`} className="border-t border-gray-100">
                <td className="py-1">{String(row.type ?? "—")}</td>
                <td>{String(row.completion_date ?? "—").slice(0, 10)}</td>
                <td className={statusClass(String(row.status))}>{String(row.expiration_date ?? "—")}</td>
                <td>{row.certificate_url ? "On file" : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
