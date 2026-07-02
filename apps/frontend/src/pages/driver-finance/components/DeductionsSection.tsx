import { Button } from "../../../components/Button";

export type DeductionRow = {
  id: string;
  description: string;
  balance_left: number;
  this_period_amount: number;
  is_held?: boolean;
  held_by_user?: string | null;
  pending_ack?: boolean;
};

type Props = {
  rows: DeductionRow[];
  onHold: (row: DeductionRow) => void;
};

export function DeductionsSection({ rows, onHold }: Props) {
  const subtotal = rows.reduce((sum, row) => sum + Number(row.pending_ack ? 0 : row.this_period_amount || 0), 0);
  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-700">D. Deductions</h3>
      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded border px-2 py-1 text-xs ${
              row.is_held
                ? "border-amber-300 bg-amber-100"
                : row.pending_ack
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div>
              <div className="font-semibold">{row.description}</div>
              {row.pending_ack ? <div className="text-amber-700">PENDING ACK</div> : null}
              {row.is_held ? <div className="text-amber-700">HELD by {row.held_by_user ?? "user"}</div> : null}
            </div>
            <div>Bal ${Number(row.balance_left).toFixed(2)}</div>
            <div className={row.is_held ? "line-through" : ""}>${Number(row.pending_ack ? 0 : row.this_period_amount).toFixed(2)}</div>
            <Button size="sm" variant="secondary" onClick={() => onHold(row)}>
              Hold
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs font-semibold">Applied deductions this period: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
