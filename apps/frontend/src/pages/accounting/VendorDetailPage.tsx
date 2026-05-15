import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText, List, Mail, Pencil, Plus, Printer, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { listBills, type VendorBill } from "../../api/accounting";
import { get1099FormPdf } from "../../api/accounting-wave2";
import { getAccountingVendor, listAccountingVendors } from "../../api/accounting-qbo-entities";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents } from "../../lib/format";

export const VENDOR_TX_TYPE_OPTIONS = [
  "All transactions",
  "All plus deposits",
  "Bills",
  "Estimates",
  "Credit memos",
  "Checks",
  "Bill payments",
  "Recently paid",
] as const;

export const VENDOR_TX_STATUS_OPTIONS = [
  "All",
  "Open",
  "Overdue",
  "Paid",
  "Pending",
  "Voided",
  "Partial",
  "Closed",
  "Converted",
  "Expired",
] as const;

function formatDateMDY(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function billUiStatus(b: VendorBill): string {
  if (b.status === "voided") return "Voided";
  if (b.status === "paid") return "Paid";
  if (b.status === "partial") return "Partial";
  return "Open";
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

export function VendorDetailPage() {
  const { id: vendorId = "" } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();

  const [tab, setTab] = useState<"tx" | "1099" | "details">("tx");
  const [typeOpen, setTypeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("All plus deposits");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const detailQ = useQuery({
    queryKey: ["accounting", "vendor", companyId, vendorId],
    queryFn: async () => {
      try {
        return await getAccountingVendor(vendorId, companyId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: Boolean(companyId && vendorId),
  });

  const railQ = useQuery({
    queryKey: ["accounting", "vendors-rail", companyId],
    queryFn: () => listAccountingVendors(companyId, { limit: 20 }),
    enabled: Boolean(companyId),
  });

  const billsQ = useQuery({
    queryKey: ["accounting", "bills", companyId, vendorId],
    queryFn: async () => {
      const res = await listBills(companyId, { vendor_id: vendorId, include_balance: true, limit: 200 });
      return res.rows ?? [];
    },
    enabled: Boolean(companyId && vendorId) && tab === "tx",
  });

  const name = detailQ.data?.display_name ?? "…";

  const filteredBills = useMemo(() => {
    let rows = billsQ.data ?? [];
    if (statusFilter !== "All") {
      rows = rows.filter((b) => {
        if (statusFilter === "Voided") return b.status === "voided";
        if (statusFilter === "Paid") return b.status === "paid";
        if (statusFilter === "Open") return b.status === "open";
        if (statusFilter === "Partial") return b.status === "partial";
        return billUiStatus(b) === statusFilter;
      });
    }
    if (typeFilter === "Bills" || typeFilter === "All transactions" || typeFilter === "All plus deposits") return rows;
    return rows;
  }, [billsQ.data, statusFilter, typeFilter]);

  const download1099 = async () => {
    try {
      const blob = (await get1099FormPdf(vendorId, companyId, new Date().getFullYear())) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `1099-${vendorId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast("1099 PDF downloaded", "success");
    } catch (e) {
      pushToast(String((e as Error).message ?? "1099 download failed"), "error");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-0 bg-gray-100">
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
          <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Search by name or details" aria-label="Search vendors in rail" />
        </div>
        <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Recently viewed vendors</p>
        <div className="flex-1 overflow-y-auto">
          {(railQ.data?.items ?? []).map((v) => (
            <Link
              key={v.id}
              to={`/vendors/${v.id}`}
              className={`flex items-start justify-between gap-1 px-3 py-2 text-xs hover:bg-gray-50 ${v.id === vendorId ? "bg-emerald-50" : ""}`}
            >
              <span className="truncate text-gray-900">{v.display_name}</span>
              <span className="shrink-0 text-gray-500">{formatCurrencyCents(v.open_balance_cents ?? 0)}</span>
            </Link>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/vendors" className="text-sm font-medium text-blue-600 hover:underline">
              &lt; Vendors
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <a href="/help" className="text-sm text-blue-600 hover:underline">
                Give feedback
              </a>
              <Button variant="secondary" className="inline-flex items-center gap-1 border border-gray-300 bg-white text-sm" aria-label="Edit vendor">
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

        <div className="border-b border-gray-200 bg-white px-4 py-4">
          <div className="flex flex-wrap gap-6">
            <div className="w-full max-w-[250px] shrink-0">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-lg font-semibold text-violet-800">{initials(name)}</div>
              <h2 className="mt-3 text-2xl font-semibold text-gray-900">{name}</h2>
              <div className="mt-3 flex gap-2 text-gray-500">
                <Mail className="h-4 w-4" aria-hidden />
                <FileText className="h-4 w-4" aria-hidden />
                <Pencil className="h-4 w-4" aria-hidden />
                <Video className="h-4 w-4" aria-hidden />
              </div>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-6 text-xs md:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-gray-500">Email</div>
                <div className="mt-1 text-blue-600">{detailQ.data?.email ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-gray-500">Phone</div>
                <div className="mt-1 text-gray-800">{detailQ.data?.phone ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <nav className="border-b border-gray-200 bg-white px-2">
          <div className="flex gap-1 text-xs font-medium">
            {(
              [
                ["tx", "Transaction List"],
                ["1099", "1099"],
                ["details", "Vendor Details"],
              ] as const
            ).map(([k, lab]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`relative px-3 py-3 ${tab === k ? "font-bold text-gray-900 after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-emerald-600" : "text-gray-600"}`}
                aria-current={tab === k ? "page" : undefined}
              >
                {lab}
              </button>
            ))}
          </div>
        </nav>

        {tab === "tx" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 text-xs">
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1"
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
                  <ul className="absolute left-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded border border-gray-200 bg-white py-1 shadow-lg" role="listbox">
                    {VENDOR_TX_TYPE_OPTIONS.map((opt) => (
                      <li key={opt} role="option">
                        <button
                          type="button"
                          className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
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
                  <ul className="absolute left-0 z-30 w-48 rounded border border-gray-200 bg-white py-1 shadow-lg" role="listbox">
                    {VENDOR_TX_STATUS_OPTIONS.map((opt) => (
                      <li key={opt} role="option">
                        <button
                          type="button"
                          className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
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
            </div>
            <div className="flex justify-end gap-2 bg-gray-50 p-2">
              <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-200" aria-label="Print">
                <Printer className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-x-auto bg-gray-50 p-4">
              <table className="min-w-full border border-gray-200 bg-white text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">No.</th>
                    <th className="px-2 py-2">Memo</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBills.map((b) => {
                    const voided = b.status === "voided";
                    return (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2">{formatDateMDY(b.bill_date)}</td>
                        <td className="px-2 py-2">Bill</td>
                        <td className="px-2 py-2">
                          <Link to={`/accounting/bills/${b.id}`} className="text-blue-600 hover:underline">
                            {b.bill_number ?? b.id}
                          </Link>
                        </td>
                        <td className={`px-2 py-2 ${voided ? "line-through text-gray-600" : ""}`}>{voided ? "Voided" : b.memo ?? "—"}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${voided ? "line-through" : ""}`}>{formatCurrencyCents(voided ? 0 : b.amount_cents)}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${voided ? "line-through" : ""}`}>{billUiStatus(b)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === "1099" ? (
          <div className="space-y-4 p-6">
            <p className="text-sm text-gray-700">Annual 1099 totals and form generation for this vendor.</p>
            <Button className="bg-emerald-600 text-white" onClick={() => void download1099()} aria-label="Generate 1099 NEC form">
              Generate 1099-NEC
            </Button>
          </div>
        ) : (
          <div className="p-6 text-sm text-gray-600">Vendor profile editor — use Edit in the header.</div>
        )}
      </div>
    </div>
  );
}
