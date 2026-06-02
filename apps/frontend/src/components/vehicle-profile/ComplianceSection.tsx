export function ComplianceSection({ compliance }: { compliance: Record<string, unknown> }) {
  const us = (compliance.us_insurance as Record<string, unknown>) ?? {};
  const mx = (compliance.mx_insurance as Record<string, unknown>) ?? {};
  const plates = (compliance.registration_plates as Array<Record<string, unknown>>) ?? [];
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Compliance</h3>
      <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
        <div className={`rounded p-2 ${colorClass(us.color as string)}`}>
          US insurance · exp {String(us.expiration ?? "—")} ({String(us.days_until_expiration ?? "—")}d)
        </div>
        <div className={`rounded p-2 ${colorClass(mx.color as string)}`}>
          MX insurance · exp {String(mx.expiration ?? "—")} ({String(mx.days_until_expiration ?? "—")}d)
        </div>
        <div>DOT inspection: {String((compliance.dot_inspection as Record<string, unknown>)?.next_due ?? "—")}</div>
        <div>SCT: {String((compliance.sct_permit as Record<string, unknown>)?.number ?? "—")}</div>
        <div>PITA: {String((compliance.pita as Record<string, unknown>)?.status ?? "—")}</div>
        <div>IFTA filed: {String(compliance.ifta_current_quarter_filed ? "yes" : "no")}</div>
      </div>
      {plates.length > 0 ? (
        <table className="mt-3 min-w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="px-2 py-1 text-left">Country</th>
              <th className="px-2 py-1 text-left">Jurisdiction</th>
              <th className="px-2 py-1 text-left">Expiration</th>
            </tr>
          </thead>
          <tbody>
            {plates.map((p, idx) => (
              <tr key={idx} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(p.country)}</td>
                <td className="px-2 py-1">{String(p.jurisdiction)}</td>
                <td className="px-2 py-1">{String(p.expiration ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function colorClass(color: string | undefined) {
  if (color === "red") return "bg-red-50 text-red-900";
  if (color === "yellow") return "bg-yellow-50 text-yellow-900";
  if (color === "green") return "bg-green-50 text-green-900";
  return "bg-gray-50 text-gray-700";
}
