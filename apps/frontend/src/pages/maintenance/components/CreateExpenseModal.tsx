import { useQueryClient } from "@tanstack/react-query";
import { RecordExpenseForm } from "../../../components/expenses/RecordExpenseForm";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";

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
 * Maintenance entry point for Create Expense — keeps the WO/unit linkage props, but uses the same
 * QBO-like ParityDrawer + RecordExpenseForm chrome as Accounting (ReferenceSelect + Add new).
 * Entry point stays; only the shell matches owner creator-chrome lock.
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
    <ParityDrawer open={open} onClose={onClose} title="Create Expense" size="wide">
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
    </ParityDrawer>
  );
}
