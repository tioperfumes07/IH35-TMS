import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVendorBill } from "../../../api/accounting";
import {
  VendorBillForm,
  type VendorBillFormSubmitPayload,
} from "../../../components/accounting/VendorBillForm";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";
import type { BillTypeId } from "../../../components/forms/shared/TypeTabBar";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created bill's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created bill persists a HARD FK (accounting.bills.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created bill persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  /** Pre-select bill type tab when opened from accounting subnav (maintenance | repair | fuel | driver). */
  initialBillType?: BillTypeId;
  onClose: () => void;
  /** Fired after a successful create with the new bill id (e.g. to open a task-link picker). */
  onCreated?: (billId: string | null) => void;
};

/**
 * Maintenance entry point for Create Bill — keeps the WO/unit linkage props, but uses the same
 * QBO-like ParityDrawer + VendorBillForm chrome as Accounting (ReferenceSelect + Add new vendor).
 * Entry point stays; only the shell matches owner creator-chrome lock.
 */
export function CreateBillModal({
  open,
  operatingCompanyId,
  linkedWoDisplayId,
  linkedWoId,
  linkedUnitId,
  initialBillType,
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: VendorBillFormSubmitPayload) => {
      if (!operatingCompanyId) throw new Error("Select an operating company first");
      // Payload already includes work_order_id / unit_id from VendorBillForm linkage props.
      return createVendorBill(operatingCompanyId, payload);
    },
    onSuccess: (res) => {
      pushToast("Bill created", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-unpaid"] });
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      onCreated?.(res?.bill?.id ?? null);
      onClose();
    },
    onError: (error) => {
      pushToast(String((error as Error).message || "Failed to create bill"), "error");
    },
  });

  return (
    <ParityDrawer open={open} onClose={onClose} title="Create Bill" size="wide">
      <VendorBillForm
        operatingCompanyId={operatingCompanyId}
        submitting={createMutation.isPending}
        linkedWoId={linkedWoId}
        linkedUnitId={linkedUnitId}
        linkedWoDisplayId={linkedWoDisplayId}
        initialBillType={initialBillType}
        submitLabel="Create Bill"
        submitTestId="create-bill-submit"
        onCancel={onClose}
        onSubmit={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
      />
    </ParityDrawer>
  );
}
