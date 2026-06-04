import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { listBills, listPaymentsForBill, type BillStatus, type VendorBill } from "../../api/accounting";
import { BillAllocationPanel } from "../../components/allocation";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";

export const BILL_LIST_CATEGORIES = ["maintenance", "repair", "fuel", "driver"] as const;
export type BillListCategory = (typeof BILL_LIST_CATEGORIES)[number];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusBadgeClass(status: BillStatus) {
  if (status === "paid") return "bg-green-100 text-green-800";
  if (status === "partial") return "bg-amber-100 text-amber-900";
  if (status === "voided") return "bg-gray-200 text-gray-700";
  return "bg-red-50 text-red-800";
}

function parseBillCategory(raw: string | null): BillListCategory | "" {
  if (!raw) return "";
  return (BILL_LIST_CATEGORIES as readonly string[]).includes(raw) ? (raw as BillListCategory) : "";
}

function billMatchesCategory(bill: VendorBill, category: BillListCategory): boolean {
  const hay = `${bill.memo ?? ""} ${bill.bill_number ?? ""} ${bill.vendor_name ?? ""}`.toLowerCase();
  if (category === "maintenance") return /maint|shop|pm\b|work.?order/.test(hay);
  if (category === "repair") return /repair|roadside|breakdown/.test(hay);
  if (category === "fuel") return /fuel|diesel|loves|def\b/.test(hay);
  return /driver|settlement|advance|payroll|escrow/.test(hay);
}

export function BillsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const bulk = useEntityBulkAction();
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseBillCategory(searchParams.get("category"));
  const [status, setStatus] = useState<"" | BillStatus | "unpaid">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allocationBillId, setAllocationBillId] = useState<string | null>(null);

  const billsQuery = useQuery({
    queryKey: ["accounting", "bills", companyId, status, category],
    queryFn: () =>
      listBills(companyId, {
        include_balance: true,
        status: status || undefined,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const paymentsQuery = useQuery({
    queryKey: ["accounting", "bill-payments", companyId, expandedId],
    queryFn: () => listPaymentsForBill(expandedId!, companyId),
    enabled: Boolean(companyId && expandedId),
  });

  const rows = useMemo(() => {
    const all = billsQuery.data?.rows ?? [];
    if (!category) return all;
    return all.filter((bill) => billMatchesCategory(bill, category));
  }, [billsQuery.data?.rows, category]);
  const pageRowIds = useMemo(() => rows.map((bill) => bill.id), [rows]);

  const runScheduleBulk = async () => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    if (!scheduledDate) {
      pushToast("Choose a scheduled payment date.", "error");
      return;
    }
    setScheduleModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "accounting",
          resource: "bills",
          ids: Array.from(selection.selectedIds),
          action: "mark_scheduled",
          payload: { scheduled_date: scheduledDate },
          operatingCompanyId: companyId,
          invalidateKeys: [["accounting", "bills", companyId]],
        },
        () => {
          selection.clear();
          void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Bulk bill update failed", "error");
    }
  };

  const expandedBill = useMemo(() => rows.find((b) => b.id === expandedId) ?? null, [rows, expandedId]);
  const allocationBill = useMemo(() => rows.find((b) => b.id === allocationBillId) ?? null, [rows, allocationBillId]);

  function setCategory(next: BillListCategory | "") {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!next) params.delete("category");
        else params.set("category", next);
        return params;
      },
      { replace: false }
    );
  }

  function toggleExpand(bill: VendorBill) {
    if (bill.status !== "partial") return;
    setExpandedId((cur) => (cur === bill.id ? null : bill.id));
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Bills" subtitle="Vendor bills with paid balance and partial payment history" />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {billsQuery.isError ? <ListErrorBanner onRetry={() => void billsQuery.refetch()} /> : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Category:</span>
        <button
          type="button"
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${!category ? "border-sky-600 bg-sky-50 text-sky-800" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          onClick={() => setCategory("")}
        >
          All
        </button>
        {BILL_LIST_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
              category === cat ? "border-sky-600 bg-sky-50 text-sky-800" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Status:</span>
        <SelectCombobox className="rounded border border-gray-300 px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">All open items</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="voided">Voided</option>
        </SelectCombobox>
      </div>

      <BulkActionBar
        selectedCount={selection.count}
        actions={[{ id: "mark-scheduled", label: "Mark scheduled", onClick: () => setScheduleModalOpen(true) }]}
        onClear={selection.clear}
      />

      <TableSelection
        rows={rows}
        getId={(bill) => bill.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        onCapExceeded={(message) => pushToast(message, "error")}
      >
        {(selectCtx) => (
      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 w-8">
                <TableSelectionHeader
                  selectedIds={selection.selectedIds}
                  pageRowIds={pageRowIds}
                  onSelectionChange={selection.setSelectedIds}
                  onCapExceeded={(message) => pushToast(message, "error")}
                />
              </th>
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Bill #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Original</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Allocate</th>
            </tr>
          </thead>
          <tbody>
            {billsQuery.isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!billsQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-gray-500">
                  No bills found.
                </td>
              </tr>
            ) : null}
            {rows.map((bill) => {
              const bal = bill.balance_cents ?? Math.max(0, bill.amount_cents - bill.paid_cents);
              const expand = bill.status === "partial";
              const open = expandedId === bill.id;
              return (
                <Fragment key={bill.id}>
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select bill ${bill.bill_number || bill.id}`}
                        checked={selectCtx.isSelected(bill.id)}
                        onChange={() => selectCtx.toggle(bill.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {expand ? (
                        <button type="button" className="text-gray-700" onClick={() => toggleExpand(bill)} aria-label={open ? "Collapse payments" : "Expand payments"}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{bill.vendor_name || bill.vendor_id || "—"}</td>
                    <td className="px-3 py-2">{bill.bill_number || bill.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{bill.bill_date}</td>
                    <td className="px-3 py-2 text-right">{money(bill.amount_cents)}</td>
                    <td className="px-3 py-2 text-right">{money(bill.paid_cents)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(bal)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(bill.status)}`}>{bill.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {bill.status === "voided" ? (
                        "—"
                      ) : (
                        <button
                          type="button"
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                            allocationBillId === bill.id
                              ? "border-sky-600 bg-sky-50 text-sky-800"
                              : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                          }`}
                          onClick={() => setAllocationBillId((current) => (current === bill.id ? null : bill.id))}
                        >
                          {allocationBillId === bill.id ? "Selected" : "Allocate"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expand && open ? (
                    <tr key={`${bill.id}-sub`} className="bg-gray-50">
                      <td colSpan={10} className="px-3 py-2">
                        {paymentsQuery.isLoading && expandedBill?.id === bill.id ? (
                          <div className="text-xs text-gray-500">Loading payments…</div>
                        ) : (
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-gray-600">
                                <th className="py-1 pr-2">Payment date</th>
                                <th className="py-1 pr-2 text-right">Amount</th>
                                <th className="py-1 pr-2">Bank account</th>
                                <th className="py-1 pr-2">Memo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(paymentsQuery.data?.payments ?? []).map((p) => (
                                <tr key={p.id}>
                                  <td className="py-1 pr-2">{p.payment_date}</td>
                                  <td className="py-1 pr-2 text-right">{money(p.amount_cents)}</td>
                                  <td className="py-1 pr-2 font-mono text-[10px]">{p.from_bank_account_id ? p.from_bank_account_id.slice(0, 8) : "—"}</td>
                                  <td className="py-1 pr-2 text-gray-700">{p.memo || p.reference_number || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
        )}
      </TableSelection>

      <BulkActionModal
        open={scheduleModalOpen}
        actionLabel="Mark scheduled"
        affectedCount={selection.count}
        description="Set a scheduled payment date on selected open bills."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Scheduled date
            <input
              type="date"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
            />
          </label>
        }
        onCancel={() => setScheduleModalOpen(false)}
        onConfirm={() => void runScheduleBulk()}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/accounting/bills?bill_id=${encodeURIComponent(id)}`}
      />

      {allocationBill && companyId ? (
        <BillAllocationPanel
          companyId={companyId}
          billId={allocationBill.id}
          billLabel={`${allocationBill.vendor_name || allocationBill.vendor_id || "Vendor"} · ${allocationBill.bill_number || allocationBill.id.slice(0, 8)}`}
          billAmountCents={allocationBill.amount_cents}
        />
      ) : null}
    </div>
  );
}
