import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaAggregateMiles } from "../../../api/ifta";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

type StateMilesRow = {
  state: string;
  miles: number;
  source: string;
};

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function IFTAStepMiles({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaAggregateMiles(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not aggregate IFTA miles"), "error"),
  });

  const rows = useMemo<StateMilesRow[]>(
    () =>
      (prepQuery.data?.state_miles ?? []).map((row) => ({
        state: row.state,
        miles: Number(row.override_miles ?? row.miles ?? 0),
        source: row.source,
      })),
    [prepQuery.data?.state_miles],
  );

  const columns = useMemo<Array<ParityColumn<StateMilesRow>>>(
    () => [
      {
        key: "state",
        label: "State",
        sortable: true,
        alwaysVisible: true,
        cellClass: "font-medium",
        render: (row) => row.state,
      },
      {
        key: "miles",
        label: "Miles",
        sortable: true,
        sortValue: (row) => row.miles,
        render: (row) => fmtNum(row.miles),
      },
      {
        key: "source",
        label: "Source",
        sortable: true,
        cellClass: "text-slate-600",
        render: (row) => row.source,
      },
    ],
    [],
  );

  const total = rows.reduce((sum, row) => sum + row.miles, 0);

  return (
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">Step 1 · State miles (Q{quarter} {year})</h3>
        <p className="text-xs text-slate-800">Pulled from Samsara vehicle state miles with load-stop fallback.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded-sm border border-slate-400 bg-slate-100 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Aggregating…" : "Run Step 1 — aggregate miles"}
        </button>
        {prepQuery.data?.miles_aggregated_at ? (
          <p className="text-slate-600">Last aggregated: {new Date(prepQuery.data.miles_aggregated_at).toLocaleString()}</p>
        ) : null}
        {prepQuery.isError ? (
          <ListErrorState
            title="Couldn't load state miles"
            status={0}
            message={(prepQuery.error as Error)?.message}
            onRetry={() => void prepQuery.refetch()}
          />
        ) : (
          <ParityTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.state}
            storageKey="ifta-step-miles"
            emptyText="No miles aggregated yet — run Step 1."
            density="compact"
            tableTestId="ifta-step-miles-table"
            initialPageSize={100}
            pageSizeOptions={[15, 50, 100, 300]}
          />
        )}
        {rows.length > 0 ? (
          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-900">
            Total: {fmtNum(total)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
