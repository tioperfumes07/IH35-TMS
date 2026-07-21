import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import {
  getMultiEntityAccountingSummary,
  type MultiEntityAccountBalance,
  type MultiEntityCompanySummary,
} from "../../api/accounting";
import { listMyCompanies } from "../../api/org";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function firstDayOfCurrentMonthIso() {
  return monthBoundsIso(companyToday()).start;
}

function todayIso() {
  return companyToday();
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

  // Display-only columns — amount rendering preserved 1:1 via the same money() helper.
  const byCompanyColumns = useMemo<Array<ParityColumn<MultiEntityCompanySummary>>>(
    () => [
      { key: "company_name", label: "Company", sortable: true },
      {
        key: "revenue_cents",
        label: "Revenue",
        sortable: true,
        sortValue: (row) => row.revenue_cents,
        render: (row) => money(row.revenue_cents),
      },
      {
        key: "expense_cents",
        label: "Expense",
        sortable: true,
        sortValue: (row) => row.expense_cents,
        render: (row) => money(row.expense_cents),
      },
      {
        key: "net_income_cents",
        label: "Net income",
        sortable: true,
        sortValue: (row) => row.net_income_cents,
        render: (row) => money(row.net_income_cents),
      },
    ],
    []
  );

  const accountColumns = useMemo<Array<ParityColumn<MultiEntityAccountBalance>>>(
    () => [
      {
        key: "account_name",
        label: "Account",
        sortable: true,
        sortValue: (row) => `${row.account_number ? `${row.account_number} - ` : ""}${row.account_name}`,
        render: (row) => (
          <>
            {row.account_number ? `${row.account_number} - ` : ""}
            {row.account_name}
          </>
        ),
      },
      { key: "account_type", label: "Type", sortable: true },
      {
        key: "debit_cents",
        label: "Debit",
        sortable: true,
        sortValue: (row) => row.debit_cents,
        render: (row) => money(row.debit_cents),
      },
      {
        key: "credit_cents",
        label: "Credit",
        sortable: true,
        sortValue: (row) => row.credit_cents,
        render: (row) => money(row.credit_cents),
      },
    ],
    []
  );

  return (
    <AccountingSubNavWrapper title="Multi-entity accounting" subtitle="Consolidated accounting summary across selected operating companies.">

      <div className="rounded-sm border border-gray-200 bg-white p-3">
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
            <DatePicker value={start} onChange={(next) => setStart(next)} className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" />
            <label className="block text-xs text-gray-500">End</label>
            <DatePicker value={end} onChange={(next) => setEnd(next)} className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" />
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

      {summaryQuery.isError ? (
        <ListErrorState
          title="Couldn't load consolidated summary"
          status={0}
          message={(summaryQuery.error as Error)?.message}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : null}

      {summaryQuery.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.revenue_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Expense</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.expense_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">Net income</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{money(summaryQuery.data.consolidated.net_income_cents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ParityTable
              columns={byCompanyColumns}
              rows={summaryQuery.data.by_company}
              rowKey={(row) => row.operating_company_id}
              storageKey="multi-entity-accounting-by-company"
              emptyText="No per-company rows for the selected scope."
              tableTestId="multi-entity-by-company-table"
            />

            <ParityTable
              columns={accountColumns}
              rows={summaryQuery.data.accounts}
              rowKey={(row) => row.account_id}
              storageKey="multi-entity-accounting-accounts"
              emptyText="No account balances for the selected scope."
              tableTestId="multi-entity-accounts-table"
            />
          </div>
        </>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
