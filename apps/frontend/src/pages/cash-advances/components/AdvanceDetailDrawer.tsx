import { reverseCashAdvance } from "../../../api/cashAdvances";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  advance: Record<string, unknown> | null;
  onClose: () => void;
  onUpdated: () => void;
  onMarkDisbursed: () => void;
};

export function AdvanceDetailDrawer({ open, operatingCompanyId, advance, onClose, onUpdated, onMarkDisbursed }: Props) {
  const { pushToast } = useToast();
  if (!open || !advance) return null;
  const schedule = (advance.deduction_schedule as Array<Record<string, unknown>> | undefined) ?? [];
  const settlements = (advance.settlement_history as Array<Record<string, unknown>> | undefined) ?? [];
  const status = String(advance.disbursement_status ?? "pending_approval");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Cash Advance Detail</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2">
          <div>ID: {String(advance.display_id ?? "—")}</div>
          <div>Amount: ${Number(advance.amount ?? 0).toFixed(2)}</div>
          <div>Purpose: {String(advance.purpose ?? "—")}</div>
          <div>Method: {String(advance.disbursement_method ?? "—")}</div>
          <div>Status: {status}</div>
        </div>

        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="font-semibold">Driver + Recipient</div>
          <div>Driver: {String(advance.driver_full_name ?? "—")}</div>
          <div>Recipient: {String(advance.recipient_name ?? "Driver")}</div>
          <div>Outstanding: ${Number(advance.outstanding_balance ?? 0).toFixed(2)}</div>
          <div>Liability ID: {String(advance.liability_id ?? "—")}</div>
        </div>

        <div className="mt-2 rounded border border-slate-300 bg-slate-100 p-2">
          <div className="font-semibold">Disbursement Timeline</div>
          <div>Created: {String(advance.created_at ?? "—")}</div>
          <div>Approved: {String(advance.approved_at ?? "—")}</div>
          <div>Disbursed: {String(advance.disbursed_at ?? "—")}</div>
        </div>

        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="font-semibold">Linked Bill</div>
          {advance.linked_bill_id ? (
            <>
              <div>
                Linked to bill {String(advance.linked_bill_display_id ?? advance.linked_bill_id)} ({String(advance.linked_bill_vendor_id ?? "vendor")})
              </div>
              <a className="text-slate-700 underline" href={`/bills/${String(advance.linked_bill_id)}`}>
                Open bill detail
              </a>
            </>
          ) : (
            <div className="text-gray-500">No linked bill.</div>
          )}
        </div>

        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="font-semibold">Linked Bank Transaction</div>
          <div>{String(advance.linked_bank_txn_id ?? "No bank transaction linked yet.")}</div>
        </div>

        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Deduction Schedule</div>
          {schedule.length === 0 ? <div className="text-gray-500">No schedule rows.</div> : null}
          {schedule.map((row) => (
            <div key={String(row.id)} className="rounded border border-gray-100 px-2 py-1">
              {String(row.cadence ?? "weekly")} · ${Number(row.amount_per_period ?? 0).toFixed(2)} · periods {Number(row.total_periods ?? 0)}
            </div>
          ))}
        </div>

        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Settlement Deductions Applied</div>
          {settlements.length === 0 ? <div className="text-gray-500">No settlement deductions yet.</div> : null}
          {settlements.map((row) => (
            <div key={String(row.settlement_id ?? row.id)} className="rounded border border-gray-100 px-2 py-1">
              Settlement {String(row.settlement_id ?? "—")} · ${Number(row.amount ?? 0).toFixed(2)}
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => pushToast("Edit flow pending", "info")}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (status === "disbursed" || status === "reversed") return;
              onMarkDisbursed();
            }}
          >
            Mark Disbursed
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              void reverseCashAdvance(String(advance.id), operatingCompanyId)
                .then(() => {
                  pushToast("Advance reversed", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Reverse
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            Print Receipt
          </Button>
        </div>
      </aside>
    </>
  );
}
