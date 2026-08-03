import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Combobox } from "../../../components/Combobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { getLiabilitiesByDriver } from "../../../api/liabilities";
import { driverDeductionTypesCatalogClient } from "../../../api/catalogs-driver";
import { formatUsd } from "../../../lib/money";
import type { EscrowRecordRow } from "../../../api/driverFinance";

/**
 * SAF-F10 + SAF-F25 + ND-ESC-01 — Escrow Forfeit surface.
 *
 * Draw reason is a catalogs.driver_deduction_types row with may_draw_escrow=true (editable in Lists),
 * not free-text. Optional note appends to the catalog display name in the JE memo.
 * LST-PICKER-01: ReferenceSelect first-row create → POST same table with may_draw_escrow=true.
 */

type Props = {
  open: boolean;
  row: EscrowRecordRow | null;
  operatingCompanyId: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    amount: number;
    reason_code: string;
    reason_note?: string;
    linked_liability_id?: string;
  }) => void;
};

export function EscrowForfeitModal({ open, row, operatingCompanyId, loading, onClose, onConfirm }: Props) {
  // DOLLARS mode: the forfeit payload has always carried `amount` in dollars and the backend
  // reads it that way. MoneyInput's dollars seam keeps the stored number UNCHANGED (no x100).
  const queryClient = useQueryClient();
  const [amountUsd, setAmountUsd] = useState<number | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState<string | null>(null);

  // SAF-B29 wave-5: draw-reason catalog capped at 200 — typed term must reach the server.
  const [drawReasonSearch, setDrawReasonSearch] = useState("");
  const drawReasonsQuery = useQuery({
    queryKey: ["escrow-draw-reasons", operatingCompanyId, drawReasonSearch],
    queryFn: () =>
      driverDeductionTypesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
        offset: 0,
        search: drawReasonSearch || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const drawReasonOptions = useMemo(
    () =>
      (drawReasonsQuery.data?.rows ?? [])
        .filter((r) => r.may_draw_escrow === true)
        .map((r) => ({
          value: r.code,
          label: `${r.display_name} (${r.code})`,
          type: r.code,
        })),
    [drawReasonsQuery.data]
  );

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
        return { value: id, label: `${kind} · ${formatUsd(balance)}${description ? ` · ${description}` : ""}` };
      }),
    [liabilitiesQuery.data]
  );

  const reset = () => {
    setAmountUsd(null);
    setReasonCode(null);
    setReasonNote("");
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
  // reasonTooShort name is pinned by verify-safety-money-chrome (catalog pick = required reason).
  const reasonTooShort = !reasonCode;
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
          <span className="text-slate-600">Draw reason *</span>
          <div className="mt-1" data-testid="escrow-forfeit-reason">
            {/*
              LST-PICKER-01: Combobox had no inline create — operators had to leave for Lists.
              ReferenceSelect createKind=escrow_draw_reason → POST catalogs.driver_deduction_types
              with may_draw_escrow=true (same filtered table this picker reads).
            */}
            <ReferenceSelect
              value={reasonCode}
              onChange={setReasonCode}
              options={drawReasonOptions}
              createKind="escrow_draw_reason"
              operatingCompanyId={operatingCompanyId}
              createdValueField="code"
              placeholder={
                drawReasonsQuery.isLoading
                  ? "Loading draw reasons…"
                  : drawReasonOptions.length === 0
                    ? "No draw reasons yet — + Add new below"
                    : "Select abandonment / damage / safety fine…"
              }
              loading={drawReasonsQuery.isLoading}
              disabled={!operatingCompanyId || drawReasonsQuery.isLoading}
              onSearch={setDrawReasonSearch}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["escrow-draw-reasons", operatingCompanyId] });
              }}
            />
          </div>
        </label>

        <label className="block text-xs">
          <span className="text-slate-600">Note (optional)</span>
          <input
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Optional detail appended to the catalog reason"
            data-testid="escrow-forfeit-reason-note"
          />
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
              if (!reasonCode) return;
              onConfirm({
                amount,
                reason_code: reasonCode,
                reason_note: reasonNote.trim() || undefined,
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
