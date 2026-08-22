import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { markCashAdvanceDisbursed, type CashAdvanceMethod } from "../../../api/cashAdvances";
import { getPlaidCompanyTransactions } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { ModalCloseButton } from "../../../components/ModalCloseButton";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { Combobox } from "../../../components/shared/Combobox";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatDateUS } from "../../../lib/formatDate";
import { CappedListNotice } from "../../../components/CappedListNotice";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  advanceId: string | null;
  // ACCT-F5408 — the parent already fetches the full advance record for the detail drawer; passing
  // it through here (instead of just advanceId) lets this modal show the same Linked Load context
  // the operator is confirming disbursement against, sourced from views.cash_advances_with_context
  // (migration 202612750000 added load_id/load_display_id — the column always existed on
  // driver_finance.driver_advances, the view had just never been refreshed to select it).
  advance?: Record<string, unknown> | null;
  onClose: () => void;
  onDone: () => void;
};

export function MarkDisbursedModal({ open, operatingCompanyId, advanceId, advance, onClose, onDone }: Props) {
  const { pushToast } = useToast();
  const [method, setMethod] = useState<CashAdvanceMethod>("direct_bank_transfer");
  const [bankTxnId, setBankTxnId] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [comdataTxnId, setComdataTxnId] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [wireRef, setWireRef] = useState("");

  // ACCT-F5965 — was a raw free-text <input> for a field the backend correctly types as
  // z.string().uuid().optional() (a genuine FK into banking.bank_transactions, consumed by 2 real
  // UPDATE statements) — any human-readable reference an operator typed threw a raw "Invalid UUID"
  // Zod error. Mirrors FineLifecycleActions.tsx's bank-transaction picker for the structurally
  // identical "link a real bank transaction" use case: company-wide, searchable, read-only GET, no
  // inline "+ Create" (a bank transaction is bank-fed, never hand-created here).
  const bankTxQuery = useQuery({
    queryKey: ["banking", "company-transactions", "cash-advance-disburse-picker", operatingCompanyId, bankSearch],
    queryFn: () =>
      getPlaidCompanyTransactions(operatingCompanyId, {
        limit: 100,
        q: bankSearch.trim() ? bankSearch.trim() : undefined,
        sort: "date_desc",
      }),
    enabled: Boolean(operatingCompanyId) && method === "direct_bank_transfer",
  });

  const bankOptions = useMemo(
    () =>
      (bankTxQuery.data?.transactions ?? []).map((tx) => ({
        value: String(tx.id),
        label: `${formatDateUS(tx.transaction_date)} · $${(Math.abs(Number(tx.amount_cents ?? 0)) / 100).toFixed(2)} · ${
          tx.merchant_name ?? tx.description ?? "(no description)"
        }`,
      })),
    [bankTxQuery.data]
  );

  const mutation = useMutation({
    mutationFn: () =>
      markCashAdvanceDisbursed(advanceId!, operatingCompanyId, {
        disbursement_method: method,
        bank_txn_id: bankTxnId || undefined,
        comdata_txn_id: comdataTxnId || undefined,
        check_number: checkNumber || undefined,
        wire_confirmation_ref: wireRef || undefined,
      }),
    onSuccess: () => {
      pushToast("Advance marked disbursed", "success");
      onDone();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed"), "error"),
  });

  useEscapeKey(onClose, open);

  if (!open || !advanceId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-x-0 top-20 z-50 mx-auto w-full max-w-lg rounded-sm border border-gray-200 bg-white p-4 text-xs shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mark Disbursed</h3>
          <ModalCloseButton title="Mark Disbursed" onClose={onClose} />
        </div>

        {/* UI-01 PART 2 — flat inside the single modal frame, not a nested card (QBO/NetSuite style). */}
        <div className="mb-2 border-t border-gray-200 pt-2">
          <span className="font-semibold">Linked Load: </span>
          {advance?.load_id ? (
            <EntityLink
              kind="load"
              id={String(advance.load_id)}
              label={entityLabel(advance.load_display_id ? String(advance.load_display_id) : null, String(advance.load_id), "Load")}
            />
          ) : (
            <span className="text-gray-500">No load linked to this advance.</span>
          )}
        </div>

        <div className="grid gap-2">
          <label className="space-y-1">
            <span>Disbursement Method</span>
            <SelectCombobox className="w-full rounded-sm border border-gray-300 px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value as CashAdvanceMethod)}>
              <option value="direct_bank_transfer">Direct bank transfer</option>
              <option value="wire">Wire</option>
              <option value="comdata">Comdata / EFS</option>
              <option value="in_person_check">In-person check</option>
            </SelectCombobox>
          </label>

          {method === "direct_bank_transfer" ? (
            <label className="space-y-1">
              <span>Bank transaction (optional)</span>
              <div data-testid="cash-advance-disburse-bank-transaction-picker">
                <Combobox
                  options={bankOptions}
                  value={bankTxnId}
                  onChange={setBankTxnId}
                  onSearch={setBankSearch}
                  placeholder={bankTxQuery.isLoading ? "Loading bank transactions…" : "Search by description or merchant…"}
                />
              </div>
              <CappedListNotice
                shown={bankOptions.length}
                limit={100}
                hint="Type to search bank transactions beyond the first page."
                className="text-xs text-slate-600"
              />
            </label>
          ) : null}
          {method === "wire" ? (
            <label className="space-y-1">
              <span>Wire confirmation reference</span>
              <input className="w-full rounded-sm border border-gray-300 px-2 py-1" value={wireRef} onChange={(e) => setWireRef(e.target.value)} />
            </label>
          ) : null}
          {method === "comdata" ? (
            <label className="space-y-1">
              <span>Comdata transaction ID</span>
              <input className="w-full rounded-sm border border-gray-300 px-2 py-1" value={comdataTxnId} onChange={(e) => setComdataTxnId(e.target.value)} />
            </label>
          ) : null}
          {method === "in_person_check" ? (
            <label className="space-y-1">
              <span>Check number</span>
              <input className="w-full rounded-sm border border-gray-300 px-2 py-1" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
            </label>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Confirm Disbursement
          </Button>
        </div>
      </div>
    </>
  );
}
