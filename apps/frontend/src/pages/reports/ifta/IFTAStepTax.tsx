import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaCalculateTax, type IftaPreparation } from "../../../api/ifta";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatUsd } from "../../../lib/money";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

type StateTaxRow = NonNullable<IftaPreparation["state_taxes"]>[number];

function fmtNum(value: number, digits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtMoney(value: number) {
  return formatUsd(value);
}

export function IFTAStepTax({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaCalculateTax(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not calculate IFTA tax"), "error"),
  });

  const rows = prepQuery.data?.state_taxes ?? [];
  const totalOwed = rows.reduce((sum, row) => sum + Number(row.tax_owed ?? 0), 0);
  const columns = useMemo<ParityColumn<StateTaxRow>[]>(
    () => [
      { key: "state", label: "State", sortable: true, render: (row) => <span className="font-medium">{row.state}</span> },
      {
        key: "miles_in_state",
        label: "Miles",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.miles_in_state ?? 0),
        render: (row) => fmtNum(Number(row.miles_in_state ?? 0), 1),
      },
      {
        key: "taxable_gallons",
        label: "Taxable gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.taxable_gallons ?? 0),
        render: (row) => fmtNum(Number(row.taxable_gallons ?? 0), 1),
      },
      {
        key: "gallons_purchased_in_state",
        label: "Paid gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.gallons_purchased_in_state ?? 0),
        render: (row) => fmtNum(Number(row.gallons_purchased_in_state ?? 0), 1),
      },
      {
        key: "net_taxable_gallons",
        label: "Net gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.net_taxable_gallons ?? 0),
        render: (row) => fmtNum(Number(row.net_taxable_gallons ?? 0), 1),
      },
      {
        key: "tax_rate_per_gallon",
        label: "Rate",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.tax_rate_per_gallon ?? 0),
        render: (row) => fmtNum(Number(row.tax_rate_per_gallon ?? 0), 3),
      },
      {
        key: "tax_owed",
        label: "Tax/Credit",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        sortValue: (row) => Number(row.tax_owed ?? 0),
        render: (row) => (
          <span className={Number(row.tax_owed) < 0 ? "text-green-700" : undefined}>
            {fmtMoney(Number(row.tax_owed ?? 0))}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <div className="border-b border-slate-300 bg-slate-100 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Step 3 · Tax owed (Q{quarter} {year})</h3>
        <p className="text-xs text-slate-700">Per-state IFTA tax using official quarterly rates.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Calculating…" : "Run Step 3 — calculate tax"}
        </button>
        {prepQuery.data?.tax_calculated_at ? (
          <p className="text-slate-600">Last calculated: {new Date(prepQuery.data.tax_calculated_at).toLocaleString()}</p>
        ) : null}
        {prepQuery.isError ? (
          <ListErrorState
            title="Couldn't load state tax"
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
            emptyText="No tax rows yet — run Step 3 after Steps 1+2."
            storageKey="ifta-step-tax"
          />
        )}
        {rows.length > 0 ? (
          <p className="text-right font-semibold text-slate-700">
            Total net tax: {fmtMoney(totalOwed)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
