/**
 * GAP-67 — AccountingHome
 *
 * Read-only accounting role home. Pulls aggregated metrics from
 * GET /api/v1/accounting/role-home (no financial writes).
 */

import type { AuthMeResponse } from "../../../types/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccountingRoleHome, type AccountingAgingBuckets } from "../../../api/accountingHome";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { AccountingKpiBar } from "../../../components/home/AccountingKpiBar";
import { AccountingPendingApprovalsPanel } from "../../../components/home/AccountingPendingApprovalsPanel";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { formatUsdFromCents } from "../HomeKpiCard";
import "../home-print.css";

type Props = {
  auth: AuthMeResponse["user"];
};

function AgingBucketCard({ title, buckets, accent }: { title: string; buckets: AccountingAgingBuckets | undefined; accent: string }) {
  const rows = [
    { label: "Current", cents: buckets?.current_cents ?? 0 },
    { label: "1–30 days", cents: buckets?.d1_30_cents ?? 0 },
    { label: "31–60 days", cents: buckets?.d31_60_cents ?? 0 },
    { label: "61–90 days", cents: buckets?.d61_90_cents ?? 0 },
    { label: "90+ days", cents: buckets?.d90_plus_cents ?? 0 },
  ];

  return (
    <section className="rounded border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold" style={{ color: accent }}>
        {title}
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between px-3 py-2">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-medium tabular-nums text-slate-900">{formatUsdFromCents(row.cents)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between bg-slate-50 px-3 py-2 font-semibold">
          <span>Total outstanding</span>
          <span className="tabular-nums">{formatUsdFromCents(buckets?.total_outstanding_cents ?? 0)}</span>
        </li>
      </ul>
    </section>
  );
}

export function AccountingHome({ auth }: Props) {
  const displayName = auth.email ?? "Accountant";
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const homeQuery = useQuery({
    queryKey: ["accounting", "role-home", companyId],
    queryFn: () => fetchAccountingRoleHome(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 120_000,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["accounting", "role-home", companyId] });
    void homeQuery.refetch();
  }

  return (
    <div className="home-page flex flex-col gap-4">
      <PageHeader
        title="Accounting Home"
        subtitle={`AR/AP snapshot and period-close status (${displayName})`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => window.print()}>
              Print this page
            </button>
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          </div>
        }
      />

      {!companyId ? (
        <section className="rounded border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          Select an operating company to load accounting home metrics.
        </section>
      ) : homeQuery.isError ? (
        <section className="rounded border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
          Failed to load accounting home data. Try refreshing.
        </section>
      ) : null}

      <AccountingKpiBar data={homeQuery.data} isLoading={homeQuery.isLoading} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AgingBucketCard title="Accounts Receivable Aging" buckets={homeQuery.data?.ar_aging} accent="#1d4ed8" />
        <AgingBucketCard title="Accounts Payable Aging" buckets={homeQuery.data?.ap_aging} accent="#b45309" />
      </section>

      <AccountingPendingApprovalsPanel data={homeQuery.data} isLoading={homeQuery.isLoading} />

      <footer className="text-xs text-gray-500">
        Read-only view · data as of {homeQuery.data?.as_of_date ?? "—"} · Backend:{" "}
        {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "not available"}
      </footer>
    </div>
  );
}
