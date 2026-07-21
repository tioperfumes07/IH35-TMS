import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateUS } from "../../lib/formatDate";
import { Link } from "react-router-dom";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { ApiError } from "../../api/client";
import {
  getAccountingPeriods,
  buildStatementExportUrl,
  ACCOUNTANT_REPORT_LINKS,
  ACCOUNTANT_EXPORT_STATEMENTS,
  type AccountingPeriod,
  type ExportStatement,
} from "../../api/my-accountant";

const fmtDate = (s: string | null) => formatDateUS(s) || "—";
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  open: "bg-slate-100 text-slate-700",
  closed: "bg-slate-100 text-slate-700",
  locked: "bg-slate-100 text-slate-700",
};

// Column order preserved 1:1 from the pre-migration hand-rolled table.
const PERIOD_COLUMNS: Array<ParityColumn<AccountingPeriod>> = [
  {
    key: "period_label",
    label: "Period",
    sortable: true,
    render: (p) => <span className="whitespace-nowrap font-medium text-gray-800">{p.period_label ?? "—"}</span>,
  },
  {
    key: "fiscal_year",
    label: "Fiscal Year",
    sortable: true,
    render: (p) => <span className="whitespace-nowrap text-gray-600">{p.fiscal_year}</span>,
  },
  {
    key: "period_start",
    label: "Start",
    sortable: true,
    render: (p) => <span className="whitespace-nowrap text-gray-600">{fmtDate(p.period_start)}</span>,
  },
  {
    key: "period_end",
    label: "End",
    sortable: true,
    render: (p) => <span className="whitespace-nowrap text-gray-600">{fmtDate(p.period_end)}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (p) => (
      <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
        {titleize(p.status)}
      </span>
    ),
  },
  {
    key: "closed_at",
    label: "Closed",
    sortable: true,
    render: (p) => <span className="whitespace-nowrap text-gray-500">{fmtDate(p.closed_at)}</span>,
  },
];

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
      <ParityTable
        columns={PERIOD_COLUMNS}
        rows={periods}
        rowKey={(p) => p.id}
        storageKey="my-accountant-periods"
        tableTestId="my-accountant-periods-table"
      />
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["accounting-periods", operatingCompanyId],
    queryFn: () => getAccountingPeriods(operatingCompanyId),
    enabled: Boolean(selectedCompanyId) && enabled,
  });

  const periods = data?.periods ?? [];

  // Export rows/columns preserved 1:1 from the pre-migration hand-rolled table:
  // statement label + right-aligned PDF / XLSX read-only download anchors (unchanged hrefs).
  const exportColumns = useMemo<Array<ParityColumn<ExportStatement>>>(
    () => [
      {
        key: "label",
        label: "Statement",
        sortable: true,
        render: (s) => <span className="font-medium text-gray-800">{s.label}</span>,
      },
      {
        key: "download",
        label: "Download",
        cellClass: "text-right",
        className: "text-right",
        render: (s) => (
          <>
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
          </>
        ),
      },
    ],
    [operatingCompanyId],
  );

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="My Accountant" subtitle="Read-only accountant workspace">
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
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
          <ListErrorState
            title="Failed to load period status"
            status={error instanceof ApiError ? error.status : 0}
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
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
              className="rounded-sm border border-gray-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50"
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
          <ParityTable
            columns={exportColumns}
            rows={[...ACCOUNTANT_EXPORT_STATEMENTS]}
            rowKey={(s) => s.key}
            storageKey="my-accountant-export"
            tableTestId="my-accountant-export-table"
          />
        )}
      </SectionCard>

      <SectionCard title="Invite your accountant" subtitle="Give your CPA read access to the books">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-700">
            Inviting an accountant grants access and is managed under access control. This action is not available from this read-only workspace.
          </p>
          <button
            type="button"
            disabled
            title="Managed under access control — not available here"
            className="cursor-not-allowed rounded-sm border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400"
          >
            Invite accountant
          </button>
        </div>
      </SectionCard>
    </AccountingSubNavWrapper>
  );
}

export default MyAccountantPage;
