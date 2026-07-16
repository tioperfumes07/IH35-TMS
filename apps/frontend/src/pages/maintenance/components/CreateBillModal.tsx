import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVendorBill } from "../../../api/accounting";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import {
  VendorBillForm,
  type VendorBillFormSubmitPayload,
} from "../../../components/accounting/VendorBillForm";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created bill's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created bill persists a HARD FK (accounting.bills.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created bill persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  onClose: () => void;
  /** Fired after a successful create with the new bill id (e.g. to open a task-link picker). */
  onCreated?: (billId: string | null) => void;
};

/**
 * Maintenance entry point for Create Bill — keeps the modal + WO/unit linkage props, but reuses the
 * canonical VendorBillForm (ReferenceSelect + Add new vendor, terms in memo, correct A/P mapping) so
 * this surface does not diverge from Accounting.
 */
export function CreateBillModal({
  open,
  operatingCompanyId,
  linkedWoDisplayId,
  linkedWoId,
  linkedUnitId,
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
    <Modal open={open} onClose={onClose} title="Create Bill">
      <VendorBillForm
        operatingCompanyId={operatingCompanyId}
        submitting={createMutation.isPending}
        linkedWoId={linkedWoId}
        linkedUnitId={linkedUnitId}
        linkedWoDisplayId={linkedWoDisplayId}
        submitLabel="Create Bill"
        submitTestId="create-bill-submit"
        onCancel={onClose}
        onSubmit={(payload) => createMutation.mutateAsync(payload)}
      />
    </Modal>
  );
}
