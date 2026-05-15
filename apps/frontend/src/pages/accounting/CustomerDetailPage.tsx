import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText, List, Mail, Pencil, Plus, Printer, Settings, Video, MoreHorizontal, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { listInvoices, type Invoice } from "../../api/accounting";
import { getAccountingCustomer, listAccountingCustomers } from "../../api/accounting-qbo-entities";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents } from "../../lib/format";

/** Values shown in Type dropdown (spec). */
export const CUSTOMER_TX_TYPE_OPTIONS = [
  "All transactions",
  "All plus deposits",
  "Invoices",
  "Estimates",
  "Change orders",
  "Credit memos",
  "Sales Receipts",
  "Unbilled Income",
  "Money received",
  "Recently paid",
] as const;

/** Values shown in Status dropdown (spec). */
export const CUSTOMER_TX_STATUS_OPTIONS = [
  "All",
  "Open",
  "Overdue",
  "Paid",
  "Pending",
  "Accepted",
  "Closed",
  "Converted",
  "Declined",
  "Expired",
] as const;

function formatDateMDY(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function invoiceToUiStatus(inv: Invoice): string {
  if (inv.status === "void") return "Voided";
  if (inv.status === "paid") return "Paid";
  if (inv.status === "partial") return "Open";
  if (inv.status === "sent") return "Open";
  if (inv.status === "draft") return "Pending";
  if (inv.status === "factored") return "Closed";
  return "Open";
}

function matchesStatusFilter(inv: Invoice, statusFilter: string): boolean {
  if (statusFilter === "All") return true;
  if (inv.status === "void") return false;
  if (statusFilter === "Paid") return inv.status === "paid";
  if (statusFilter === "Open") return inv.status === "partial" || inv.status === "sent";
  if (statusFilter === "Pending") return inv.status === "draft";
  if (statusFilter === "Closed") return inv.status === "factored";
  if (statusFilter === "Overdue") {
    const due = inv.due_date ? new Date(inv.due_date).getTime() : 0;
    return due > 0 && due < Date.now() && (inv.status === "partial" || inv.status === "sent");
  }
  return invoiceToUiStatus(inv) === statusFilter;
}

function matchesTypeFilter(_inv: Invoice, typeFilter: string): boolean {
  if (typeFilter === "Invoices") return true;
  if (typeFilter === "All transactions" || typeFilter === "All plus deposits") return true;
  return false;
}

function statusBadgeClasses(label: string, voided: boolean) {
  if (voided) return "border border-gray-300 bg-gray-100 text-gray-600 line-through";
  if (label === "Paid" || label === "Closed") return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  if (label === "Open" || label === "Overdue") return "border border-amber-200 bg-amber-50 text-amber-900";
  if (label === "Pending") return "border border-gray-200 bg-gray-50 text-gray-700";
  return "border border-gray-200 bg-gray-50 text-gray-700";
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

export function CustomerDetailPage() {
  const { id: customerId = "" } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [tab, setTab] = useState<"tx" | "activity" | "statements" | "recurring" | "projects" | "details" | "late_fees" | "notes" | "tasks" | "opps" | "conv">(
    "tx"
  );
  const [typeFilter, setTypeFilter] = useState<string>("All plus deposits");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeOpen, setTypeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const detailQ = useQuery({
    queryKey: ["accounting", "customer", companyId, customerId],
    queryFn: async () => {
      try {
        return await getAccountingCustomer(customerId, companyId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: Boolean(companyId && customerId),
  });

  const railQ = useQuery({
    queryKey: ["accounting", "customers-rail", companyId],
    queryFn: () => listAccountingCustomers(companyId, { limit: 20 }),
    enabled: Boolean(companyId),
  });

  const invQ = useQuery({
    queryKey: ["accounting", "invoices", companyId, customerId],
    queryFn: async () => {
      try {
        const res = await listInvoices(companyId, { customer_id: customerId });
        return res.invoices ?? [];
      } catch {
        return [] as Invoice[];
      }
    },
    enabled: Boolean(companyId && customerId) && tab === "tx",
  });

  const name = detailQ.data?.display_name ?? "…";
  const openBal = detailQ.data?.open_balance_cents ?? 0;
  const overdueBal = detailQ.data?.overdue_balance_cents ?? 0;

  const filteredInvoices = useMemo(() => {
    const rows = invQ.data ?? [];
    return rows.filter((inv) => matchesTypeFilter(inv, typeFilter) && matchesStatusFilter(inv, statusFilter));
  }, [invQ.data, statusFilter, typeFilter]);

  const total = filteredInvoices.length;
  const startIdx = (page - 1) * pageSize;
  const pageRows = filteredInvoices.slice(startIdx, startIdx + pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex min-h-0 flex-1 gap-0 bg-gray-100">
      {/* Left rail */}
      <aside className="hidden w-[220px] shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2 border-b border-gray-100 p-2">
          <button type="button" className="rounded p-1 hover:bg-gray-50" aria-label="Create">
            <Plus className="h-5 w-5 text-gray-600" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-gray-50" aria-label="List view">
            <List className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        <div className="p-2">
          <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Search by name or details" aria-label="Search customers in rail" />
        </div>
        <div className="px-2 pb-2">
          <label className="text-[10px] font-semibold uppercase text-gray-500">Sort</label>
          <div className="mt-1 flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-800">
            <span aria-hidden>↻</span> Name
            <ChevronDown className="ml-auto h-3 w-3 text-gray-400" aria-hidden />
          </div>
        </div>
        <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Recently viewed customers</p>
        <div className="flex-1 overflow-y-auto">
          {(railQ.data?.items ?? []).map((c) => (
            <Link
              key={c.id}
              to={`/customers/${c.id}`}
              className={`flex items-start justify-between gap-1 px-3 py-2 text-xs hover:bg-gray-50 ${c.id === customerId ? "bg-emerald-50" : ""}`}
            >
              <span className="truncate text-gray-900">{c.display_name}</span>
              <span className="shrink-0 text-gray-500">{formatCurrencyCents(c.open_balance_cents ?? 0)}</span>
            </Link>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky header row */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/customers" className="text-sm font-medium text-blue-600 hover:underline">
                &lt; Customers
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="/help" className="text-sm text-blue-600 hover:underline">
                Give feedback
              </a>
              <Button variant="secondary" className="inline-flex items-center gap-1 border border-gray-300 bg-white text-sm" aria-label="Edit customer">
                Edit
                <ChevronDown className="h-4 w-4" aria-hidden />
              </Button>
              <Button className="inline-flex items-center gap-1 bg-emerald-600 text-sm text-white" aria-label="New transaction menu">
                New transaction
                <ChevronDown className="h-4 w-4 text-white/90" aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        {/* Customer card */}
        <div className="border-b border-gray-200 bg-white px-4 py-4">
          <div className="flex flex-wrap gap-6">
            <div className="w-full max-w-[250px] shrink-0">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-lg font-semibold text-teal-800">{initials(name)}</div>
              <h2 className="mt-3 text-2xl font-semibold text-gray-900">{name}</h2>
              <button type="button" className="mt-1 text-xs text-blue-600 hover:underline">
                Add company name
              </button>
              <div className="mt-3 flex gap-2 text-gray-500">
                <Mail className="h-4 w-4" aria-hidden />
                <FileText className="h-4 w-4" aria-hidden />
                <Pencil className="h-4 w-4" aria-hidden />
                <Video className="h-4 w-4" aria-hidden />
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Email</div>
                  <div className="mt-1 text-blue-600">{detailQ.data?.email ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Billing address</div>
                  <div className="mt-1 whitespace-pre-wrap text-gray-800">{detailQ.data?.billing_address ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Notes</div>
                  <button type="button" className="mt-1 text-blue-600 hover:underline">
                    Add notes
                  </button>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Phone</div>
                  <button type="button" className="mt-1 text-blue-600 hover:underline">
                    Add phone number
                  </button>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Shipping address (same as billing address)</div>
                  <div className="mt-1 whitespace-pre-wrap text-gray-800">{detailQ.data?.shipping_address ?? detailQ.data?.billing_address ?? "—"}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Custom Fields</span>
                  <Pencil className="h-3 w-3 text-gray-400" aria-hidden />
                </div>
              </div>
            </div>

            <div className="w-full max-w-[220px] shrink-0 rounded-lg bg-cyan-50 p-4 text-xs shadow-inner">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <span aria-hidden>$</span>
                Financial summary
              </div>
              <div className="mt-4 flex items-center gap-2 text-gray-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Open balance
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{formatCurrencyCents(openBal)}</div>
              <div className="mt-3 flex items-center gap-2 text-gray-800">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
                Overdue payment
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{formatCurrencyCents(overdueBal)}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="sticky top-[52px] z-10 border-b border-gray-200 bg-white px-2">
          <div className="flex flex-wrap gap-1 overflow-x-auto text-xs font-medium">
            {(
              [
                ["tx", "Transaction List"],
                ["activity", "Activity Feed"],
                ["statements", "Statements"],
                ["recurring", "Recurring Transactions"],
                ["projects", "Projects"],
                ["details", "Customer Details"],
                ["late_fees", "Late Fees"],
                ["notes", "Notes"],
                ["tasks", "Tasks"],
                ["opps", "Opportunities"],
                ["conv", "Conversations"],
              ] as const
            ).map(([k, lab]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`relative whitespace-nowrap px-3 py-3 ${
                  tab === k ? "font-bold text-gray-900 after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-emerald-600" : "text-gray-600 hover:text-gray-900"
                }`}
                aria-current={tab === k ? "page" : undefined}
              >
                {lab}
                {k === "tasks" || k === "conv" ? (
                  <span className="ml-1 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">New</span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        {tab === "tx" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 text-xs">
              <Button variant="secondary" className="border border-gray-300 bg-white text-xs" aria-label="Batch actions">
                Batch actions
                <ChevronDown className="h-3 w-3" aria-hidden />
              </Button>

              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1"
                  aria-haspopup="listbox"
                  aria-expanded={typeOpen}
                  onClick={() => {
                    setTypeOpen((v) => !v);
                    setStatusOpen(false);
                  }}
                  aria-label="Type filter"
                >
                  Type
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
                {typeOpen ? (
                  <ul className="absolute left-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded border border-gray-200 bg-white py-1 shadow-lg" role="listbox" aria-label="Transaction type options">
                    {CUSTOMER_TX_TYPE_OPTIONS.map((opt) => (
                      <li key={opt} role="option" aria-selected={typeFilter === opt}>
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                          onClick={() => {
                            setTypeFilter(opt);
                            setTypeOpen(false);
                          }}
                        >
                          {typeFilter === opt ? "✓ " : null}
                          {opt}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1"
                  aria-haspopup="listbox"
                  aria-expanded={statusOpen}
                  onClick={() => {
                    setStatusOpen((v) => !v);
                    setTypeOpen(false);
                  }}
                  aria-label="Status filter"
                >
                  Status
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
                {statusOpen ? (
                  <ul className="absolute left-0 z-30 mt-1 w-48 rounded border border-gray-200 bg-white py-1 shadow-lg" role="listbox" aria-label="Transaction status options">
                    {CUSTOMER_TX_STATUS_OPTIONS.map((opt) => (
                      <li key={opt} role="option" aria-selected={statusFilter === opt}>
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                          onClick={() => {
                            setStatusFilter(opt);
                            setStatusOpen(false);
                          }}
                        >
                          {statusFilter === opt ? "✓ " : null}
                          {opt}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <Button variant="secondary" className="border border-gray-300 bg-white text-xs" aria-label="Date filter">
                Date
                <ChevronDown className="h-3 w-3" aria-hidden />
              </Button>

              <div className="ml-auto flex items-center gap-3 text-blue-600">
                <button type="button" className="text-xs hover:underline">
                  View Recurring Templates
                </button>
                <button type="button" className="text-xs hover:underline">
                  Feedback
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-end gap-2">
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-200" aria-label="Print">
                  <Printer className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-200" aria-label="Export">
                  <Download className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-200" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-200" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="w-8 px-2 py-2">
                          <input type="checkbox" aria-label="Select all transactions" />
                        </th>
                        <th className="px-2 py-2">
                          <button type="button" className="font-semibold" aria-label="Sort by date">
                            Date
                            <span className="text-gray-400">▼</span>
                          </button>
                        </th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">No.</th>
                        <th className="px-2 py-2">Customer</th>
                        <th className="px-2 py-2">Memo</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pageRows.map((inv) => {
                        const voided = inv.status === "void";
                        const uiStatus = voided ? "Voided" : invoiceToUiStatus(inv);
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2">
                              <input type="checkbox" aria-label={`Select transaction ${inv.display_id}`} />
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 tabular-nums text-gray-800">{formatDateMDY(inv.issue_date)}</td>
                            <td className="px-2 py-2 text-gray-800">Invoice</td>
                            <td className="px-2 py-2">
                              <Link to={`/accounting/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                                {inv.display_id}
                              </Link>
                            </td>
                            <td className="px-2 py-2 text-gray-800">{name}</td>
                            <td className={`px-2 py-2 text-gray-700 ${voided ? "line-through" : ""}`}>{voided ? "Voided" : inv.internal_notes ?? "—"}</td>
                            <td className={`px-2 py-2 text-right tabular-nums ${voided ? "line-through" : ""}`}>{formatCurrencyCents(voided ? 0 : inv.total_cents)}</td>
                            <td className="px-2 py-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClasses(uiStatus, voided)}`}>
                                {uiStatus}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <button type="button" className="text-blue-600 hover:underline" aria-label={`View or edit ${inv.display_id}`}>
                                View/Edit
                                <ChevronDown className="inline h-3 w-3" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-xs text-gray-600">
                  <span>
                    {total === 0 ? "0" : `${startIdx + 1}-${Math.min(startIdx + pageSize, total)}`} of {total} total
                  </span>
                  <div className="flex items-center gap-2">
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      →
                    </button>
                  </div>
                </footer>
              </div>
            </div>
          </>
        ) : tab === "activity" || tab === "statements" || tab === "recurring" ? (
          <div className="p-8 text-sm text-gray-600">Loading data for {tab}…</div>
        ) : (
          <div className="p-8 text-sm text-gray-600">
            {tab === "projects" || tab === "tasks" || tab === "opps" || tab === "conv" ? "Coming soon" : "This section is under construction."}
          </div>
        )}
      </div>

    </div>
  );
}
