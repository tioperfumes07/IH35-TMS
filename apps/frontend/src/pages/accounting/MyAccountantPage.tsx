import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import {
  getAccountingPeriods,
  buildStatementExportUrl,
  ACCOUNTANT_REPORT_LINKS,
  ACCOUNTANT_EXPORT_STATEMENTS,
  type AccountingPeriod,
} from "../../api/my-accountant";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-100 text-slate-700",
  locked: "bg-slate-100 text-slate-700",
};

function PeriodStatusPanel({ periods }: { periods: AccountingPeriod[] }) {
  if (periods.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">No accounting periods defined for this entity yet.</p>
        <p className="mt-1 text-xs text-gray-400">Period status will appear here once periods are created.</p>
      </div>
    );
  }
  const lastClosed = periods.find((p) => p.status === "closed");
  return (
    <>
      {lastClosed && (
        <p className="mb-3 text-xs text-gray-500">
          Last closed period: <span className="font-medium text-gray-700">{lastClosed.period_label ?? `${fmtDate(lastClosed.period_start)} – ${fmtDate(lastClosed.period_end)}`}</span>
          {lastClosed.closed_at ? ` (closed ${fmtDate(lastClosed.closed_at)})` : ""}
        </p>
      )}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Period", "Fiscal Year", "Start", "End", "Status", "Closed"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {periods.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{p.period_label ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{p.fiscal_year}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(p.period_start)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(p.period_end)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {titleize(p.status)}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(p.closed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      {children}
    </section>
  );
}

export function MyAccountantPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag("MY_ACCOUNTANT_ENABLED", operatingCompanyId || undefined);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["accounting-periods", operatingCompanyId],
    queryFn: () => getAccountingPeriods(operatingCompanyId),
    enabled: Boolean(selectedCompanyId) && enabled,
  });

  const periods = data?.periods ?? [];

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="My Accountant" subtitle="Read-only accountant workspace">
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          The accountant workspace is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the MY_ACCOUNTANT_ENABLED feature flag to use this module.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="My Accountant" subtitle="Read-only accountant workspace — books at a glance, reports, and CPA export (per-entity)">
      <SectionCard title="Books at a glance" subtitle="Period status for this entity (read-only — period close is managed in Month Close)">
        {isLoading || flagLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-600">Failed to load period status.</p>
        ) : (
          <PeriodStatusPanel periods={periods} />
        )}
      </SectionCard>

      <SectionCard title="Reports" subtitle="Open the standard financial reports for this entity">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACCOUNTANT_REPORT_LINKS.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="rounded border border-gray-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="text-sm font-medium text-slate-700">{r.label}</div>
              <div className="text-xs text-gray-500">{r.description}</div>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Export for CPA" subtitle="Download the standard period package — read-only file export (no changes are made)">
        {!operatingCompanyId ? (
          <p className="py-2 text-sm text-gray-500">Select an entity to enable exports.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <tbody className="divide-y divide-gray-100 bg-white">
                {ACCOUNTANT_EXPORT_STATEMENTS.map((s) => (
                  <tr key={s.key} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{s.label}</td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={buildStatementExportUrl(s.key, "pdf", operatingCompanyId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-3 text-slate-700 hover:underline"
                      >
                        PDF
                      </a>
                      <a
                        href={buildStatementExportUrl(s.key, "xlsx", operatingCompanyId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:underline"
                      >
                        XLSX
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Invite your accountant" subtitle="Give your CPA read access to the books">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            Inviting an accountant grants access and is managed under access control. This action is not available from this read-only workspace.
          </p>
          <button
            type="button"
            disabled
            title="Managed under access control — not available here"
            className="cursor-not-allowed rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400"
          >
            Invite accountant
          </button>
        </div>
      </SectionCard>
    </AccountingSubNavWrapper>
  );
}

export default MyAccountantPage;
