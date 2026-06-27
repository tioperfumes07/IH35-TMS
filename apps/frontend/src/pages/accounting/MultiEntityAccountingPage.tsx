import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getMultiEntityAccountingSummary } from "../../api/accounting";
import { listMyCompanies } from "../../api/org";
import { Button } from "../../components/Button";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function firstDayOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function MultiEntityAccountingPage() {
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [start, setStart] = useState(firstDayOfCurrentMonthIso());
  const [end, setEnd] = useState(todayIso());
  const [submitted, setSubmitted] = useState<null | { ids: string[]; start: string; end: string }>(null);

  const companiesQuery = useQuery({
    queryKey: ["org", "my-companies", "multi-entity"],
    queryFn: async () => listMyCompanies().then((res) => res.companies),
  });

  const summaryQuery = useQuery({
    queryKey: ["accounting", "multi-entity-summary", submitted],
    queryFn: () =>
      getMultiEntityAccountingSummary({
        operating_company_ids: submitted!.ids,
        start: submitted!.start,
        end: submitted!.end,
      }),
    enabled: Boolean(submitted && submitted.ids.length > 0),
  });

  const sortedCompanies = useMemo(
    () => [...(companiesQuery.data ?? [])].sort((a, b) => a.legal_name.localeCompare(b.legal_name)),
    [companiesQuery.data]
  );

  return (
    <AccountingSubNavWrapper title="Multi-entity accounting" subtitle="Consolidated accounting summary across selected operating companies.">

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Scope</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1">
            {sortedCompanies.map((company) => {
              const checked = selectedCompanyIds.includes(company.id);
              return (
                <label key={company.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selectedCompanyIds, company.id]
                        : selectedCompanyIds.filter((id) => id !== company.id);
                      setSelectedCompanyIds(Array.from(new Set(next)));
                    }}
                  />
                  <span>{company.short_name ?? company.legal_name}</span>
                </label>
              );
            })}
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Start</label>
            <DatePicker value={start} onChange={(next) => setStart(next)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
            <label className="block text-xs text-gray-500">End</label>
            <DatePicker value={end} onChange={(next) => setEnd(next)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex items-end">
            <Button
              disabled={selectedCompanyIds.length === 0 || !start || !end}
              loading={summaryQuery.isFetching}
              onClick={() => setSubmitted({ ids: selectedCompanyIds, start, end })}
            >
              Run consolidated summary
            </Button>
          </div>
        </div>
      </div>

      {summaryQuery.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.revenue_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Expense</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.expense_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Net income</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.net_income_cents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Company</th>
                    <th className="px-3 py-2 font-semibold">Revenue</th>
                    <th className="px-3 py-2 font-semibold">Expense</th>
                    <th className="px-3 py-2 font-semibold">Net income</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryQuery.data.by_company.map((row) => (
                    <tr key={row.operating_company_id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{row.company_name}</td>
                      <td className="px-3 py-2">{money(row.revenue_cents)}</td>
                      <td className="px-3 py-2">{money(row.expense_cents)}</td>
                      <td className="px-3 py-2">{money(row.net_income_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Account</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Debit</th>
                    <th className="px-3 py-2 font-semibold">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryQuery.data.accounts.map((row) => (
                    <tr key={row.account_id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{row.account_number ? `${row.account_number} - ` : ""}{row.account_name}</td>
                      <td className="px-3 py-2">{row.account_type}</td>
                      <td className="px-3 py-2">{money(row.debit_cents)}</td>
                      <td className="px-3 py-2">{money(row.credit_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
