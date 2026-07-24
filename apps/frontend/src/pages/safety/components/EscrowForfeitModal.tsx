import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Combobox } from "../../../components/Combobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { getLiabilitiesByDriver } from "../../../api/liabilities";
import { formatUsd } from "../../../lib/money";
import type { EscrowRecordRow } from "../../../api/driverFinance";

/**
 * SAF-F10 + SAF-F25 — the Escrow Forfeit surface.
 *
 * WHAT IT WAS: a centered `Modal` on a MONEY action, with three raw inputs — a bare `type="number"`
 * for the amount, an unvalidated free-text reason, and a text box where the operator was expected to
 * TYPE A RAW UUID for `linked_liability_id`. Forfeiting escrow moves a real driver's money; asking
 * someone to hand-type the uuid of the debt it offsets is how the wrong debt gets offset, and
 * nothing about the layout said "this is a financial action".
 *
 * WHAT IT IS NOW:
 *   - ParityDrawer (Law §3 / DoD verify-layer 1: money creators are right-side drawers, never a
 *     centered modal).
 *   - MoneyInput for the amount — the same money grammar as every other financial field.
 *   - A real liability PICKER backed by GET /api/v1/liabilities/by-driver/:driver_id, scoped to this
 *     driver and this company, labelled with what each debt IS and what is left on it. No uuid typing.
 *   - Reason REQUIRED (min 3), submit disabled until met — the same contract as every other void in
 *     the app, because a forfeiture with no recorded reason is unanswerable when the driver disputes it.
 *   - Amount bounded by the driver's own balance: you cannot forfeit more escrow than exists.
 *
 * The signed-clause gate keeps its behaviour and now says WHY it blocks — after SAF-F09 that flag
 * reflects a real signed contract instead of an inference from a timeline bucket.
 */

type Props = {
  open: boolean;
  row: EscrowRecordRow | null;
  operatingCompanyId: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { amount: number; reason: string; linked_liability_id?: string }) => void;
};

const MIN_REASON = 3;

export function EscrowForfeitModal({ open, row, operatingCompanyId, loading, onClose, onConfirm }: Props) {
  // DOLLARS mode: the forfeit payload has always carried `amount` in dollars and the backend
  // reads it that way. MoneyInput's dollars seam keeps the stored number UNCHANGED (no x100) —
  // switching to cents here would silently multiply a real forfeiture by 100.
  const [amountUsd, setAmountUsd] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState<string | null>(null);

  const liabilitiesQuery = useQuery({
    queryKey: ["driver-liabilities", "forfeit-picker", operatingCompanyId, row?.id],
    queryFn: () => getLiabilitiesByDriver(String(row?.id ?? ""), operatingCompanyId),
    enabled: open && Boolean(row?.id) && Boolean(operatingCompanyId),
  });

  const liabilityOptions = useMemo(
    () =>
      (liabilitiesQuery.data?.liabilities ?? []).map((liability) => {
        const id = String(liability.id ?? "");
        const kind = String(liability.type ?? liability.origin ?? "liability");
        const balance = Number(liability.current_balance ?? 0) / 100;
        const description = String(liability.source_description ?? "").trim();
        // The operator picks a DEBT — what it is and what is left on it — never a uuid.
        return { value: id, label: `${kind} · ${formatUsd(balance)}${description ? ` · ${description}` : ""}` };
      }),
    [liabilitiesQuery.data]
  );

  const reset = () => {
    setAmountUsd(null);
    setReason("");
    setLinkedLiabilityId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const amount = Number(amountUsd ?? 0);
  const balance = Number(row?.current_balance ?? 0);
  const clauseBlocked = Boolean(row && !row.has_signed_clause);
  const overBalance = amount > balance;
  const reasonTooShort = reason.trim().length < MIN_REASON;
  const submitDisabled = clauseBlocked || amount <= 0 || overBalance || reasonTooShort;

  return (
    <ParityDrawer
      open={open}
      onClose={handleClose}
      title={row ? `Escrow Forfeit — ${row.driver_name}` : "Escrow Forfeit"}
    >
      <div className="space-y-3 text-sm text-gray-700" data-testid="escrow-forfeit-modal">
        <div className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-slate-700">
          Current escrow balance: <span className="font-semibold">{formatUsd(balance)}</span>
        </div>

        <label className="block text-xs">
          <span className="text-slate-600">Amount to forfeit *</span>
          <div data-testid="escrow-forfeit-amount">
            <MoneyInput
              valueDollars={amountUsd}
              onChangeDollars={setAmountUsd}
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              ariaLabel="Amount to forfeit"
            />
          </div>
          {overBalance ? (
            <span className="mt-1 block text-[11px] text-red-600" data-testid="escrow-forfeit-over-balance">
              Cannot forfeit more than the driver&apos;s escrow balance ({formatUsd(balance)}).
            </span>
          ) : null}
        </label>

        <label className="block text-xs">
          <span className="text-slate-600">Reason *</span>
          <input
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this escrow being forfeited?"
            data-testid="escrow-forfeit-reason"
          />
          {reasonTooShort ? (
            <span className="mt-1 block text-[11px] text-slate-500">
              Required — a forfeiture with no recorded reason cannot be answered if the driver disputes it.
            </span>
          ) : null}
        </label>

        <label className="block text-xs">
          <span className="text-slate-600">Offsets which debt?</span>
          <div className="mt-1" data-testid="escrow-forfeit-liability-picker">
            <Combobox
              options={liabilityOptions}
              value={linkedLiabilityId}
              onChange={setLinkedLiabilityId}
              placeholder={liabilitiesQuery.isLoading ? "Loading debts…" : "Select a driver liability (optional)"}
              loading={liabilitiesQuery.isLoading}
            />
          </div>
          {!liabilitiesQuery.isLoading && liabilityOptions.length === 0 ? (
            <span className="mt-1 block text-[11px] text-slate-500">
              This driver has no open liabilities on record.
            </span>
          ) : null}
        </label>

        {clauseBlocked ? (
          <p className="text-xs text-red-700" data-testid="escrow-forfeit-clause-block">
            Blocked: forfeiture requires a signed escrow clause (MUST 3.13.6.3.D). No signed, non-voided
            contract is on file for this driver.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            data-testid="escrow-forfeit-submit"
            loading={loading}
            disabled={submitDisabled}
            onClick={() => {
              onConfirm({
                amount,
                reason: reason.trim(),
                linked_liability_id: linkedLiabilityId || undefined,
              });
              reset();
            }}
          >
            Submit Forfeit
          </Button>
        </div>
      </div>
    </ParityDrawer>
  );
}
