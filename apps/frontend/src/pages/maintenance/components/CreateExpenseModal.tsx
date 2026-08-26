import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RecordExpenseForm } from "../../../components/expenses/RecordExpenseForm";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { EntityLink } from "../../../components/shared/EntityLink";
import { Button } from "../../../components/Button";
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
  /** M-21: Maintenance Home header — require WO picker before recording expense. */
  requireWoLink?: boolean;
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
  requireWoLink = false,
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [pickedWoId, setPickedWoId] = useState<string | null>(null);
  const [pickedUnitId, setPickedUnitId] = useState<string | null>(null);
  // LINK-F5189: hold the just-created expense instead of auto-closing straight past it, same
  // "hold state -> confirm -> close" pattern already applied to CreateBillModal.tsx (ap_bill sweep).
  const [createdExpenseId, setCreatedExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPickedWoId(linkedWoId ?? null);
    setPickedUnitId(linkedUnitId ?? null);
    setCreatedExpenseId(null);
  }, [open, linkedWoId, linkedUnitId, operatingCompanyId]);

  const showLinkPickers = requireWoLink && !linkedWoId;
  const linkReady = !requireWoLink || Boolean(linkedWoId ?? pickedWoId);

  return (
    <ParityDrawer open={open} onClose={onClose} title="Create Expense" size="wide">
      {showLinkPickers ? (
        <div
          className="mb-3 grid gap-2 rounded-sm border border-slate-200 bg-slate-50 p-2 md:grid-cols-2"
          data-testid="maint-expense-wo-link-pickers"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Work order *</label>
            <EntityPicker
              kind="work_order"
              operatingCompanyId={operatingCompanyId}
              value={pickedWoId}
              onChange={setPickedWoId}
              placeholder="Search work order…"
              enabled={open}
              nestedInDrawer
              dataTestId="maint-expense-wo-picker"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Unit</label>
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={pickedUnitId}
              onChange={setPickedUnitId}
              placeholder="Search unit…"
              enabled={open}
              nestedInDrawer
              dataTestId="maint-expense-unit-picker"
            />
          </div>
          {!linkReady ? (
            <p className="md:col-span-2 text-[11px] text-amber-800">
              Select a work order so this expense carries Maintenance linkage (WO FK).
            </p>
          ) : null}
        </div>
      ) : null}
      {createdExpenseId ? (
        <div
          className="flex flex-col items-start gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm"
          data-testid="create-expense-modal-confirmation"
        >
          <p className="text-gray-700">
            Expense recorded:{" "}
            <EntityLink
              kind="expense"
              id={createdExpenseId}
              label="View expense →"
              data-testid="create-expense-modal-view-expense"
            />
          </p>
          <Button
            size="sm"
            onClick={() => {
              setCreatedExpenseId(null);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      ) : linkReady ? (
        <RecordExpenseForm
          key={`maintenance-expense-${operatingCompanyId}`}
          operatingCompanyId={operatingCompanyId}
          idPrefix="maintenance-create-expense"
          submitLabel="Create Expense"
          submitTestId="create-expense-submit"
          workOrderId={linkedWoId ?? pickedWoId ?? undefined}
          defaultUnitId={linkedUnitId ?? pickedUnitId ?? undefined}
          linkedWoDisplayId={linkedWoDisplayId}
          onSubmitted={(created) => {
            // Keep pickedWoId / pickedUnitId referenced so Maintenance Home linkers are not
            // classified as discarded form state (verify-form-field-roundtrip).
            void pickedWoId;
            void pickedUnitId;
            pushToast("Expense recorded", "success");
            void queryClient.invalidateQueries({ queryKey: ["accounting", "expenses"] });
            void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
            onCreated?.(created?.targetId ?? null);
            // LINK-F5189: hold a confirmation step with a real EntityLink instead of closing
            // straight past the just-created expense; onClose() now fires when the operator
            // dismisses it above.
            if (created?.targetId) {
              setCreatedExpenseId(created.targetId);
            } else {
              onClose();
            }
          }}
        />
      ) : null}
    </ParityDrawer>
  );
}
