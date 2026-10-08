/**
 * E-41 — Engine status board (Round 306).
 * Every registry engine: last run · rows/24h · last error · next run.
 * Red when a producer wrote nothing in its window.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getEngineStatusBoard, type EngineStatusRow } from "../../api/engine-status";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatDateTimeUS } from "../../lib/formatDate";
import { Button } from "../../components/Button";

function healthLabel(row: EngineStatusRow) {
  switch (row.health) {
    case "ok":
      return "OK";
    case "red":
      return "RED";
    case "idle":
      return "Idle";
    case "pending":
      return "Pending";
    case "screen":
      return "Screen";
    default:
      return "N/A";
  }
}

export function EngineStatusBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const q = useQuery({
    queryKey: ["system", "engine-status", companyId],
    queryFn: () => getEngineStatusBoard(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => (q.isError ? [] : q.data?.engines ?? []), [q.data?.engines, q.isError]);
  const redCount = rows.filter((r) => r.health === "red").length;

  const columns = useMemo<ParityColumn<EngineStatusRow>[]>(
    () => [
      { key: "id", label: "Engine", sortable: true, render: (row) => row.id },
      { key: "name", label: "Name", sortable: true, render: (row) => row.name },
      { key: "domain", label: "Domain", sortable: true, render: (row) => row.domain },
      { key: "owner_seat", label: "Seat", sortable: true, render: (row) => row.owner_seat },
      {
        key: "health",
        label: "Health",
        sortable: true,
        render: (row) => (
          <span
            className={row.health === "red" ? "font-semibold text-[#0F1219]" : "text-[#1F2A44]"}
            data-testid={`engine-health-${row.id}`}
            data-health={row.health}
            title={row.health_reason}
          >
            {healthLabel(row)}
          </span>
        ),
      },
      {
        key: "last_run_at",
        label: "Last run",
        sortable: true,
        render: (row) => (row.last_run_at ? `${formatDateTimeUS(row.last_run_at)} CT` : "—"),
      },
      {
        key: "rows_written_24h",
        label: "Rows 24 h",
        sortable: true,
        render: (row) => (row.rows_written_24h == null ? "—" : String(row.rows_written_24h)),
      },
      {
        key: "last_error",
        label: "Last error",
        render: (row) => row.last_error?.trim() || row.health_reason || "—",
      },
      {
        key: "next_run_hint",
        label: "Next / schedule",
        render: (row) => row.next_run_hint ?? row.schedule,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4" data-testid="engine-status-board-page">
      <PageHeader
        title="Engine status"
        subtitle="Every registry engine — last run, rows written in 24 hours, last error, next run. Red = should produce and wrote nothing in its window."
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link to="/system" className="text-[#1F2A44] underline">
          System home
        </Link>
        <span className="text-gray-400">·</span>
        <span data-testid="engine-status-red-count" className="text-[#1F2A44]">
          {redCount} red · {rows.length} engines
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void q.refetch()} disabled={q.isFetching}>
          Refresh
        </Button>
      </div>

      {q.isError ? (
        <ListErrorState
          title="Couldn't load engine status"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : null}

      {!q.isError ? (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={q.isLoading}
          storageKey="system-engine-status-board"
          emptyText="No engines in catalog."
          exportFilename="engine-status"
          rowClassName={(row) => (row.health === "red" ? "bg-[#F7F8FA]" : "")}
          rowTestId={(row) => `engine-row-${row.id}`}
        />
      ) : null}
    </div>
  );
}
