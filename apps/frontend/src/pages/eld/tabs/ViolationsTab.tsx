import { entityLabel } from "../../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEldHosViolations, type EldHosViolation } from "../../../api/eld";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { Button } from "../../../components/Button";

type Props = { operatingCompanyId: string };

export function ViolationsTab({ operatingCompanyId }: Props) {
  const pageSize = 25;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [operatingCompanyId]);
  const query = useQuery({
    queryKey: ["eld", "hos-violations", operatingCompanyId, page],
    queryFn: () => fetchEldHosViolations(operatingCompanyId, { limit: pageSize, offset: (page - 1) * pageSize }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(
    () => (query.data?.hos_violations ?? []).filter((row) => !row.voided_at),
    [query.data?.hos_violations],
  );
  const total = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<Array<ParityColumn<EldHosViolation>>>(
    () => [
      {
        key: "driver_id",
        label: "Driver",
        sortable: true,
        render: (row) => {
          const id = String(row.driver_id ?? "");
          if (!id) return "—";
          return (
            <Link to={`/drivers/${id}/hos`} className="font-medium text-slate-700 hover:underline">
              {String(row.driver_display_id ?? entityLabel(row.driver_name, id, "Driver"))}
            </Link>
          );
        },
      },
      {
        key: "violation_code",
        label: "Code",
        sortable: true,
        render: (row) => String(row.violation_code ?? row.violation_type ?? "—"),
      },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => String(row.severity ?? "—"),
      },
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => String(row.occurred_at ?? "").slice(0, 16).replace("T", " ") || "—",
      },
      {
        key: "source",
        label: "Source",
        sortable: true,
        render: (row) => String(row.source ?? "—"),
      },
      {
        key: "duty_status",
        label: "Duty",
        render: (row) => String(row.duty_status ?? "—"),
      },
    ],
    [],
  );

  if (!operatingCompanyId) {
    return <p className="text-sm text-slate-600">Select an operating company to load HOS violations.</p>;
  }

  return (
    <div className="space-y-3" data-testid="eld-violations-tab">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">HOS Violations</div>
          <div className="text-[11px] text-slate-500">
            Read-only from <code className="text-[10px]">GET /api/v1/safety/hos-violations</code>. Create / void on
            Safety.
          </div>
        </div>
        <Link
          to="/safety/hos-violations"
          className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white"
        >
          Open Safety violations
        </Link>
      </div>

      {query.isError ? (
        <ListErrorBanner
          message="Failed to load HOS violations."
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <ParityTable<EldHosViolation>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id ?? `${row.driver_id}-${row.occurred_at}`)}
        loading={query.isLoading}
        emptyText="No open HOS violations on file for this company."
        storageKey="eld-hos-violations"
        exportFilename="eld-hos-violations"
        tableTestId="eld-violations-table"
        hidePager
      />
      {!query.isError && total > pageSize ? <div className="flex items-center justify-end gap-2 text-xs" data-testid="eld-hos-violations-server-pager">
        <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous violations</Button>
        <span className="text-slate-600">Page {page} of {pageCount} · {total} violations</span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next violations</Button>
      </div> : null}
    </div>
  );
}
