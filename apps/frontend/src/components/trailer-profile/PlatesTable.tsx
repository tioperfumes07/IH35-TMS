export function PlatesTable({ plates }: { plates: Array<Record<string, unknown>> }) {
  return (
    <table className="mt-3 w-full text-left text-xs" data-testid="tp-plates-table">
      <thead>
        <tr className="text-gray-500">
          <th>Country</th>
          <th>Jurisdiction</th>
          <th>Plate</th>
          <th>Expiration</th>
        </tr>
      </thead>
      <tbody>
        {plates.length === 0 ? (
          <tr>
            <td colSpan={4} className="py-2 text-gray-500">
              No plates on file.
            </td>
          </tr>
        ) : (
          plates.map((p) => (
            <tr key={String(p.id)} className="border-t border-gray-100">
              <td className="py-1">{String(p.country ?? "—")}</td>
              <td>{String(p.jurisdiction ?? "—")}</td>
              <td>{String(p.plate_number ?? "—")}</td>
              <td>{String(p.expiration ?? "—")}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
