import { Button } from "../../../components/Button";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

export type DeductionRow = {
  id: string;
  description: string;
  balance_left: number;
  this_period_amount: number;
  is_held?: boolean;
  held_by_user?: string | null;
  held_by_user_id?: string | null;
  pending_ack?: boolean;
  /**
   * HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID: the real driver_finance.driver_settlement_deductions
   * id this line was generated from, resolved server-side via source_table/source_reference_id.
   * null when the line predates that linkage or was composed by a manual/legacy settlement path
   * with no backing deduction record — Hold is not offered in that case (there is nothing real to
   * hold), rather than sending this settlement-LINE id to a PATCH that can never find it.
   */
  source_deduction_id?: string | null;
};

type Props = {
  rows: DeductionRow[];
  onHold: (row: DeductionRow) => void;
  onResume?: (row: DeductionRow) => void;
};

export function DeductionsSection({ rows, onHold, onResume }: Props) {
  const subtotal = rows.reduce((sum, row) => sum + Number(row.pending_ack ? 0 : row.this_period_amount || 0), 0);
  return (
    <section className="rounded-sm border border-slate-200 bg-slate-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-700">D. Deductions</h3>
      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded border px-2 py-1 text-xs ${
              row.is_held
                ? "border-slate-300 bg-slate-100"
                : row.pending_ack
                ? "border-slate-200 bg-slate-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div>
              <div className="font-semibold">{row.description}</div>
              {row.pending_ack ? <div className="text-slate-700">PENDING ACK</div> : null}
              {row.is_held ? (
                <div className="text-slate-700">
                  HELD by{" "}
                  <EntityLinkOrTombstone
                    kind="user"
                    id={row.held_by_user_id}
                    name={row.held_by_user}
                    noun="User"
                  />
                </div>
              ) : null}
            </div>
            <div>Bal ${Number(row.balance_left).toFixed(2)}</div>
            <div className={row.is_held ? "line-through" : ""}>${Number(row.pending_ack ? 0 : row.this_period_amount).toFixed(2)}</div>
            {row.is_held ? (
              <Button size="sm" variant="secondary" onClick={() => onResume?.(row)} disabled={!onResume}>
                Resume
              </Button>
            ) : row.source_deduction_id ? (
              <Button size="sm" variant="secondary" onClick={() => onHold(row)}>
                Hold
              </Button>
            ) : (
              <span className="text-slate-400" title="No linked deduction record to hold">
                —
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs font-semibold">Applied deductions this period: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
