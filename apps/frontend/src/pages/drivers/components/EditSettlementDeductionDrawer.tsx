import { useEffect, useState } from "react";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { SelectCombobox } from "../../../components/Combobox";
import { editSettlementDeduction, type CreateSettlementDeductionTypedType } from "../../../api/driverFinance";
import { userFacingApiError } from "../../../lib/api-error-message";

/**
 * SET-01 part 2 (owner LOCKED MANDATE 2026-09-09) — the "true per-line editable input" for a saved
 * deduction line. Prefilled from the line, editable amount / type / reason. Saves through the REAL
 * PATCH /settlement-deductions/:id route, which does a WORM-safe void-old + recreate — never a bare
 * UPDATE. Type limited to the same four typed, GL-bound kinds the create drawer offers (SETL-DED-GL).
 * Driver and load are fixed (editing those is a different record, not an in-place line edit).
 */

const TYPE_OPTIONS: { value: CreateSettlementDeductionTypedType; label: string }[] = [
  { value: "wire_fee", label: "Wire fee (recovers a company wire fee)" },
  { value: "ach_fee", label: "ACH fee (recovers a company ACH fee)" },
  { value: "company_vehicle_fuel", label: "Company vehicle fuel (recovers company-paid fuel)" },
  { value: "escrow_contribution", label: "Escrow contribution (adds to the driver's own escrow)" },
];
const EDITABLE_TYPES = new Set(TYPE_OPTIONS.map((o) => o.value));

type Props = {
  open: boolean;
  operatingCompanyId: string;
  deductionId: string | null;
  initialAmountUsd: number | null;
  initialType: string | null;
  initialReason: string | null;
  /** For display only — the load this line is scoped to, if any. */
  loadNumber?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function EditSettlementDeductionDrawer({
  open,
  operatingCompanyId,
  deductionId,
  initialAmountUsd,
  initialType,
  initialReason,
  loadNumber,
  onClose,
  onSaved,
}: Props) {
  const initialTyped = initialType && EDITABLE_TYPES.has(initialType as CreateSettlementDeductionTypedType)
    ? (initialType as CreateSettlementDeductionTypedType)
    : "";
  const [amountUsd, setAmountUsd] = useState<number | null>(initialAmountUsd);
  const [deductionType, setDeductionType] = useState<CreateSettlementDeductionTypedType | "">(initialTyped);
  const [reason, setReason] = useState(initialReason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the drawer is (re)opened for a specific line.
  useEffect(() => {
    if (open) {
      setAmountUsd(initialAmountUsd);
      setDeductionType(initialTyped);
      setReason(initialReason ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deductionId]);

  const amountCents = Math.round(Number(amountUsd ?? 0) * 100);
  const reasonTooShort = reason.trim().length < 10;
  const submitDisabled = submitting || !deductionId || !deductionType || amountCents <= 0 || reasonTooShort;

  const submit = async () => {
    if (!deductionId || !deductionType) return;
    setSubmitting(true);
    setError(null);
    try {
      await editSettlementDeduction(deductionId, {
        operating_company_id: operatingCompanyId,
        amount_cents: amountCents,
        deduction_type: deductionType,
        reason: reason.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(userFacingApiError(e, "Could not save the deduction."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ParityDrawer open={open} onClose={onClose} title="Edit deduction">
      <div className="space-y-3 text-xs text-gray-700" data-testid="edit-settlement-deduction-drawer">
        {loadNumber ? (
          <div className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1.5 text-slate-600" data-testid="edit-settlement-deduction-load">
            Load <span className="font-semibold">{loadNumber}</span> — this line only
          </div>
        ) : null}

        <label className="block text-xs">
          <span className="text-slate-600">Type *</span>
          <div className="mt-1" data-testid="edit-settlement-deduction-type">
            <SelectCombobox
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
              value={deductionType}
              onChange={(e) => setDeductionType(e.target.value as CreateSettlementDeductionTypedType | "")}
            >
              <option value="">Select a type…</option>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectCombobox>
          </div>
        </label>

        <label className="block text-xs">
          <span className="text-slate-600">Amount *</span>
          <div data-testid="edit-settlement-deduction-amount">
            <MoneyInput
              valueDollars={amountUsd}
              onChangeDollars={setAmountUsd}
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              ariaLabel="Deduction amount"
            />
          </div>
        </label>

        <label className="block text-xs">
          <span className="text-slate-600">Reason *</span>
          <textarea
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1.5"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this edit — at least 10 characters (cited source, if any)"
            data-testid="edit-settlement-deduction-reason"
          />
          {reason.length > 0 && reasonTooShort ? (
            <span className="mt-1 block text-xs text-red-600">Reason needs at least 10 characters.</span>
          ) : null}
        </label>

        {error ? (
          <p className="text-xs text-red-700" data-testid="edit-settlement-deduction-error">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button data-testid="edit-settlement-deduction-submit" loading={submitting} disabled={submitDisabled} onClick={() => void submit()}>
            Save changes
          </Button>
        </div>
      </div>
    </ParityDrawer>
  );
}
