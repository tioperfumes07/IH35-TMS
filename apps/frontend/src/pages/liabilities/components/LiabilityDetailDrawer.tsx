import { holdLiability, markLiabilityPaidOff, resumeLiability } from "../../../api/liabilities";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  liability: Record<string, unknown> | null;
  onClose: () => void;
  onUpdated: () => void;
};

export function LiabilityDetailDrawer({ open, operatingCompanyId, liability, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  if (!open || !liability) return null;
  const id = String(liability.id ?? "");
  const settlementHistory = (liability.settlement_history as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Liability Detail</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2">
          <div>Type: {String(liability.type ?? "—")}</div>
          <div>Source: {String(liability.source_description ?? "—")}</div>
          <div>Original: ${Number(liability.original_amount ?? 0).toFixed(2)}</div>
          <div>Paid: ${Number(liability.paid_to_date ?? 0).toFixed(2)}</div>
          <div>Balance: ${Number(liability.current_balance ?? 0).toFixed(2)}</div>
          <div>Scheduled deduction: ${Number(liability.scheduled_deduction ?? 0).toFixed(2)}</div>
        </div>
        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="font-semibold">Acknowledgment / Forfeiture</div>
          <div>Status: {Boolean(liability.requires_acknowledgment) && !liability.acknowledgment_uuid ? "Pending Ack" : "Acknowledged/Not required"}</div>
          <div>Forfeiture clause: {Boolean(liability.forfeiture_clause_active) ? "Active ✓" : "Not active"}</div>
          <div>Signed at: {String(liability.forfeiture_clause_signed_at ?? "n/a")}</div>
        </div>
        <div className="mt-2 rounded border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Settlement History (reverse-link)</div>
          <div className="space-y-1">
            {settlementHistory.map((row) => (
              <div key={String(row.settlement_id ?? row.id)} className="rounded border border-gray-100 px-2 py-1">
                Settlement {String(row.settlement_id ?? "—")} · ${Number(row.amount ?? 0).toFixed(2)}
              </div>
            ))}
            {settlementHistory.length === 0 ? <div className="text-gray-500">No settlement deductions yet.</div> : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void holdLiability(id, operatingCompanyId, "Held from liability detail drawer")
                .then(() => {
                  pushToast("Liability held", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Hold
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void resumeLiability(id, operatingCompanyId)
                .then(() => {
                  pushToast("Liability resumed", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Resume
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void markLiabilityPaidOff(id, operatingCompanyId)
                .then(() => {
                  pushToast("Liability marked paid off", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Mark Paid Off
          </Button>
        </div>
      </aside>
    </>
  );
}
