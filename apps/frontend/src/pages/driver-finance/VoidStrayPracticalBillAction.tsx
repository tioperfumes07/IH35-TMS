import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../../components/Button";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * ACCT-F11079 — UI for POST /api/v1/driver-finance/driver-bills/:id/void-stray-practical (ACCT-F11065).
 * Voids ONE stray per-load driver bill priced on PRACTICAL miles whose pay was already posted to A/P.
 * The server is fail-closed (409 carries the refusal message, shown verbatim in the modal).
 * The reason comes from the shared catalog dialog (VoidReasonModal: catalog reason + memo, small popup) — 443.348.
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
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const mutation = useMutation({
    mutationFn: (reason: string) =>
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
    },
  });

  if (!canVoidStrayPractical(bill, role)) return null;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)} data-testid="void-stray-practical-open">
        Void practical-miles bill
      </Button>
      <VoidReasonModal
        open={open}
        title="Void practical-miles bill"
        entityRef={`Driver bill ${billLabel} (priced on practical miles). Only an open, unsettled bill with an unpaid A/P bill can be voided; its accrued A/P bill is reversed.`}
        minLength={VOID_STRAY_PRACTICAL_MIN_REASON}
        submitLabel="Void bill"
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => {
          try {
            await mutation.mutateAsync(reason);
          } catch (error) {
            // The server is fail-closed: its refusal (409 message) is shown verbatim in the dialog.
            throw new Error(userFacingApiError(error, "Void refused"));
          }
        }}
      />
    </>
  );
}
