import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * ACCT-F11079 — UI for POST /api/v1/driver-finance/driver-bills/:id/void-stray-practical (ACCT-F11065).
 * Voids ONE stray per-load driver bill priced on PRACTICAL miles whose pay was already posted to A/P.
 * The server is fail-closed (409 carries the refusal message, shown verbatim in the modal).
 */
export const VOID_STRAY_PRACTICAL_ROLES = ["Owner", "Administrator", "Accountant"] as const;
export const VOID_STRAY_PRACTICAL_MIN_REASON = 20;

export type VoidStrayPracticalBill = {
  status: string;
  voided_at: string | null;
  settled_in_settlement_id: string | null;
  miles_basis_type: string | null;
};

/** The 4 conditions + the role gate. Pure so the show/hide rule is unit-tested. */
export function canVoidStrayPractical(bill: VoidStrayPracticalBill, role: string | null | undefined): boolean {
  if (!role || !(VOID_STRAY_PRACTICAL_ROLES as readonly string[]).includes(role)) return false;
  return (
    String(bill.status).toLowerCase() === "open" &&
    !bill.voided_at &&
    !bill.settled_in_settlement_id &&
    bill.miles_basis_type === "practical"
  );
}

export function reasonIsValid(reason: string): boolean {
  return reason.trim().length >= VOID_STRAY_PRACTICAL_MIN_REASON;
}

type Props = { billId: string; operatingCompanyId: string; billLabel: string; bill: VoidStrayPracticalBill; role: string | null | undefined };

export function VoidStrayPracticalBillAction({ billId, operatingCompanyId, billLabel, bill, role }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/driver-finance/driver-bills/${encodeURIComponent(billId)}/void-stray-practical`, {
        method: "POST",
        body: { operating_company_id: operatingCompanyId, reason: reason.trim() },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["driver-finance"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-bills"] }),
      ]);
      pushToast(`Driver bill ${billLabel} voided`, "success");
      setOpen(false);
      setReason("");
      setServerError(null);
    },
    onError: (error) => setServerError(userFacingApiError(error, "Void refused")),
  });

  if (!canVoidStrayPractical(bill, role)) return null;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => { setServerError(null); setOpen(true); }} data-testid="void-stray-practical-open">
        Void practical-miles bill
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Void practical-miles bill">
        <div className="space-y-3 text-xs" data-testid="void-stray-practical-modal">
          <p className="text-gray-700">
            Voids driver bill {billLabel} (priced on practical miles) and reverses its accrued A/P bill. Only an open, unsettled bill with an unpaid A/P bill can be voided.
          </p>
          <label className="block text-xs font-semibold uppercase text-gray-600" htmlFor="void-stray-practical-reason">
            Reason (at least {VOID_STRAY_PRACTICAL_MIN_REASON} characters)
          </label>
          <textarea
            id="void-stray-practical-reason"
            className="min-h-28 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="void-stray-practical-reason"
          />
          {serverError ? (
            <div role="alert" className="border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700" data-testid="void-stray-practical-error">
              {serverError}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)} data-testid="void-stray-practical-cancel">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!reasonIsValid(reason)}
              loading={mutation.isPending}
              onClick={() => { setServerError(null); mutation.mutate(); }}
              data-testid="void-stray-practical-confirm"
            >
              Void bill
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
