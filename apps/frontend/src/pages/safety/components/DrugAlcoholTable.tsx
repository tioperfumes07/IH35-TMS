type Props = {
  rows: Array<Record<string, unknown>>;
};

export function DrugAlcoholTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[750px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1">Test Date</th>
            <th className="px-2 py-1">Driver</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)} className="border-t border-gray-100">
              <td className="px-2 py-1">{String(row.test_date ?? "").slice(0, 10)}</td>
              <td className="px-2 py-1">{String(row.driver_id ?? "—")}</td>
              <td className="px-2 py-1">{String(row.test_type ?? "—")}</td>
              <td className="px-2 py-1">{String(row.result ?? "—")}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-500">No D/A test records.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
