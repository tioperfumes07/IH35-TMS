import { Link } from "react-router-dom";
import { ParityDrawer } from "../parity/ParityDrawer";
import { RecordExpenseForm } from "./RecordExpenseForm";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  /** LINK-F5189: fired with the real created accounting.expenses id (was previously discarded). */
  onCreated?: (expenseId: string | null) => void;
};

/**
 * Expense create chrome — QBO-like right-side panel (owner creator-chrome lock).
 * Reuses ParityDrawer; form body is unchanged RecordExpenseForm.
 * Export name kept so list / Quick Actions callers stay additive.
 */
export function RecordExpenseModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <ParityDrawer open={open} onClose={onClose} title="Record expense" size="wide">
      <div className="space-y-4">
        {/* UploadZone lives INSIDE RecordExpenseForm so its draft id is the one sent in the create
            payload and reconciled onto the real expense (Option B) — no separate, orphaning draft id. */}
        {/* ACCT-MONEY-F6508-DIRECT-CREATORS-RETAIN-CROSS-COMPANY-DRAFT — ParityDrawer keeps its
            children mounted across open/close cycles, so without a keyed remount a draft started
            for one company (or left mid-edit when the drawer was dismissed) would still be
            showing when this same modal instance reopens for a DIFFERENT company. Same fix
            already shipped for the Maintenance wrapper, MAINT-F6508. */}
        <RecordExpenseForm
          key={`record-expense-modal-${operatingCompanyId}`}
          operatingCompanyId={operatingCompanyId}
          idPrefix="record-expense-modal"
          submitLabel="Record expense"
          onSubmitted={(created) => {
            onCreated?.(created?.targetId ?? null);
            onClose();
          }}
        />
        <p className="text-xs text-gray-600">
          <Link className="text-slate-700 underline" to="/accounting/expenses/list">
            View all expenses
          </Link>
        </p>
      </div>
    </ParityDrawer>
  );
}
