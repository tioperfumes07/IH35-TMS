import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaAggregateGallons, type IftaPreparation } from "../../../api/ifta";
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

type StateGallonsRow = NonNullable<IftaPreparation["state_gallons"]>[number];

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function IFTAStepGallons({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaAggregateGallons(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not aggregate IFTA gallons"), "error"),
  });

  const rows = prepQuery.data?.state_gallons ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.override_gallons ?? row.gallons ?? 0), 0);
  const columns = useMemo<ParityColumn<StateGallonsRow>[]>(
    () => [
      { key: "state", label: "State", sortable: true, render: (row) => <span className="font-medium">{row.state}</span> },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.override_gallons ?? row.gallons ?? 0),
        render: (row) => fmtNum(Number(row.override_gallons ?? row.gallons ?? 0)),
      },
      { key: "source", label: "Source", sortable: true, cellClass: "text-slate-600" },
      {
        key: "breakdown",
        label: "Breakdown",
        sortValue: (row) =>
          Array.isArray(row.source_records)
            ? row.source_records.map((record) => record.source).join(", ")
            : "",
        cellClass: "text-slate-500",
        render: (row) =>
          Array.isArray(row.source_records)
            ? row.source_records.map((record) => `${record.source}: ${fmtNum(Number(record.gallons ?? 0), 2)}`).join(" · ")
            : "—",
      },
    ],
    [],
  );

  return (
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">Step 2 · State gallons (Q{quarter} {year})</h3>
        <p className="text-xs text-slate-800">Relay → Loves upload → dispatch fuel records with dedupe.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded-sm border border-slate-400 bg-slate-100 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Aggregating…" : "Run Step 2 — aggregate gallons"}
        </button>
        {prepQuery.data?.gallons_aggregated_at ? (
          <p className="text-slate-600">Last aggregated: {new Date(prepQuery.data.gallons_aggregated_at).toLocaleString()}</p>
        ) : null}
        {prepQuery.isError ? (
          <ListErrorState
            title="Couldn't load state gallons"
            status={0}
            message={(prepQuery.error as Error)?.message}
            onRetry={() => void prepQuery.refetch()}
          />
        ) : (
          <ParityTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.state}
            loading={prepQuery.isPending || (prepQuery.isFetching && rows.length === 0)}
            emptyText="No gallons aggregated yet — run Step 2."
            storageKey="ifta-step-gallons"
          />
        )}
        {rows.length > 0 ? <p className="text-right font-semibold text-slate-900">Total gallons: {fmtNum(total)}</p> : null}
      </div>
    </section>
  );
}
