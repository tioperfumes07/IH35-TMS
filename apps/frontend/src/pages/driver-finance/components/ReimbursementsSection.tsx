type Line = {
  id: string;
  date: string;
  description: string;
  receipt: string;
  amount: number;
};

type Props = { lines: Line[] };

export function ReimbursementsSection({ lines }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-blue-800">C. Reimbursements</h3>
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase text-gray-600">
          <tr><th>Date</th><th>Description</th><th>Receipt #</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-blue-100">
              <td className="py-1">{line.date}</td>
              <td>{line.description}</td>
              <td><button type="button" className="text-blue-700 underline">{line.receipt}</button></td>
              <td>${Number(line.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
