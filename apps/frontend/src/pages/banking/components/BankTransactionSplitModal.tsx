// [HOLD-FOR-JORGE — TIER 1] BANK-SPLIT-1 — QBO-style Split transaction popup.
//
// Opens on ONE bank transaction and splits it into multiple lines. DEFAULT mode is one vendor + multiple
// categories; a button switches to MULTIPLE VENDORS (each line its own vendor). Lines must sum EXACTLY to
// the transaction total (validated client-side + re-validated server-side). Each line can also carry
// Driver/Unit/Trailer/Load links (Part 1 linkage) and, when tagged to a Driver + the driver-advance
// account, becomes a cash-advance line (reuses the existing BLOCK-6 posting path per-line — see
// bank-transaction-splits.service.ts). Behind BANK_TX_SPLIT_ENABLED (OFF) — Save/Commit calls 409 with
// `feature_disabled` until the owner flips the flag per entity.
//
// Layout rebuilt to the approved QBO-categorize design (docs/specs/qbo-parity/
// BANKING-COA-CATEGORIZE-PHASE-B-DESIGN-2026-06-30.md + docs/approved-screens/qbo-categorize-modal.png):
// each line is a card with the PRIMARY fields (Category-or-Item, Description, Amount) prominent, and the
// trucking-link fields (Driver/Unit/Trailer/Trip) tucked behind a per-line "Add detail/links" disclosure.
// NON-FINANCIAL: this only changes what renders. commitSplit/save/toPayload logic and payload field names
// are untouched — every field still writes through the existing `patchLine`.
//
// CHROME-12: outer shell swapped from centered Modal to ParityDrawer (QBO side-panel chrome) — the
// CHROME-11 leftover note named this file explicitly. Presentational only; BANK_TX_SPLIT_ENABLED gating
// and every payload/handler above is untouched.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { useToast } from "../../../components/Toast";
import { DriverAutocomplete } from "../../../components/factoring/DriverAutocomplete";
import { UnitAutocomplete } from "../../../components/banking/UnitAutocomplete";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { listVendors } from "../../../api/mdata";
import { getCoaAccounts } from "../../../api/banking";
import { itemsCatalogClient } from "../../../api/catalogs-accounting";
import {
  commitBankTransactionSplit,
  getBankTransactionSplits,
  saveBankTransactionSplitDraft,
  voidBankTransactionSplit,
  type BankTransactionSplitLine,
  type BankTransactionSplitMode,
} from "../../../api/banking";
import { formatUsdCents } from "../../../lib/money";
import { ApiError } from "../../../api/client";
import { userFacingApiError } from "../../../lib/api-error-message";

type LineDraft = BankTransactionSplitLine & { _key: string; _driverName?: string; _unitName?: string; _trailerName?: string; _loadName?: string };

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `line-${keySeq}`;
}

function blankLine(): LineDraft {
  return { _key: nextKey(), amount_cents: 0 };
}

type Props = {
  open: boolean;
  companyId: string;
  transaction: { id: string; amount_cents: number; is_credit: boolean; description?: string } | null;
  onClose: () => void;
  onSaved: () => void;
};

export function BankTransactionSplitModal({ open, companyId, transaction, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [mode, setMode] = useState<BankTransactionSplitMode>("single_vendor_multi_category");
  const [singleVendorId, setSingleVendorId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResults, setCommitResults] = useState<
    Array<{
      line_no: number;
      posted: boolean;
      reason: string;
      driver_advance_id?: string;
      deduction_id?: string;
      bill_id?: string;
      journal_entry_id?: string;
    }> | null
  >(null);
  // Per-line disclosure state for the secondary Driver/Unit/Trailer/Trip link fields — collapsed by
  // default so the primary Category/Description/Amount row reads clean (owner feedback: "boxes are
  // out of proportion" / table crammed 7 columns).
  const [expandedLinks, setExpandedLinks] = useState<Record<string, boolean>>({});
  // PLUS-DRIVER-MONEY: nested "+ Create driver" from a split line's Driver picker.
  const txnId = transaction?.id ?? "";
  const totalCents = Math.abs(transaction?.amount_cents ?? 0);

  const existingQuery = useQuery({
    queryKey: ["banking", "splits", companyId, txnId],
    queryFn: () => getBankTransactionSplits(txnId, companyId),
    enabled: Boolean(open && companyId && txnId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "coa-accounts", "split", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(open && companyId),
  });

  const vendorsQuery = useQuery({
    queryKey: ["banking", "split-vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId }).then((res) => (res.vendors ?? []) as Array<{ id: string; name: string }>),
    enabled: Boolean(open && companyId),
  });

  // Products/Services (catalogs.items) — QBO categorize offers Category (GL account) OR Product/Service;
  // same client + list shape BankingTransactionsDesignView already uses for its inline categorize row.
  const itemsQuery = useQuery({
    queryKey: ["banking", "split-items", companyId],
    queryFn: () =>
      itemsCatalogClient
        .list({ operating_company_id: companyId, is_active: "true", limit: 200, offset: 0 })
        .then((r) => r.rows ?? []),
    enabled: Boolean(open && companyId),
  });

  useEffect(() => {
    if (!open) return;
    const existing = existingQuery.data;
    if (existing && existing.lines.length > 0) {
      setMode(existing.mode ?? "single_vendor_multi_category");
      setLines(existing.lines.map((l) => ({ ...l, _key: nextKey() })));
      const firstVendor = existing.lines.find((l) => l.vendor_id)?.vendor_id;
      setSingleVendorId(firstVendor ?? "");
      setCommitResults(null);
      setExpandedLinks({});
    } else if (existing) {
      // No saved split yet — seed two blank lines so the operator starts from the worked-example shape.
      setLines([blankLine(), blankLine()]);
      setMode("single_vendor_multi_category");
      setSingleVendorId("");
      setCommitResults(null);
      setExpandedLinks({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingQuery.data]);

  const sumCents = useMemo(() => lines.reduce((acc, l) => acc + (Number(l.amount_cents) || 0), 0), [lines]);
  const remainingCents = totalCents - sumCents;

  function patchLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => {
      const next = prev.map((l) => (l._key === key ? { ...l, ...patch } : l));
      // QBO-style auto-balance: whenever an amount changes on any line EXCEPT the last one, auto-fill
      // the LAST line with whatever remains so the split always sums to the transaction total.
      if (Object.prototype.hasOwnProperty.call(patch, "amount_cents") && next.length > 0) {
        const lastIdx = next.length - 1;
        if (next[lastIdx]._key !== key) {
          const sumExceptLast = next.slice(0, lastIdx).reduce((acc, l) => acc + (Number(l.amount_cents) || 0), 0);
          next[lastIdx] = { ...next[lastIdx], amount_cents: totalCents - sumExceptLast };
        }
      }
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((l) => l._key !== key);
      const lastIdx = next.length - 1;
      if (lastIdx >= 0) {
        const sumExceptLast = next.slice(0, lastIdx).reduce((acc, l) => acc + (Number(l.amount_cents) || 0), 0);
        next[lastIdx] = { ...next[lastIdx], amount_cents: totalCents - sumExceptLast };
      }
      return next;
    });
  }

  function toggleLinks(key: string) {
    setExpandedLinks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function effectiveVendorId(line: LineDraft): string | undefined {
    return mode === "single_vendor_multi_category" ? singleVendorId || undefined : line.vendor_id ?? undefined;
  }

  async function handleSave() {
    if (!transaction) return;
    setSaving(true);
    setCommitResults(null);
    try {
      const payloadLines: BankTransactionSplitLine[] = lines.map((l) => ({
        amount_cents: Math.round(Number(l.amount_cents) || 0),
        category_kind: l.category_kind || undefined,
        gl_account_id: l.gl_account_id || undefined,
        vendor_id: effectiveVendorId(l),
        customer_id: l.customer_id || undefined,
        driver_id: l.driver_id || undefined,
        unit_id: l.unit_id || undefined,
        trailer_id: l.trailer_id || undefined,
        load_id: l.load_id || undefined,
        item_id: l.item_id || undefined,
        memo: l.memo || undefined,
        recover_from_driver: l.driver_id ? Boolean(l.recover_from_driver) : undefined,
        recover_deduction_type: l.driver_id && l.recover_from_driver ? l.recover_deduction_type || undefined : undefined,
      }));
      await saveBankTransactionSplitDraft(transaction.id, companyId, { mode, lines: payloadLines });
      pushToast("Split saved", "success");
      onSaved();
      void existingQuery.refetch();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Split transactions are not enabled for this company yet (BANK_TX_SPLIT_ENABLED is OFF).", "error");
      } else {
        pushToast(userFacingApiError(error, "Could not save split"), "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCommit() {
    if (!transaction) return;
    setCommitting(true);
    try {
      const result = await commitBankTransactionSplit(transaction.id, companyId);
      setCommitResults(result.results);
      const posted = result.results.filter((r) => r.posted).length;
      pushToast(
        posted > 0
          ? `Split committed — ${posted} of ${result.results.length} line(s) posted to GL.`
          : "Split committed — lines saved and tagged (GL posting pending owner flag flip for non-advance lines).",
        "success"
      );
      onSaved();
    } catch (error) {
      pushToast(userFacingApiError(error, "Could not commit split"), "error");
    } finally {
      setCommitting(false);
    }
  }

  async function handleVoid() {
    if (!transaction) return;
    try {
      await voidBankTransactionSplit(transaction.id, companyId);
      pushToast("Split voided — transaction returned to pending categorization.", "success");
      onSaved();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Could not void split"), "error");
    }
  }

  return (
    <>
    <ParityDrawer open={open} onClose={onClose} title="Split transaction" size="wide">
      {!transaction ? null : (
        <div className="space-y-3 text-xs text-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-gray-50 p-2">
            <div>
              {/* LINK-F5190: transaction.id is the real banking.bank_transactions id (already used
                  throughout this modal's getBankTransactionSplits/save/commit/void calls) -- the
                  header only ever rendered its description as plain text. */}
              <div className="font-semibold text-gray-900">
                <EntityLink
                  kind="bank_transaction"
                  id={transaction.id}
                  label={transaction.description || "Bank transaction"}
                  className="font-semibold text-gray-900 hover:underline"
                />
              </div>
              <div className="text-gray-600">{transaction.is_credit ? "Money in" : "Money out"} · Total {formatUsdCents(totalCents)}</div>
            </div>
            <div className={`rounded-sm px-2 py-1 text-xs font-semibold ${remainingCents === 0 ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}>
              Remaining: {formatUsdCents(remainingCents)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Mode</span>
            <button
              type="button"
              className={`rounded-sm border px-2 py-1 text-xs ${mode === "single_vendor_multi_category" ? "border-slate-400 bg-slate-100 text-slate-800" : "border-gray-300 text-gray-600"}`}
              onClick={() => setMode("single_vendor_multi_category")}
            >
              One vendor, multiple categories
            </button>
            <button
              type="button"
              className={`rounded-sm border px-2 py-1 text-xs ${mode === "multi_vendor" ? "border-slate-400 bg-slate-100 text-slate-800" : "border-gray-300 text-gray-600"}`}
              onClick={() => setMode("multi_vendor")}
            >
              Multiple vendors
            </button>
          </div>

          {mode === "single_vendor_multi_category" ? (
            <div className="text-xs text-gray-600">
              <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Vendor (applies to every line)</span>
              <div className="mt-0.5 max-w-sm">
                <ReferenceSelect
                  value={singleVendorId || null}
                  onChange={(v) => setSingleVendorId(v ?? "")}
                  options={(vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
                  createKind="vendor"
                  operatingCompanyId={companyId}
                  placeholder="Select vendor (optional)"
                  onOptionCreated={() => void vendorsQuery.refetch()}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {lines.map((line, idx) => {
              const result = commitResults?.find((r) => r.line_no === idx + 1);
              const expanded = Boolean(expandedLinks[line._key]);
              const linkCount = [line.driver_id, line.unit_id, line.trailer_id, line.load_id].filter(Boolean).length;

              return (
                <div key={line._key} className="rounded-sm border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Line {idx + 1}</span>
                    <button
                      type="button"
                      className="text-slate-600 underline disabled:text-gray-300"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(line._key)}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Primary row: Category (GL account) OR Product/Service — QBO offers both, joined
                  by "or" per the approved screenshot — plus Vendor when in multi-vendor mode. */}
                  <div className={`mt-2 grid grid-cols-1 gap-2 md:items-end ${mode === "multi_vendor" ? "md:grid-cols-12" : "md:grid-cols-9"}`}>
                    {mode === "multi_vendor" ? (
                      <div className="md:col-span-3">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Vendor</span>
                        <ReferenceSelect
                          value={line.vendor_id ?? null}
                          onChange={(v) => patchLine(line._key, { vendor_id: v ?? undefined })}
                          options={(vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
                          createKind="vendor"
                          operatingCompanyId={companyId}
                          placeholder="Vendor"
                          onOptionCreated={() => void vendorsQuery.refetch()}
                        />
                      </div>
                    ) : null}
                    <div className="md:col-span-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Category</span>
                      <ReferenceSelect
                        value={line.gl_account_id ?? null}
                        onChange={(v) => {
                          const acct = (coaQuery.data?.accounts ?? []).find((a) => a.id === v);
                          patchLine(line._key, {
                            gl_account_id: v ?? undefined,
                            category_kind: acct?.account_name ?? line.category_kind,
                          });
                        }}
                        options={(coaQuery.data?.accounts ?? []).map((a) => ({
                          value: a.id,
                          label: a.account_name,
                          type: a.account_type ?? undefined,
                        }))}
                        createKind="category"
                        operatingCompanyId={companyId}
                        placeholder="Select category"
                        onOptionCreated={() => void coaQuery.refetch()}
                      />
                    </div>
                    <div className="hidden text-center text-[10px] text-gray-400 md:col-span-1 md:block md:pb-2">or</div>
                    <div className="md:col-span-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Product/Service</span>
                      <ReferenceSelect
                        value={line.item_id ?? null}
                        onChange={(v) => {
                          const item = (itemsQuery.data ?? []).find((it) => it.id === v);
                          const m = (item?.metadata ?? {}) as Record<string, unknown>;
                          const itemAccount =
                            (typeof m.default_expense_account_id === "string" && m.default_expense_account_id) ||
                            (typeof m.default_income_account_id === "string" && m.default_income_account_id) ||
                            "";
                          patchLine(line._key, {
                            item_id: v ?? undefined,
                            gl_account_id: line.gl_account_id || (itemAccount as string) || undefined,
                          });
                        }}
                        options={(itemsQuery.data ?? []).map((it) => ({ value: it.id, label: it.display_name }))}
                        createKind="service"
                        addNewLabel="+ Add new product/service"
                        operatingCompanyId={companyId}
                        placeholder="Select product/service"
                        onOptionCreated={() => void itemsQuery.refetch()}
                      />
                    </div>
                  </div>

                  {/* Primary row: Description (memo) + Amount — the two fields the owner said were
                  missing/cramped. Description writes to the EXISTING memo payload field. */}
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-12">
                    <div className="md:col-span-8">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Description</span>
                      <input
                        className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                        value={line.memo ?? ""}
                        onChange={(e) => patchLine(line._key, { memo: e.target.value })}
                        placeholder="Description"
                        aria-label={`Split line ${idx + 1} description`}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500 md:text-right">Amount</span>
                      <MoneyInput
                        valueCents={line.amount_cents || null}
                        onChangeCents={(cents) => patchLine(line._key, { amount_cents: cents ?? 0 })}
                        ariaLabel={`Split line ${idx + 1} amount`}
                        className="mt-0.5 w-full text-right"
                      />
                    </div>
                  </div>

                  {result ? (
                    <div className={`mt-1 text-[10px] ${result.posted ? "text-slate-700" : "text-gray-500"}`}>
                      {result.posted ? (
                        <>
                          Posted
                          {/* AP_BILL column-wave: bank-transaction-splits.service.ts genuinely
                              INSERTs a real accounting.bills row (source_bank_transaction_id
                              stamped) — this only ever rendered plain text, never a drill-through. */}
                          {result.bill_id ? (
                            <>
                              {" · "}
                              <EntityLink kind="bill" id={result.bill_id} label={`Bill · split line ${result.line_no}`} />
                            </>
                          ) : null}
                          {result.driver_advance_id ? (
                            <>
                              {" · "}
                              <EntityLink
                                kind="cash_advance"
                                id={result.driver_advance_id}
                                label={`Driver advance · split line ${result.line_no}`}
                              />
                            </>
                          ) : null}
                          {result.deduction_id ? (
                            <>
                              {" · "}
                              <EntityLink
                                kind="settlement_deduction"
                                id={result.deduction_id}
                                label={`Recovery deduction · split line ${result.line_no}`}
                              />
                            </>
                          ) : null}
                          {result.journal_entry_id ? (
                            <>
                              {" · "}
                              <EntityLink
                                kind="journal_entry"
                                id={result.journal_entry_id}
                                label={`Journal entry · split line ${result.line_no}`}
                              />
                            </>
                          ) : null}
                        </>
                      ) : (
                        result.reason
                      )}
                    </div>
                  ) : null}

                  {/* Secondary: trucking-link fields (Driver/Unit/Trailer/Trip) — behind a disclosure so
                  the primary row breathes, per owner feedback. */}
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-medium text-slate-600 underline"
                    onClick={() => toggleLinks(line._key)}
                  >
                    {expanded ? "− Hide detail/links" : `+ Add detail/links${linkCount > 0 ? ` (${linkCount})` : ""}`}
                  </button>

                  {expanded ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 rounded-sm border border-gray-100 bg-gray-50 p-2 md:grid-cols-4">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Driver</span>
                        <DriverAutocomplete
                          companyId={companyId}
                          value={line.driver_id ?? ""}
                          nestedInDrawer
                          onChange={(driverId, driverName, meta) => {
                            const driverAcct =
                              typeof meta?.default_expense_account_id === "string"
                                ? meta.default_expense_account_id
                                : "";
                            patchLine(line._key, {
                              driver_id: driverId || undefined,
                              _driverName: driverName ?? "",
                              // ACCT-F18 Option-B: prefill split-line GL when empty.
                              ...(driverAcct && !line.gl_account_id ? { gl_account_id: driverAcct } : {}),
                            });
                          }}
                          onRequestCreate={() => {}}
                        />
                        {line.driver_id ? (
                          <label className="mt-1 flex items-center gap-1 text-[10px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={Boolean(line.recover_from_driver)}
                              onChange={(e) => patchLine(line._key, { recover_from_driver: e.target.checked, recover_deduction_type: line.recover_deduction_type ?? "fine" })}
                            />
                            Recover from driver
                          </label>
                        ) : null}
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Unit</span>
                        <UnitAutocomplete
                          companyId={companyId}
                          value={line.unit_id ?? ""}
                          onChange={(unitId, unitName) => patchLine(line._key, { unit_id: unitId || undefined, _unitName: unitName })}
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Trailer</span>
                        <EntityPicker
                          kind="trailer"
                          operatingCompanyId={companyId}
                          value={line.trailer_id ?? null}
                          onChange={(trailerId) =>
                            patchLine(line._key, { trailer_id: trailerId || undefined, _trailerName: undefined })
                          }
                          nestedInDrawer
                          placeholder="Search trailer (optional)"
                          allowClear
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Trip (load)</span>
                        <EntityPicker
                          kind="load"
                          operatingCompanyId={companyId}
                          value={line.load_id ?? null}
                          onChange={(loadId) =>
                            patchLine(line._key, { load_id: loadId || undefined, _loadName: undefined })
                          }
                          nestedInDrawer
                          placeholder="Search trip / load (optional)"
                          allowClear
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <Button size="sm" variant="secondary" onClick={addLine}>
            + Add line
          </Button>

          <div className="flex items-center justify-between border-t border-gray-200 pt-2">
            <button type="button" className="text-red-700 underline" onClick={() => void handleVoid()}>
              Void split (return to pending)
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="secondary" loading={saving} disabled={remainingCents !== 0} onClick={() => void handleSave()}>
                Save split
              </Button>
              <Button loading={committing} disabled={remainingCents !== 0} onClick={() => void handleCommit()}>
                Save and close
              </Button>
            </div>
          </div>
        </div>
      )}
    </ParityDrawer>
    </>
  );
}
