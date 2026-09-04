import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCancellationsReport, type CancellationBucket } from "../../api/reports";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

const BUCKET_SECTIONS = [
  { title: "By reason", prop: "by_reason" as const, storageKey: "cancellations-report-by-reason", entityKind: null, formatAsDate: false },
  { title: "By driver", prop: "by_driver" as const, storageKey: "cancellations-report-by-driver", entityKind: "driver" as const, formatAsDate: false },
  { title: "By customer", prop: "by_customer" as const, storageKey: "cancellations-report-by-customer", entityKind: "customer" as const, formatAsDate: false },
  { title: "By date", prop: "by_date" as const, storageKey: "cancellations-report-by-date", entityKind: null, formatAsDate: true },
];

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function entityNoun(kind: EntityKind): string {
  return kind === "customer" ? "Customer" : kind === "driver" ? "Driver" : "Record";
}

/** Display-only: By date bucket labels are ISO YYYY-MM-DD keys — never mutate row.key / sort / API. */
function cancellationsByDateLabel(row: CancellationBucket): string {
  const raw = (row.label || row.key || "").trim();
  return formatDateUS(raw) || raw;
}

function bucketColumns(
  groupLabel: string,
  entityKind: EntityKind | null,
  formatAsDate: boolean,
): ParityColumn<CancellationBucket>[] {
  return [
    {
      key: "label",
      label: groupLabel,
      sortable: true,
      sortValue: (row) => row.key,
      render: (row) => {
        if (formatAsDate) {
          return <span className="font-medium text-gray-800">{cancellationsByDateLabel(row)}</span>;
        }
        if (!entityKind || !UUID_KEY.test(row.key)) {
          return <span className="font-medium text-gray-800">{row.label}</span>;
        }
        const noun = entityNoun(entityKind);
        const label = entityLabel(row.label, row.key, noun);
        if (isUnresolvedEntityTombstone(row.label, row.key, noun)) {
          return (
            <span className="font-medium text-gray-800" data-testid="cancellations-report-tombstone">
              {label}
            </span>
          );
        }
        return <EntityLink kind={entityKind} id={row.key} label={label} className="font-medium text-gray-800" />;
      },
    },
    { key: "count", label: "Count", sortable: true, className: "text-right", cellClass: "text-right font-mono" },
    { key: "billable_count", label: "Billable", sortable: true, className: "text-right", cellClass: "text-right font-mono text-gray-600" },
    {
      key: "total_charge_cents",
      label: "Charges",
      sortable: true,
      className: "text-right",
      cellClass: "text-right font-mono",
      render: (row) => money(row.total_charge_cents),
    },
  ];
}

function CancellationBucketTable({
  title,
  rows,
  storageKey,
  entityKind,
  formatAsDate,
  loading,
}: {
  title: string;
  rows: CancellationBucket[];
  storageKey: string;
  entityKind: EntityKind | null;
  formatAsDate: boolean;
  loading?: boolean;
}) {
  const groupLabel = title.replace(/^By /, "");
  const columns = useMemo(
    () => bucketColumns(groupLabel, entityKind, formatAsDate),
    [entityKind, formatAsDate, groupLabel],
  );

  return (
    <div className="rounded-sm border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        {title}
      </div>
      <div className="p-2">
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.key}
          loading={loading}
          storageKey={storageKey}
          emptyText="No cancellations in range."
        />
      </div>
    </div>
  );
}

// GAP-10 — Load cancellations analytics. Read-only; groups cancellations by reason / driver / customer /
// date with billable-charge totals, scoped to the selected operating company (per-entity).
export function CancellationsReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // LV-REPORTS-CANCELLATIONS-FILTER-SILENT-APPLY / CLS-REPORTS-FILTER-APPLY-CANCEL-RESET —
  // From/To must stage until Apply; Cancel restores draft; Reset clears both draft + applied.
  const emptyFilters = { from: "", to: "" };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({
    applied,
    empty: emptyFilters,
    onApply: setApplied,
  });

  const query = useQuery({
    queryKey: ["reports", "cancellations", companyId, applied.from, applied.to],
    queryFn: () =>
      getCancellationsReport({
        operating_company_id: companyId,
        from: applied.from || undefined,
        to: applied.to || undefined,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const data = query.data;
  const total = data?.total ?? { count: 0, total_charge_cents: 0, billable_count: 0 };
  const tableLoading = query.isPending || (query.isFetching && !data);
  const activeFilterCount = (applied.from ? 1 : 0) + (applied.to ? 1 : 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Cancellations"
        subtitle="Reports"
        backHref="/reports"
        breadcrumb={["Reports", "Cancellations"]}
      />
      <ReportsSubNav />

      <CollapsedListFilters
        activeFilterCount={activeFilterCount}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-cancellations"
        className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
            From
            <DatePicker
              value={staged.draft.from}
              onChange={(next) => staged.setDraft((p) => ({ ...p, from: next }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
            To
            <DatePicker
              value={staged.draft.to}
              onChange={(next) => staged.setDraft((p) => ({ ...p, to: next }))}
            />
          </label>
        </div>
      </CollapsedListFilters>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load cancellations report"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Cancellations</div>
              <div className="text-page-title font-semibold">{total.count}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Billable to customer</div>
              <div className="text-page-title font-semibold">{total.billable_count}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Total charges</div>
              <div className="text-page-title font-semibold">{money(total.total_charge_cents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {BUCKET_SECTIONS.map(({ title, prop, storageKey, entityKind, formatAsDate }) => (
              <CancellationBucketTable
                key={prop}
                title={title}
                rows={data?.[prop] ?? []}
                storageKey={storageKey}
                entityKind={entityKind}
                formatAsDate={formatAsDate}
                loading={tableLoading}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
