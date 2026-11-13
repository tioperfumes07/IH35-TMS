import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../../components/Button";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * ENG-44 REVERSE — UI for POST /api/v1/driver-finance/driver-bills/:id/reinstate.
 * Reinstates (un-voids) ONE voided driver bill. The server is fail-closed (409 carries the refusal).
 */
export const REINSTATE_BILL_ROLES = ["Owner", "Administrator", "Accountant"] as const;
export const REINSTATE_BILL_MIN_REASON = 20;

export type ReinstatableBill = {
  status: string;
  voided_at: string | null;
  settled_in_settlement_id: string | null;
};

/** Only voided, unsettled bills can be reinstated. */
export function canReinstateBill(bill: ReinstatableBill, role: string | null | undefined): boolean {
  if (!role || !(REINSTATE_BILL_ROLES as readonly string[]).includes(role)) return false;
  return String(bill.status).toLowerCase() === "void" && !!bill.voided_at && !bill.settled_in_settlement_id;
}

type Props = { billId: string; operatingCompanyId: string; billLabel: string; bill: ReinstatableBill; role: string | null | undefined };

export function ReinstateBillAction({ billId, operatingCompanyId, billLabel, bill, role }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const mutation = useMutation({
    meta: { loads: true },
    mutationFn: (reason: string) =>
      apiRequest(`/api/v1/driver-finance/driver-bills/${encodeURIComponent(billId)}/reinstate`, {
        method: "POST",
        body: { operating_company_id: operatingCompanyId, reason: reason.trim() },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["driver-finance"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-bills"] }),
      ]);
      pushToast(`Driver bill ${billLabel} reinstated`, "success");
      setOpen(false);
    },
  });

  if (!canReinstateBill(bill, role)) return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="reinstate-bill-open">
        Reinstate bill
      </Button>
      <VoidReasonModal
        open={open}
        title="Reinstate voided bill"
        entityRef={`Driver bill ${billLabel} (voided). Reinstating re-opens the bill. Must be unsettled.`}
        minLength={REINSTATE_BILL_MIN_REASON}
        submitLabel="Reinstate bill"
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => {
          try {
            await mutation.mutateAsync(reason);
          } catch (error) {
            throw new Error(userFacingApiError(error, "Reinstate refused"));
          }
        }}
      />
    </>
  );
}
