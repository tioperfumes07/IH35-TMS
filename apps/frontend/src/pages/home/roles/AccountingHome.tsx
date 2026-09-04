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
import { ComplianceFilingsDueWidget } from "../../../components/home/ComplianceFilingsDueWidget";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { formatUsdFromCents } from "../HomeKpiCard";
import { printLetterHtml } from "../../../lib/openPrintableDocument";
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
    <section className="rounded-sm border border-slate-200 bg-white shadow-xs">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold" style={{ color: accent }}>
        {title}
      </div>
      <ul className="divide-y divide-slate-100 text-xs">
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

  function printLetter() {
    const data = homeQuery.data;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const bucketRows = (title: string, buckets: AccountingAgingBuckets | undefined) => {
      const rows = [
        { label: "Current", cents: buckets?.current_cents ?? 0 },
        { label: "1–30 days", cents: buckets?.d1_30_cents ?? 0 },
        { label: "31–60 days", cents: buckets?.d31_60_cents ?? 0 },
        { label: "61–90 days", cents: buckets?.d61_90_cents ?? 0 },
        { label: "90+ days", cents: buckets?.d90_plus_cents ?? 0 },
        { label: "Total outstanding", cents: buckets?.total_outstanding_cents ?? 0 },
      ];
      return `
        <h1 style="margin-top:16px">${esc(title)}</h1>
        <table>
          <tbody>
            ${rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(formatUsdFromCents(r.cents))}</td></tr>`).join("")}
          </tbody>
        </table>`;
    };
    const days = data?.period_close.days_to_close;
    const countdown = days == null ? "—" : days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} to close`;
    printLetterHtml({
      title: `Accounting Home — ${displayName}`,
      bodyHtml: `
        <h1>Accounting Home</h1>
        <div class="meta">${esc(`AR/AP snapshot (${displayName})`)} · as of ${esc(data?.as_of_date ?? "—")} · printed ${esc(
          new Date().toLocaleString(),
        )}</div>
        <table>
          <tbody>
            <tr><th>Outstanding A/R</th><td>${esc(
              data ? formatUsdFromCents(data.ar_aging.total_outstanding_cents) : "—",
            )}</td></tr>
            <tr><th>Outstanding A/P</th><td>${esc(
              data ? formatUsdFromCents(data.ap_aging.total_outstanding_cents) : "—",
            )}</td></tr>
            <tr><th>Period close</th><td>${esc(countdown)} · ${esc(data?.period_close.period_label ?? "No open period")}</td></tr>
          </tbody>
        </table>
        ${bucketRows("Accounts Receivable Aging", data?.ar_aging)}
        ${bucketRows("Accounts Payable Aging", data?.ap_aging)}
      `,
    });
  }

  return (
    <div className="home-page flex flex-col gap-4">
      <PageHeader
        title="Accounting Home"
        subtitle={`AR/AP snapshot and period-close status (${displayName})`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="text-xs font-medium text-slate-700 hover:underline" onClick={printLetter}>
              Print this page
            </button>
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          </div>
        }
      />

      {!companyId ? (
        <section className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-3 text-xs text-slate-700">
          Select an operating company to load accounting home metrics.
        </section>
      ) : homeQuery.isError ? (
        <section className="rounded-sm border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-900">
          Failed to load accounting home data. Try refreshing.
        </section>
      ) : null}

      <AccountingKpiBar data={homeQuery.data} isLoading={homeQuery.isLoading} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AgingBucketCard title="Accounts Receivable Aging" buckets={homeQuery.data?.ar_aging} accent="#1F2A44" />
        <AgingBucketCard title="Accounts Payable Aging" buckets={homeQuery.data?.ap_aging} accent="#334155" />
      </section>

      <AccountingPendingApprovalsPanel data={homeQuery.data} isLoading={homeQuery.isLoading} />

      <ComplianceFilingsDueWidget operatingCompanyId={selectedCompanyId ?? null} />

      <footer className="text-xs text-gray-500">
        Read-only view · data as of {homeQuery.data?.as_of_date ?? "—"} · Backend:{" "}
        {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "not available"}
      </footer>
    </div>
  );
}
