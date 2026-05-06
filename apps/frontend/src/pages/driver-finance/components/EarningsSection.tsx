type Line = {
  id: string;
  description: string;
  miles?: number;
  rate?: number;
  amount: number;
};

type Props = {
  lines: Line[];
};

export function EarningsSection({ lines }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalMiles = lines.reduce((sum, line) => sum + Number(line.miles || 0), 0);
  return (
    <section className="rounded border border-green-200 bg-green-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-green-800">A. Earnings</h3>
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase text-gray-600">
          <tr><th>Load</th><th>Description</th><th>Miles</th><th>Rate</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-green-100">
              <td className="py-1">{line.id}</td>
              <td>{line.description}</td>
              <td>{line.miles ?? "—"}</td>
              <td>{line.rate ?? "—"}</td>
              <td>${Number(line.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)} · Miles: {totalMiles}</div>
    </section>
  );
}
