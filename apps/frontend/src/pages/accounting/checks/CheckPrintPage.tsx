// R-190 — Print Checks queue (QBO parity). Owner types the starting check number (never guessed),
// selects need_to_print checks, assigns numbers via assignPrintBatch, then confirms or reprints.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  putCheckStockSettings,
  type PrintQueueRow,
} from "../../../api/checks";
import { getCashGlMapping } from "../../../api/banking";

function formatMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CheckPrintPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [startingNumber, setStartingNumber] = useState("");
  const [checkType, setCheckType] = useState<"voucher" | "standard">("voucher");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [lastAssignments, setLastAssignments] = useState<Array<{ check_id: string; check_number: string }>>([]);
  const [reprintFrom, setReprintFrom] = useState("");
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
  const rows = queueQuery.data?.rows ?? [];

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
    if (!bankAccountId || selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (startingNumber.trim() && startingNumber.trim() !== (stockNext ?? "")) {
        await putCheckStockSettings({
          operating_company_id: companyId,
          bank_account_id: bankAccountId,
          next_check_number: startingNumber.trim(),
          check_type: checkType,
        });
      }
      const result = await assignCheckPrintBatch({
        operating_company_id: companyId,
        bank_account_id: bankAccountId,
        check_type: checkType,
        ids: [...selectedIds],
      });
      setLastBatchId(result.print_batch_id);
      setLastAssignments(result.assignments);
      setSelectedIds(new Set());
      pushToast(`Assigned ${result.assignments.length} check number(s). Confirm the print below.`, "success");
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
      pushToast(result.status === "confirmed" ? "Print confirmed." : `Reprint queued for ${result.spoiled_check_ids.length} check(s).`, "success");
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
      key: "print_on_check_name",
      label: "Payee",
      sortable: false,
      render: (row) => (
        <Link to={`/accounting/checks/${row.id}`} className="text-blue-700 underline">
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
        <Link to="/accounting/checks" className="text-xs font-semibold text-blue-700 hover:underline">
          ← All checks
        </Link>
      }
    >
      {!companyId ? (
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {error ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          <div className="grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3">
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
                }}
              >
                <option value="">Select bank account…</option>
                {depositoryBanks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
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
                <Button variant="primary" disabled={busy || selectedIds.size === 0 || (!stockNext && !startingNumber.trim())} onClick={() => void handleAssign()}>
                  {busy ? "Assigning…" : `Assign numbers (${selectedIds.size})`}
                </Button>
              </div>
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
