import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  listBills,
  listInvoices,
  listPayments,
  type Invoice,
  type Payment,
  type VendorBill,
} from "../../api/accounting";
import { listCustomers, listVendors, type Customer, type VendorOption } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type GroupRow = { key: string; count: number; totalCents: number };

function foldGroups<T>(rows: T[], keyFn: (row: T) => string, centsFn: (row: T) => number): GroupRow[] {
  const map = new Map<string, { count: number; totalCents: number }>();
  for (const row of rows) {
    const key = keyFn(row) || "—";
    const prev = map.get(key) ?? { count: 0, totalCents: 0 };
    prev.count += 1;
    prev.totalCents += centsFn(row);
    map.set(key, prev);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, count: v.count, totalCents: v.totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

function HubSection({ title, to, groups, loading }: { title: string; to: string; groups: GroupRow[]; loading: boolean }) {
  return (
    <details open className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          <Link to={to} className="text-xs font-medium text-sky-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            Open list
          </Link>
        </div>
      </summary>
      <div className="border-t border-gray-100 px-3 py-2">
        {loading ? <p className="text-xs text-gray-500">Loading…</p> : null}
        {!loading && groups.length === 0 ? <p className="text-xs text-gray-500">No rows for this company.</p> : null}
        <ul className="space-y-1 text-xs">
          {groups.map((g) => (
            <li key={g.key} className="flex justify-between gap-2 text-gray-800">
              <span className="font-medium">{g.key}</span>
              <span className="tabular-nums text-gray-600">
                {g.count} · {money.format(g.totalCents / 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function AccountingHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [billsQ, invoicesQ, paymentsQ, vendorsQ, customersQ] = useQueries({
    queries: [
      {
        queryKey: ["accounting-hub", "bills", companyId],
        queryFn: () => listBills(companyId, { limit: 500, include_balance: true }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub", "invoices", companyId],
        queryFn: () => listInvoices(companyId, { }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub", "payments", companyId],
        queryFn: () => listPayments(companyId, {}),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub", "vendors", companyId],
        queryFn: () => listVendors({ operating_company_id: companyId, status: "active" }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub", "customers", companyId],
        queryFn: () => listCustomers({ operating_company_id: companyId, status: "active" }),
        enabled: Boolean(companyId),
      },
    ],
  });

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customersQ.data?.customers ?? []) map.set(c.id, c);
    return map;
  }, [customersQ.data?.customers]);

  const billGroups = useMemo(() => {
    const rows = billsQ.data?.rows ?? [];
    return foldGroups<VendorBill>(
      rows,
      (b) => String((b as VendorBill & { bill_type?: string }).bill_type ?? "Vendor bill"),
      (b) => Number(b.balance_cents ?? b.amount_cents - (b.paid_cents ?? 0))
    );
  }, [billsQ.data?.rows]);

  const vendorGroups = useMemo(() => {
    const rows = vendorsQ.data?.vendors ?? [];
    return foldGroups<VendorOption>(
      rows,
      (v) => String(v.vendor_category ?? v.vendor_type ?? "Uncategorized"),
      () => 0
    );
  }, [vendorsQ.data?.vendors]);

  const customerGroups = useMemo(() => {
    const rows = customersQ.data?.customers ?? [];
    return foldGroups<Customer>(rows, (c) => String(c.customer_type ?? "—"), () => 0);
  }, [customersQ.data?.customers]);

  const invoiceGroups = useMemo(() => {
    const rows = invoicesQ.data?.invoices ?? [];
    return foldGroups<Invoice>(rows, (inv) => {
      const cust = customerById.get(inv.customer_id);
      return String(cust?.customer_type ?? cust?.name ?? "Customer");
    }, (inv) => Number(inv.total_cents ?? 0));
  }, [invoicesQ.data?.invoices, customerById]);

  const paymentGroups = useMemo(() => {
    const rows = paymentsQ.data?.rows ?? [];
    return foldGroups<Payment>(rows, (p) => String(p.payment_method ?? "—"), (p) => Number(p.amount_cents ?? 0));
  }, [paymentsQ.data?.rows]);

  return (
    <div className="space-y-4">
      <PageHeader title="Accounting hub" subtitle="Collapsible rollups · uses current Wave 1 list routes" />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <div className="space-y-3">
        <HubSection title="Bills (by bill_type when present)" to="/accounting/bills" groups={billGroups} loading={billsQ.isLoading} />
        <HubSection title="Vendors (vendor_category or vendor_type)" to="/vendors" groups={vendorGroups} loading={vendorsQ.isLoading} />
        <HubSection title="Customers (customer_type)" to="/customers" groups={customerGroups} loading={customersQ.isLoading} />
        <HubSection title="Invoices (by customer category / name)" to="/accounting/invoices" groups={invoiceGroups} loading={invoicesQ.isLoading} />
        <HubSection title="Customer payments (payment_method)" to="/accounting/payments" groups={paymentGroups} loading={paymentsQ.isLoading} />
      </div>
    </div>
  );
}
