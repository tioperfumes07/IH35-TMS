import { reverseCashAdvance } from "../../../api/cashAdvances";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { printLetterHtml } from "../../../lib/openPrintableDocument";
import { userFacingApiError } from "../../../lib/api-error-message";
import { DocumentsTab } from "../../../components/documents/DocumentsTab";

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
  const markDisbursedBlocked = status === "disbursed" || status === "reversed";
  const markDisbursedBlockedReason = markDisbursedBlocked
    ? `Already ${status} — Mark Disbursed is not available`
    : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Cash Advance Detail</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-2">
          <div>ID: {String(advance.display_id ?? "—")}</div>
          <div>Amount: ${Number(advance.amount ?? 0).toFixed(2)}</div>
          <div>Purpose: {String(advance.purpose ?? "—")}</div>
          <div>Method: {String(advance.disbursement_method ?? "—")}</div>
          <div>Status: {status}</div>
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="font-semibold">Driver + Recipient</div>
          <div>
            Driver:{" "}
            <EntityLink
              kind="driver"
              id={advance.driver_id ? String(advance.driver_id) : null}
              label={entityLabel(
                advance.driver_full_name ? String(advance.driver_full_name) : null,
                advance.driver_id ? String(advance.driver_id) : null,
                "Driver"
              )}
            />
          </div>
          <div>Recipient: {String(advance.recipient_name ?? "Driver")}</div>
          <div>Outstanding: ${Number(advance.outstanding_balance ?? 0).toFixed(2)}</div>
          <div>
            Liability ID:{" "}
            {advance.liability_id ? (
              <EntityLink kind="liability" id={String(advance.liability_id)} label={entityLabel(null, String(advance.liability_id), "Liability")} />
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="mt-2 rounded-sm border border-slate-300 bg-slate-100 p-2">
          <div className="font-semibold">Disbursement Timeline</div>
          <div>Created: {String(advance.created_at ?? "—")}</div>
          <div>Approved: {String(advance.approved_at ?? "—")}</div>
          <div>Disbursed: {String(advance.disbursed_at ?? "—")}</div>
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          {/*
           * ACCT-F5408 — views.cash_advances_with_context now selects a.load_id/load_display_id;
           * this was always missing at the view layer, not a data gap — CreateAdvanceModal.tsx has
           * required load_id for purpose=lumper/fuel_deposit all along.
           */}
          <div className="font-semibold">Linked Load</div>
          {advance.load_id ? (
            <EntityLink
              kind="load"
              id={String(advance.load_id)}
              label={entityLabel(advance.load_display_id ? String(advance.load_display_id) : null, String(advance.load_id), "Load")}
            />
          ) : (
            <div className="text-gray-500">No load linked to this advance.</div>
          )}
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="font-semibold">Linked Bill</div>
          {advance.linked_bill_id ? (
            <>
              <div>
                Linked to bill {entityLabel(advance.linked_bill_display_id, advance.linked_bill_id, "Bill")} ({entityLabel(null, String(advance.linked_bill_vendor_id ?? ""), "Vendor")})
              </div>
              <EntityLink
                kind="bill"
                id={String(advance.linked_bill_id)}
                label={entityLabel(advance.linked_bill_display_id, advance.linked_bill_id, "Bill")}
              />
            </>
          ) : (
            <div className="text-gray-500">No linked bill.</div>
          )}
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="font-semibold">Linked Bank Transaction</div>
          {advance.linked_bank_txn_id ? (
            <EntityLink kind="bank_transaction" id={String(advance.linked_bank_txn_id)} label={entityLabel(null, String(advance.linked_bank_txn_id), "Bank transaction")} />
          ) : (
            <div className="text-gray-500">No bank transaction linked yet.</div>
          )}
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          {/* GO-21 B8 (owner 2026-09-02) — "receipt/confirmation upload into docs.files, linked
              both ways." Reuses the SAME DocumentsTab every other entity already uses; no new
              upload UI, no restyling — this is CC-1 money-lane scope, not J1's. */}
          <DocumentsTab
            entityType="cash_advance"
            entityId={String(advance.id)}
            entityName={String(advance.display_id ?? advance.id ?? "Cash advance")}
            operatingCompanyId={operatingCompanyId}
          />
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Deduction Schedule</div>
          {schedule.length === 0 ? <div className="text-gray-500">No schedule rows.</div> : null}
          {schedule.map((row) => (
            <div key={String(row.id)} className="rounded-sm border border-gray-100 px-2 py-1">
              {String(row.cadence ?? "weekly")} · ${Number(row.amount_per_period ?? 0).toFixed(2)} · periods {Number(row.total_periods ?? 0)}
            </div>
          ))}
        </div>

        <div className="mt-2 rounded-sm border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Settlement Deductions Applied</div>
          {advance.settlement_history_is_driver_level ? (
            <div className="mb-1 text-xs text-gray-500">
              Driver-level cash-advance repayment deductions (exact per-advance attribution is a HOLD — see
              REMAINING in the PR).
            </div>
          ) : null}
          {settlements.length === 0 ? <div className="text-gray-500">No settlement deductions yet.</div> : null}
          {settlements.map((row) => (
            <div key={String(row.settlement_id ?? row.id)} className="rounded-sm border border-gray-100 px-2 py-1">
              Settlement{" "}
              <EntityLink
                kind="settlement"
                id={row.settlement_id ? String(row.settlement_id) : null}
                label={entityLabel(null, row.settlement_id ? String(row.settlement_id) : null, "Settlement")}
              /> ·
              ${Number(row.amount ?? 0).toFixed(2)}
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" disabled onClick={() => pushToast("Edit cash advances is not available yet — reverse and create a new advance instead", "info")}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={markDisbursedBlocked}
            title={markDisbursedBlockedReason}
            onClick={() => {
              if (markDisbursedBlocked) {
                pushToast(markDisbursedBlockedReason ?? "Cannot mark disbursed", "info");
                return;
              }
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
                .catch((error) => pushToast(userFacingApiError(error, "Failed"), "error"))
            }
          >
            Reverse
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const esc = (v: unknown) =>
                String(v ?? "—")
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;");
              const id = esc(advance.display_id ?? advance.id ?? "—");
              const amount = Number(advance.amount ?? 0).toFixed(2);
              const purpose = esc(advance.purpose ?? "—");
              const method = esc(advance.disbursement_method ?? "—");
              const driver = esc(
                entityLabel(
                  advance.driver_name as string | null | undefined,
                  advance.driver_id ? String(advance.driver_id) : null,
                  "Driver"
                )
              );
              printLetterHtml({
                title: `Cash advance ${String(advance.display_id ?? advance.id ?? "")}`,
                bodyHtml: `
                  <h1>Cash advance receipt</h1>
                  <div class="meta">${id} · printed ${esc(new Date().toLocaleString())}</div>
                  <table>
                    <tbody>
                      <tr><th>Advance</th><td>${id}</td></tr>
                      <tr><th>Driver</th><td>${driver}</td></tr>
                      <tr><th>Amount</th><td>$${amount}</td></tr>
                      <tr><th>Purpose</th><td>${purpose}</td></tr>
                      <tr><th>Method</th><td>${method}</td></tr>
                      <tr><th>Status</th><td>${esc(status)}</td></tr>
                    </tbody>
                  </table>
                `,
              });
            }}
          >
            Print Receipt
          </Button>
        </div>
      </aside>
    </>
  );
}
