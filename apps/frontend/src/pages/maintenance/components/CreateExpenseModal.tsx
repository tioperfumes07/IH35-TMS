import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { RecordExpenseForm } from "../../../components/expenses/RecordExpenseForm";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created expense's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created expense persists a HARD FK (accounting.expenses.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created expense persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  onClose: () => void;
  onCreated?: (expenseId: string | null) => void;
};

/**
 * Maintenance entry point for Create Expense — keeps the modal + WO/unit linkage props, but reuses the
 * canonical RecordExpenseForm (ReferenceSelect + Add new, correct category/payment mapping) so this
 * surface does not diverge from Accounting.
 */
export function CreateExpenseModal({
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

  return (
    <Modal open={open} onClose={onClose} title="Create Expense">
      <RecordExpenseForm
        operatingCompanyId={operatingCompanyId}
        idPrefix="maintenance-create-expense"
        submitLabel="Create Expense"
        submitTestId="create-expense-submit"
        workOrderId={linkedWoId}
        defaultUnitId={linkedUnitId}
        linkedWoDisplayId={linkedWoDisplayId}
        onSubmitted={(created) => {
          pushToast("Expense recorded", "success");
          void queryClient.invalidateQueries({ queryKey: ["accounting", "expenses"] });
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          onCreated?.(created?.targetId ?? null);
          onClose();
        }}
      />
    </Modal>
  );
}
