// R-190 — Print Checks queue (QBO parity). Owner types the starting check number (never guessed),
// selects need_to_print checks, assigns numbers via assignPrintBatch, then confirms or reprints.
// U9 (owner UI register 2026-10-03) — each selected check shows the number it will print, PROPOSED from the stock and
// EDITABLE; the checks below an edited one continue from it; a number already used on the account is flagged and
// refused; numbers the batch skips are listed and need a reason, recorded on each skipped number.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { formatDateUS } from "../../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import {
  assignCheckPrintBatch,
  confirmCheckPrintBatch,
  getCheckStockSettings,
  listCheckPrintQueue,
  previewCheckPrintBatch,
  putCheckStockSettings,
  type PrintQueueRow,
} from "../../../api/checks";
import { getCashGlMapping } from "../../../api/banking";
import { openPrintableDocument } from "../../../lib/openPrintableDocument";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatUsdCents } from "../../../lib/money";

function formatMoneyCents(cents: number): string {
  return formatUsdCents(cents);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function gapLabel(g: { from: string; to: string }): string {
  return g.from === g.to ? `#${g.from}` : `#${g.from}–#${g.to}`;
}

export function CheckPrintPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // BANK-F91063 — Order checks lands here with ?focus=stock (stock settings, not print queue alone).
  const focusStock = searchParams.get("focus") === "stock";

  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [startingNumber, setStartingNumber] = useState("");
  const [checkType, setCheckType] = useState<"voucher" | "standard">("voucher");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [lastAssignments, setLastAssignments] = useState<Array<{ check_id: string; check_number: string }>>([]);
  const [reprintFrom, setReprintFrom] = useState("");
  // U9 — the owner's typed number per selected check id ("" = continue the sequence from the check above).
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [gapReason, setGapReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const banksQuery = useQuery({
    queryKey: ["checks", "print", "banks", companyId],
    queryFn: () => getCashGlMapping(companyId),
    enabled: Boolean(companyId),
  });
  const depositoryBanks = useMemo(
    () => (banksQuery.data?.bank_accounts ?? []).filter((a) => Boolean(a.ledger_account_id)),
    [banksQuery.data]
  );

  const stockQuery = useQuery({
    queryKey: ["checks", "stock", companyId, bankAccountId],
    queryFn: () => getCheckStockSettings(companyId, bankAccountId),
    enabled: Boolean(companyId && bankAccountId),
  });

  const queueQuery = useQuery({
    queryKey: ["checks", "print-queue", companyId, bankAccountId],
    queryFn: () => listCheckPrintQueue(companyId, bankAccountId),
    enabled: Boolean(companyId && bankAccountId),
  });

  const stockNext = stockQuery.data?.settings?.next_check_number ?? null;
  // ROUND 326 queue item 15: show the bank account's SAVED check style (this page used to start at 'voucher' and
  // overwrite the stored style on every save).
  const savedCheckType = stockQuery.data?.settings?.check_type ?? null;
  useEffect(() => {
    if (savedCheckType === "voucher" || savedCheckType === "standard") setCheckType(savedCheckType);
  }, [savedCheckType]);
  const rows = queueQuery.data?.rows ?? [];
  // Print order = queue order, never click order.
  const orderedIds = useMemo(() => rows.filter((r) => selectedIds.has(r.id)).map((r) => r.id), [rows, selectedIds]);
  const typedNumbers = useMemo(() => orderedIds.map((id) => (typed[id]?.trim() ? typed[id].trim() : null)), [orderedIds, typed]);
  const previewKey = useDebounced(JSON.stringify([orderedIds, typedNumbers]), 300);
  const previewQuery = useQuery({
    queryKey: ["checks", "print-preview", companyId, bankAccountId, checkType, previewKey],
    queryFn: () => {
      const [ids, numbers] = JSON.parse(previewKey) as [string[], Array<string | null>];
      return previewCheckPrintBatch({ operating_company_id: companyId, bank_account_id: bankAccountId, check_type: checkType, ids, numbers });
    },
    enabled: Boolean(companyId && bankAccountId && orderedIds.length > 0),
    retry: false,
  });
  const previewFresh = previewKey === JSON.stringify([orderedIds, typedNumbers]);
  const preview = previewFresh ? previewQuery.data : undefined;
  const proposedById = useMemo(
    () => new Map((preview?.assignments ?? []).map((a) => [a.check_id, a.check_number])),
    [preview]
  );
  const duplicateByNumber = useMemo(
    () => new Map((preview?.duplicates ?? []).map((d) => [d.check_number, d.held_by])),
    [preview]
  );
  const gapNeedsReason = (preview?.gap_count ?? 0) > 0 && gapReason.trim().length < 3;
  const canAssign =
    !busy && orderedIds.length > 0 && Boolean(preview) && !previewQuery.isError && duplicateByNumber.size === 0 && !gapNeedsReason;

  function editNumber(id: string, value: string) {
    setTyped((prev) => {
      const next = { ...prev, [id]: value.replace(/[^\d]/g, "") };
      // The sequence continues from what is typed: checks below this one drop their own edits and follow it.
      const at = orderedIds.indexOf(id);
      for (const later of orderedIds.slice(at + 1)) delete next[later];
      return next;
    });
  }

  const saveStockMutation = useMutation({
    mutationFn: () =>
      putCheckStockSettings({
        operating_company_id: companyId,
        bank_account_id: bankAccountId,
        next_check_number: startingNumber.trim() || null,
        check_type: checkType,
      }),
    onSuccess: async () => {
      pushToast("Starting check number saved.", "success");
      await queryClient.invalidateQueries({ queryKey: ["checks", "stock", companyId, bankAccountId] });
      await queryClient.invalidateQueries({ queryKey: ["checks", "next-number"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }

  async function handleAssign() {
    if (!bankAccountId || orderedIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // U9 — the numbers sent are exactly the ones shown; the stock's next number is moved by the batch itself
      // (continuing from the highest number printed), never silently overwritten here first.
      const result = await assignCheckPrintBatch({
        operating_company_id: companyId,
        bank_account_id: bankAccountId,
        check_type: checkType,
        ids: orderedIds,
        numbers: typedNumbers,
        gap_reason: gapReason.trim() || null,
      });
      setLastBatchId(result.print_batch_id);
      setLastAssignments(result.assignments);
      setSelectedIds(new Set());
      setTyped({});
      setGapReason("");
      const skipped = result.skipped.reduce((n, g) => n + g.count, 0);
      pushToast(
        `Assigned ${result.assignments.length} check number(s)${skipped ? `; ${skipped} skipped number(s) recorded` : ""}. Confirm the print below.`,
        "success"
      );
      await queryClient.invalidateQueries({ queryKey: ["checks"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign check numbers.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(allOk: boolean) {
    if (!lastBatchId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmCheckPrintBatch(
        companyId,
        lastBatchId,
        allOk ? { all_ok: true } : { reprint_from_number: reprintFrom.trim() }
      );
      pushToast(
        result.status === "confirmed" ? "Print confirmed." : `Reprint queued for ${result.spoiled_check_ids.length} check(s).`,
        "success"
      );
      if (result.status === "confirmed") {
        setLastBatchId(null);
        setLastAssignments([]);
      }
      await queryClient.invalidateQueries({ queryKey: ["checks"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm print batch.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<ParityColumn<PrintQueueRow>> = [
    {
      key: "select",
      label: "",
      sortable: false,
      className: "w-8 text-center",
      cellClass: "text-center",
      render: (row) => (
        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} aria-label="Select check" />
      ),
    },
    {
      key: "check_number",
      label: "Check no.",
      sortable: false,
      className: "w-36",
      render: (row) => {
        if (!selectedIds.has(row.id)) return <span className="text-gray-400">—</span>;
        const proposed = proposedById.get(row.id) ?? "";
        const shown = typed[row.id] !== undefined ? typed[row.id] : proposed;
        const dupBy = shown ? duplicateByNumber.get(String(BigInt(shown))) : undefined;
        return (
          <div>
            <input
              className={`h-8 w-28 rounded-sm border px-2 text-xs ${dupBy ? "border-red-500" : "border-gray-300"}`}
              value={shown}
              placeholder={proposed || "Type number"}
              onChange={(e) => editNumber(row.id, e.target.value)}
              aria-label={`Check number for ${row.print_on_check_name}`}
              data-testid="print-check-number"
            />
            {dupBy ? (
              <div className="mt-1 text-xs text-red-600" data-testid="print-check-duplicate">
                Already used — {dupBy}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "print_on_check_name",
      label: "Payee",
      sortable: false,
      render: (row) => (
        <Link to={`/accounting/checks/${row.id}`} className="text-[var(--accent-green)] underline">
          {row.print_on_check_name}
        </Link>
      ),
    },
    { key: "transaction_date", label: "Date", sortable: false, render: (row) => formatDateUS(row.transaction_date) },
    {
      key: "total_amount_cents",
      label: "Amount",
      sortable: false,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => formatMoneyCents(row.total_amount_cents),
    },
    { key: "memo", label: "Memo", sortable: false, render: (row) => row.memo ?? "—" },
  ];

  return (
    <AccountingSubNavWrapper
      title="Print checks"
      subtitle="Assign numbers to checks waiting to print"
      actions={
        <Link to="/accounting/checks" className="text-xs font-semibold text-[var(--accent-green)] hover:underline">
          ← All checks
        </Link>
      }
    >
      {!companyId ? (
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {error ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          <div
            className={`grid grid-cols-3 gap-3 rounded border bg-white p-3 ${
              focusStock ? "border-[#14314F] ring-1 ring-[#14314F]/40" : "border-gray-200"
            }`}
            data-b4-order-checks-stock="1"
            data-testid="b4-order-checks-stock"
            id="check-stock-settings"
          >
            {focusStock ? (
              <p className="col-span-3 text-xs font-semibold text-[#14314F]" data-testid="b4-order-checks-stock-banner">
                Order checks — set the starting check number and style for this bank account (check stock).
              </p>
            ) : null}
            <label className="text-xs font-semibold text-gray-700">
              Bank account
              <select
                className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                value={bankAccountId}
                onChange={(e) => {
                  setBankAccountId(e.target.value);
                  setSelectedIds(new Set());
                  setLastBatchId(null);
                  setLastAssignments([]);
                  setStartingNumber("");
                  setTyped({});
                  setGapReason("");
                }}
              >
                <option value="">Select bank account…</option>
                {depositoryBanks.map((a) => (
                  <option key={a.id} value={a.id} disabled={Boolean(a.account_class) && a.account_class !== "depository"}>
                    {a.account_name}
                    {a.account_class && a.account_class !== "depository" ? " — not a checking account" : ""}
                  </option>
                ))}
              </select>
              {bankAccountId ? (
                <EntityLink
                  kind="bank_account"
                  id={bankAccountId}
                  label={entityLabel(
                    depositoryBanks.find((a) => a.id === bankAccountId)?.account_name,
                    bankAccountId,
                    "Account",
                  )}
                  className="mt-1 block font-semibold text-[#1F2A44] underline"
                />
              ) : null}
            </label>

            <label className="text-xs font-semibold text-gray-700">
              Starting check no.
              <input
                className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                value={startingNumber}
                onChange={(e) => setStartingNumber(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={stockNext ?? "Type the first real number"}
              />
              <div className="mt-1 text-xs font-normal text-gray-500">
                {stockQuery.isLoading
                  ? "Loading stock…"
                  : stockNext
                    ? `Next on file: ${stockNext}`
                    : "No starting number yet — type the first real number from your check stock."}
              </div>
            </label>

            <label className="text-xs font-semibold text-gray-700">
              Check style
              <select
                className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                value={checkType}
                onChange={(e) => setCheckType(e.target.value as "voucher" | "standard")}
              >
                <option value="voucher">Voucher</option>
                <option value="standard">Standard</option>
              </select>
              <div className="mt-2">
                <Button
                  variant="tertiary"
                  disabled={!bankAccountId || !startingNumber.trim() || saveStockMutation.isPending}
                  onClick={() => saveStockMutation.mutate()}
                >
                  Save starting number
                </Button>
              </div>
            </label>
          </div>

          {!bankAccountId ? (
            <div className="text-xs text-gray-500">Pick a bank account to see checks waiting to print.</div>
          ) : queueQuery.isError ? (
            <ListErrorBanner onRetry={() => void queueQuery.refetch()} />
          ) : (
            <div className="rounded border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={rows.length > 0 && selectedIds.size === rows.length} onChange={toggleAll} />
                  Select all ({rows.length})
                </label>
                <Button variant="primary" disabled={!canAssign} onClick={() => void handleAssign()}>
                  {busy ? "Assigning…" : `Assign numbers (${orderedIds.length})`}
                </Button>
              </div>
              {orderedIds.length > 0 && previewQuery.isError && previewFresh ? (
                <div className="border-b border-gray-100 px-3 py-2 text-xs text-red-600" data-testid="print-preview-error">
                  {previewQuery.error instanceof Error ? previewQuery.error.message : "These check numbers cannot be used."}
                </div>
              ) : null}
              {preview && preview.gap_count > 0 ? (
                <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-3 py-2" data-testid="print-gap-panel">
                  <div className="text-xs text-gray-700">
                    These numbers skip {preview.gap_count} unused check{preview.gap_count > 1 ? "s" : ""}:{" "}
                    <span className="font-semibold">{preview.gaps.map(gapLabel).join(", ")}</span>. Each is recorded as a skipped
                    (voided) number with the reason below.
                  </div>
                  <label className="text-xs font-semibold text-gray-700">
                    Reason skipped
                    <input
                      className="mt-1 h-8 w-72 rounded-sm border border-gray-300 px-2 text-xs"
                      value={gapReason}
                      onChange={(e) => setGapReason(e.target.value)}
                      placeholder="e.g. two checks torn in the printer"
                      data-testid="print-gap-reason"
                    />
                  </label>
                </div>
              ) : null}
              <ParityTable<PrintQueueRow>
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                loading={queueQuery.isLoading}
                emptyText="No checks waiting to print for this bank account."
                pageSize={rows.length || 1}
                hidePager
                enableColumnResize={false}
                enableColumnReorder={false}
              />
            </div>
          )}

          {lastBatchId && lastAssignments.length > 0 ? (
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-600">Confirm print</div>
              <div className="mb-3 text-xs text-gray-700">
                Assigned: {lastAssignments.map((a) => `#${a.check_number}`).join(", ")}
              </div>
              {/* ROUND 326 queue item 15: the printable check face for each assigned check. */}
              <div className="mb-3 flex flex-wrap gap-2" data-testid="check-print-faces">
                {lastAssignments.map((a) => (
                  <Button
                    key={a.check_id}
                    variant="secondary"
                    onClick={() => openPrintableDocument(`/api/v1/checks/${a.check_id}.html?operating_company_id=${encodeURIComponent(companyId)}`)}
                  >
                    Print #{a.check_number}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="primary" disabled={busy} onClick={() => void handleConfirm(true)}>
                  All printed OK
                </Button>
                <label className="text-xs font-semibold text-gray-700">
                  Reprint from #
                  <input
                    className="mt-1 h-9 w-28 rounded-sm border border-gray-300 px-2 text-xs"
                    value={reprintFrom}
                    onChange={(e) => setReprintFrom(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="number"
                  />
                </label>
                <Button variant="tertiary" disabled={busy || !reprintFrom.trim()} onClick={() => void handleConfirm(false)}>
                  Reprint from number
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}
