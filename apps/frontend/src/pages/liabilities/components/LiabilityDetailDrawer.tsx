import { holdLiability, markLiabilityPaidOff, resumeLiability, voidLiability } from "../../../api/liabilities";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  liability: Record<string, unknown> | null;
  onClose: () => void;
  onUpdated: () => void;
};

// LIABILITY column-wave: views.liabilities_active_with_context previously dropped origin/origin_id
// entirely, so this reverse-link was architecturally impossible regardless of frontend code — fixed
// alongside this render in db/migrations/202608120900_liabilities_view_reverse_link_columns.sql.
// Every leaf that spawns a liability writes a distinct origin string; map it to the matching
// EntityLink kind (added `internal_fine` in this same commit — it didn't exist before).
const ORIGIN_TO_ENTITY_KIND: Record<string, "safety_fine" | "internal_fine" | "cash_advance" | "accident"> = {
  safety_fine: "safety_fine",
  internal_fine: "internal_fine",
  cash_advance: "cash_advance",
  safety_accident: "accident",
};

export function LiabilityDetailDrawer({ open, operatingCompanyId, liability, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  if (!open || !liability) return null;
  const id = String(liability.id ?? "");
  const settlementHistory = (liability.settlement_history as Array<Record<string, unknown>> | undefined) ?? [];
  const origin = liability.origin ? String(liability.origin) : null;
  const originId = liability.origin_id ? String(liability.origin_id) : null;
  const originKind = origin ? ORIGIN_TO_ENTITY_KIND[origin] : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Liability Detail</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-2">
          <div>
            Driver:{" "}
            <EntityLink
              kind="driver"
              id={liability.driver_id ? String(liability.driver_id) : null}
              label={entityLabel(
                liability.driver_full_name ? String(liability.driver_full_name) : null,
                liability.driver_id ? String(liability.driver_id) : null,
                "Driver"
              )}
            />
          </div>
          <div>Type: {String(liability.type ?? "—")}</div>
          <div>Source: {String(liability.source_description ?? "—")}</div>
          <div>Original: ${Number(liability.original_amount ?? 0).toFixed(2)}</div>
          <div>Paid: ${Number(liability.paid_to_date ?? 0).toFixed(2)}</div>
          <div>Balance: ${Number(liability.current_balance ?? 0).toFixed(2)}</div>
          <div>Scheduled deduction: ${Number(liability.scheduled_deduction ?? 0).toFixed(2)}</div>
          <div>
            Caused by:{" "}
            {originId && originKind ? (
              <EntityLink kind={originKind} id={originId} label={entityLabel(null, originId, origin ?? "Source")} />
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="font-semibold">Acknowledgment / Forfeiture</div>
          <div>Status: {Boolean(liability.requires_acknowledgment) && !liability.acknowledgment_uuid ? "Pending Ack" : "Acknowledged/Not required"}</div>
          <div>Forfeiture clause: {Boolean(liability.forfeiture_clause_active) ? "Active" : "Not active"}</div>
          <div>Signed at: {String(liability.forfeiture_clause_signed_at ?? "n/a")}</div>
        </div>
        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Settlement History (reverse-link)</div>
          {liability.settlement_history_is_driver_level ? (
            <div className="mb-1 text-xs text-gray-500">
              Driver-level settlement deductions (exact per-liability attribution is a HOLD — see REMAINING in the
              PR).
            </div>
          ) : null}
          <div className="space-y-1">
            {settlementHistory.map((row) => (
              <div key={String(row.settlement_id ?? row.id)} className="rounded-sm border border-gray-100 px-2 py-1">
                Settlement{" "}
                <EntityLink
                  kind="settlement"
                  id={row.settlement_id ? String(row.settlement_id) : null}
                  label={entityLabel(null, row.settlement_id ? String(row.settlement_id) : null, "Settlement")}
                />{" "}
                ·
                ${Number(row.amount ?? 0).toFixed(2)}
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
                .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
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
                .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
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
                .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
            }
          >
            Mark Paid Off
          </Button>
          {
            // ACCT-SETL-LIAB-VOID-GAP — reason prompt required, always, matching this app's existing
            // reversal-reason-capture precedent (SettlementDetailPage.tsx's handleReverseSettlement).
          }
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              const reason = window.prompt("Reason for voiding this liability (required):", "");
              if (reason == null) return;
              const trimmed = reason.trim();
              if (!trimmed) {
                pushToast("A reason is required to void a liability", "error");
                return;
              }
              void voidLiability(id, operatingCompanyId, trimmed)
                .then(() => {
                  pushToast("Liability voided", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"));
            }}
          >
            Void
          </Button>
        </div>
      </aside>
    </>
  );
}
