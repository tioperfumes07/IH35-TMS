type Line = {
  id: string;
  code: string;
  description: string;
  amount: number;
};

type Props = { lines: Line[] };

export function ExtraPaySection({ lines }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return (
    <section className="rounded border border-slate-300 bg-slate-100 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-700">B. Extra Pay</h3>
      <div className="space-y-1 text-xs">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center justify-between rounded border border-slate-300 bg-white px-2 py-1">
            <span>{line.code} · {line.description}</span>
            <span className="font-semibold">${Number(line.amount).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
