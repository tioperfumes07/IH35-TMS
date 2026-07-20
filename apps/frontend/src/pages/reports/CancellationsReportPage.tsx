import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCancellationsReport, type CancellationBucket } from "../../api/reports";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

const BUCKET_SECTIONS = [
  { title: "By reason", prop: "by_reason" as const, storageKey: "cancellations-report-by-reason" },
  { title: "By driver", prop: "by_driver" as const, storageKey: "cancellations-report-by-driver" },
  { title: "By customer", prop: "by_customer" as const, storageKey: "cancellations-report-by-customer" },
  { title: "By date", prop: "by_date" as const, storageKey: "cancellations-report-by-date" },
];

function bucketColumns(groupLabel: string): ParityColumn<CancellationBucket>[] {
  return [
    {
      key: "label",
      label: groupLabel,
      sortable: true,
      render: (row) => <span className="font-medium text-gray-800">{row.label}</span>,
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
  loading,
}: {
  title: string;
  rows: CancellationBucket[];
  storageKey: string;
  loading?: boolean;
}) {
  const groupLabel = title.replace(/^By /, "");
  const columns = useMemo(() => bucketColumns(groupLabel), [groupLabel]);

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const query = useQuery({
    queryKey: ["reports", "cancellations", companyId, applied.from, applied.to],
    queryFn: () => getCancellationsReport({ operating_company_id: companyId, from: applied.from, to: applied.to }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const data = query.data;
  const total = data?.total ?? { count: 0, total_charge_cents: 0, billable_count: 0 };
  const tableLoading = query.isPending || (query.isFetching && !data);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Cancellations"
        subtitle="Reports"
        backHref="/reports"
        breadcrumb={["Reports", "Cancellations"]}
      />
      <ReportsSubNav />

      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
        <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
          From
          <DatePicker value={from} onChange={setFrom} />
        </label>
        <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
          To
          <DatePicker value={to} onChange={setTo} />
        </label>
        <Button type="button" onClick={() => setApplied({ from: from || undefined, to: to || undefined })}>
          Apply
        </Button>
        {(applied.from || applied.to) && (
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setFrom("");
              setTo("");
              setApplied({});
            }}
          >
            Clear
          </button>
        )}
      </div>

      {query.isError ? (
        <div className="rounded-sm border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Couldn't load the cancellations report.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Cancellations</div>
              <div className="text-lg font-semibold">{total.count}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Billable to customer</div>
              <div className="text-lg font-semibold">{total.billable_count}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total charges</div>
              <div className="text-lg font-semibold">{money(total.total_charge_cents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {BUCKET_SECTIONS.map(({ title, prop, storageKey }) => (
              <CancellationBucketTable
                key={prop}
                title={title}
                rows={data?.[prop] ?? []}
                storageKey={storageKey}
                loading={tableLoading}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
