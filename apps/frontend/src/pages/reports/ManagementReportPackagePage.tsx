import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getProfitLossReport, getBalanceSheetReport, getArAgingReport, getApAgingReport, getCustomerProfitability } from "../../api/reports";
import { ReportsSubNav } from "./ReportsSubNav";

type PackageType = "company-overview" | "sales-performance" | "expenses-performance";

const PACKAGES: Record<PackageType, { label: string; description: string; sections: string[] }> = {
  "company-overview": {
    label: "Company Overview",
    description: "Profit & Loss + Balance Sheet — lender/stakeholder-ready financial summary",
    sections: ["Profit & Loss", "Balance Sheet"],
  },
  "sales-performance": {
    label: "Sales Performance",
    description: "Profit & Loss + A/R Aging Detail + Sales by Customer Summary",
    sections: ["Profit & Loss", "A/R Aging Detail", "Sales by Customer Summary"],
  },
  "expenses-performance": {
    label: "Expenses Performance",
    description: "Profit & Loss + A/P Aging Detail + Expenses by Vendor Summary",
    sections: ["Profit & Loss", "A/P Aging Detail", "Expenses by Vendor Summary"],
  },
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function SectionDivider({ title, index }: { title: string; index: number }) {
  return (
    <div className="mt-8 border-b-2 border-slate-800 pb-1 print:mt-6">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{index + 1}</span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
    </div>
  );
}

function PLSection({ companyId, fromDate, toDate, basis }: { companyId: string; fromDate: string; toDate: string; basis: AccountingBasis }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-pl", companyId, fromDate, toDate, basis],
    queryFn: () => getProfitLossReport({ operating_company_id: companyId, from_date: fromDate, to_date: toDate, basis }),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading Profit & Loss…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">Profit & Loss unavailable (no data posted for this period)</p>;

  const { revenue, cogs, operating_expenses, gross_profit, net_income } = query.data;

  const renderSection = (title: string, lines: typeof revenue.lines, total: number) => (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      {lines.length === 0 ? (
        <p className="text-xs text-slate-400 pl-2">— no entries —</p>
      ) : (
        <table className="min-w-full text-xs">
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.account_code}-${line.account_name}`} className="border-b border-gray-50">
                <td className="py-0.5 pl-2 text-slate-600">{line.account_code}</td>
                <td className="py-0.5 pl-1 text-slate-800">{line.account_name}</td>
                <td className="py-0.5 text-right text-slate-800">{money(line.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold border-t border-slate-200">
              <td colSpan={2} className="py-0.5 pl-2 text-right text-slate-700">Total {title}</td>
              <td className="py-0.5 text-right">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="mt-3 text-xs">
      {renderSection("Revenue", revenue.lines, revenue.total)}
      {renderSection("Cost of Goods Sold", cogs.lines, cogs.total)}
      <div className="border-t border-slate-300 py-1 flex justify-between font-semibold text-sm">
        <span>Gross Profit</span>
        <span className={gross_profit < 0 ? "text-rose-700" : "text-slate-900"}>{money(gross_profit)}</span>
      </div>
      {renderSection("Operating Expenses", operating_expenses.lines, operating_expenses.total)}
      <div className="border-t-2 border-slate-800 py-1 flex justify-between font-bold text-sm">
        <span>Net Income</span>
        <span className={net_income < 0 ? "text-rose-700" : "text-emerald-700"}>{money(net_income)}</span>
      </div>
    </div>
  );
}

function BSSection({ companyId, asOfDate, basis }: { companyId: string; asOfDate: string; basis: AccountingBasis }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-bs", companyId, asOfDate, basis],
    queryFn: () => getBalanceSheetReport({ operating_company_id: companyId, as_of_date: asOfDate, basis }),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading Balance Sheet…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">Balance Sheet unavailable</p>;

  const { assets, liabilities, equity, total_liabilities_and_equity } = query.data;

  const renderLines = (lines: typeof assets.lines, total: number, label: string) => (
    <div className="mb-3">
      {lines.map((line) => (
        <div key={`${line.account_code}-${line.account_name}`} className="flex justify-between text-xs py-0.5 border-b border-gray-50">
          <span className="text-slate-600 pl-2">{line.account_code} {line.account_name}</span>
          <span className="text-slate-800">{money(line.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between text-xs font-semibold border-t border-slate-200 py-0.5">
        <span className="pl-2 text-slate-700">{label}</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Assets</div>
      {renderLines(assets.lines, assets.total, "Total Assets")}
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-3">Liabilities</div>
      {renderLines(liabilities.lines, liabilities.total, "Total Liabilities")}
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-3">Equity</div>
      {renderLines(equity.lines, equity.total, "Total Equity")}
      <div className="flex justify-between font-bold text-sm border-t-2 border-slate-800 pt-1 mt-2">
        <span>Total Liabilities & Equity</span>
        <span>{money(total_liabilities_and_equity)}</span>
      </div>
    </div>
  );
}

function ARAgingSection({ companyId, asOfDate }: { companyId: string; asOfDate: string }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-ar", companyId, asOfDate],
    queryFn: () => getArAgingReport(companyId, asOfDate),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading A/R Aging…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">A/R Aging unavailable</p>;

  const rows = query.data.rows;
  if (rows.length === 0) return <p className="py-4 text-sm text-slate-400">No open A/R as of {asOfDate}</p>;

  return (
    <div className="mt-3 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-1 text-left">Customer</th>
            <th className="py-1 text-right">Current</th>
            <th className="py-1 text-right">1–30</th>
            <th className="py-1 text-right">31–60</th>
            <th className="py-1 text-right">61–90</th>
            <th className="py-1 text-right">91+</th>
            <th className="py-1 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.customer_id} className="border-b border-gray-50">
              <td className="py-0.5 text-slate-800">{row.customer_name}</td>
              <td className="py-0.5 text-right">{money(row.current_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_1_30_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_31_60_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_61_90_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_91_plus_cents)}</td>
              <td className="py-0.5 text-right font-semibold">{money(row.total_open_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function APAgingSection({ companyId, asOfDate }: { companyId: string; asOfDate: string }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-ap", companyId, asOfDate],
    queryFn: () => getApAgingReport(companyId, asOfDate),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading A/P Aging…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">A/P Aging unavailable</p>;

  const rows = query.data.rows;
  if (rows.length === 0) return <p className="py-4 text-sm text-slate-400">No open A/P as of {asOfDate}</p>;

  return (
    <div className="mt-3 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-1 text-left">Vendor</th>
            <th className="py-1 text-right">Current</th>
            <th className="py-1 text-right">1–30</th>
            <th className="py-1 text-right">31–60</th>
            <th className="py-1 text-right">61–90</th>
            <th className="py-1 text-right">91+</th>
            <th className="py-1 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.vendor_id} className="border-b border-gray-50">
              <td className="py-0.5 text-slate-800">{row.vendor_name}</td>
              <td className="py-0.5 text-right">{money(row.current_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_1_30_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_31_60_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_61_90_cents)}</td>
              <td className="py-0.5 text-right">{money(row.bucket_91_plus_cents)}</td>
              <td className="py-0.5 text-right font-semibold">{money(row.total_open_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerSummarySection({ companyId, fromDate, toDate }: { companyId: string; fromDate: string; toDate: string }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-cust", companyId, fromDate, toDate],
    queryFn: () => getCustomerProfitability({ operating_company_id: companyId, period_start: fromDate, period_end: toDate }),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading customer summary…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">Customer summary unavailable</p>;

  const rows = query.data.by_customer ?? [];
  if (rows.length === 0) return <p className="py-4 text-sm text-slate-400">No customer revenue data for this period</p>;

  const sorted = [...rows].sort((a, b) => b.revenue_cents - a.revenue_cents);
  return (
    <div className="mt-3 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-1 text-left">Customer</th>
            <th className="py-1 text-right">Revenue</th>
            <th className="py-1 text-right">Load count</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((row) => (
            <tr key={row.customer_id} className="border-b border-gray-50">
              <td className="py-0.5 text-slate-800">{row.customer_name}</td>
              <td className="py-0.5 text-right">{money(row.revenue_cents)}</td>
              <td className="py-0.5 text-right">{row.load_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VendorExpenseSummarySection({ companyId, fromDate, toDate }: { companyId: string; fromDate: string; toDate: string }) {
  const query = useQuery({
    queryKey: ["mgmt-pkg-ap-summary", companyId, fromDate, toDate],
    queryFn: () => getApAgingReport(companyId, toDate),
    enabled: Boolean(companyId),
  });

  if (query.isLoading) return <p className="py-4 text-sm text-gray-500">Loading vendor summary…</p>;
  if (query.isError || !query.data) return <p className="py-4 text-sm text-red-600">Vendor summary unavailable</p>;

  const rows = query.data.rows;
  if (rows.length === 0) return <p className="py-4 text-sm text-slate-400">No open vendor balances</p>;

  const sorted = [...rows].sort((a, b) => b.total_open_cents - a.total_open_cents);
  return (
    <div className="mt-3 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-1 text-left">Vendor</th>
            <th className="py-1 text-right">Open balance</th>
            <th className="py-1 text-right">Bill count</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((row) => (
            <tr key={row.vendor_id} className="border-b border-gray-50">
              <td className="py-0.5 text-slate-800">{row.vendor_name}</td>
              <td className="py-0.5 text-right">{money(row.total_open_cents)}</td>
              <td className="py-0.5 text-right">{row.open_bill_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManagementReportPackagePage() {
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const entityName = selectedCompany?.legal_name ?? "Entity";

  const [searchParams] = useSearchParams();
  const rawType = searchParams.get("type") ?? "company-overview";
  const pkgType: PackageType = rawType in PACKAGES ? (rawType as PackageType) : "company-overview";
  const pkg = PACKAGES[pkgType];

  const [period, setPeriod] = useState(currentMonthRange);
  const [applied, setApplied] = useState(currentMonthRange);
  const [basis, setBasis] = useState<AccountingBasis>("accrual");

  const preparedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-page-break { page-break-before: always; }
        }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title={pkg.label}
        subtitle={pkg.description}
        backHref="/reports"
        breadcrumb={["Reports", "Management reports", pkg.label]}
        actions={
          <div className="no-print flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print / Save PDF
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <BasisSelector value={basis} onChange={setBasis} />
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.end}
            onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
          />
        </label>
        <Button size="sm" onClick={() => setApplied({ ...period })}>Apply</Button>
      </div>

      {companyId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-6 print:border-0 print:p-0">
          {/* Cover page */}
          <div className="mb-8 border-b-2 border-slate-800 pb-6 print:pb-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Management Report Package</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{pkg.label}</h1>
            <div className="text-slate-600 text-sm mb-4">{pkg.description}</div>
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 mt-6">
              <div><span className="font-semibold text-slate-700">Entity</span><br />{entityName}</div>
              <div><span className="font-semibold text-slate-700">Period</span><br />{applied.start} through {applied.end}</div>
              <div><span className="font-semibold text-slate-700">Basis</span><br />{basis === "cash" ? "Cash" : "Accrual"}</div>
              <div><span className="font-semibold text-slate-700">Prepared</span><br />{preparedDate}</div>
            </div>
            <p className="mt-4 text-[10px] text-slate-400 italic">
              Pre-import: amounts reflect TMS-posted entries only. Verified against QBO import post data-cutover.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Table of Contents</div>
            <ol className="space-y-1 text-sm text-slate-700">
              {pkg.sections.map((section, i) => (
                <li key={section} className="flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 min-w-[1rem]">{i + 1}</span>
                  <span>{section}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Report sections */}
          {pkgType === "company-overview" && (
            <>
              <SectionDivider title="Profit & Loss" index={0} />
              <PLSection companyId={companyId} fromDate={applied.start} toDate={applied.end} basis={basis} />
              <div className="print-page-break" />
              <SectionDivider title="Balance Sheet" index={1} />
              <BSSection companyId={companyId} asOfDate={applied.end} basis={basis} />
            </>
          )}

          {pkgType === "sales-performance" && (
            <>
              <SectionDivider title="Profit & Loss" index={0} />
              <PLSection companyId={companyId} fromDate={applied.start} toDate={applied.end} basis={basis} />
              <div className="print-page-break" />
              <SectionDivider title="A/R Aging Detail" index={1} />
              <ARAgingSection companyId={companyId} asOfDate={applied.end} />
              <div className="print-page-break" />
              <SectionDivider title="Sales by Customer Summary" index={2} />
              <CustomerSummarySection companyId={companyId} fromDate={applied.start} toDate={applied.end} />
            </>
          )}

          {pkgType === "expenses-performance" && (
            <>
              <SectionDivider title="Profit & Loss" index={0} />
              <PLSection companyId={companyId} fromDate={applied.start} toDate={applied.end} basis={basis} />
              <div className="print-page-break" />
              <SectionDivider title="A/P Aging Detail" index={1} />
              <APAgingSection companyId={companyId} asOfDate={applied.end} />
              <div className="print-page-break" />
              <SectionDivider title="Expenses by Vendor Summary" index={2} />
              <VendorExpenseSummarySection companyId={companyId} fromDate={applied.start} toDate={applied.end} />
            </>
          )}
        </div>
      ) : null}

      <div className="no-print flex gap-3 text-xs text-slate-500 pt-2">
        {Object.entries(PACKAGES).map(([type, meta]) => (
          <Link
            key={type}
            to={`/reports/management?type=${type}`}
            className={`underline-offset-2 hover:underline ${type === pkgType ? "font-semibold text-slate-800" : ""}`}
          >
            {meta.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
