import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { recordLineActual, type ForecastLine } from "../../../api/financeScenarios";
import { formatUsdCents } from "../../../lib/money";

// GLB-05 — delegates to the canonical formatter instead of reimplementing it (the old body used an
// unpinned toLocaleString(undefined, ...) locale, not guaranteed QBO "$1,234.56").
const dollars = (cents: number) => formatUsdCents(cents);

type Props = {
  lines: ForecastLine[];
  operatingCompanyId: string;
  editable: boolean;
  invalidateKey: unknown[];
};

/** Shared estimate-vs-actual line table for the Scenario detail view and the Projections tab —
 * one canonical rendering of finance.forecast_lines so the two surfaces never drift apart. */
export function ScenarioLinesTable({ lines, operatingCompanyId, editable, invalidateKey }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const recordActualMutation = useMutation({
    mutationFn: (input: { lineId: string; cents: number }) => recordLineActual(input.lineId, operatingCompanyId, input.cents),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invalidateKey }),
    onError: (error) => pushToast(userFacingApiError(error, "Failed to record actual"), "error"),
  });

  const columns = useMemo<ParityColumn<ForecastLine>[]>(
    () => [
      { key: "period_label", label: "Period", sortable: true },
      {
        key: "category_kind",
        label: "Kind",
        sortable: true,
        render: (row) => (
          <span className={row.category_kind === "revenue" ? "font-medium text-slate-800" : "text-slate-600"}>
            {row.category_kind}
          </span>
        ),
      },
      { key: "category_label", label: "Category", sortable: true },
      { key: "assumption_note", label: "Assumption" },
      {
        key: "linkage",
        label: "Linked to",
        render: (row) =>
          row.customer_id ? (
            <EntityLinkOrTombstone kind="customer" id={row.customer_id} name={row.customer_name} noun="Customer" />
          ) : row.vendor_id ? (
            <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" />
          ) : row.gl_account_id ? (
            <EntityLinkOrTombstone kind="account" id={row.gl_account_id} name={row.account_name} noun="Account" />
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        key: "estimate_amount_cents",
        label: "Estimate",
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => dollars(row.estimate_amount_cents),
      },
      {
        key: "actual_amount_cents",
        label: "Actual",
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) =>
          editable ? (
            <MoneyInput
              valueCents={row.actual_amount_cents ?? null}
              onChangeCents={(cents) => {
                if (cents == null) return;
                recordActualMutation.mutate({ lineId: row.id, cents });
              }}
              ariaLabel={`Actual for ${row.period_label} ${row.category_label}`}
            />
          ) : row.actual_amount_cents != null ? (
            dollars(row.actual_amount_cents)
          ) : (
            <span className="text-slate-400">not recorded</span>
          ),
      },
      {
        key: "variance",
        label: "Variance",
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => {
          if (row.actual_amount_cents == null) return <span className="text-slate-400">—</span>;
          const diff = row.actual_amount_cents - row.estimate_amount_cents;
          const favorable = row.category_kind === "revenue" ? diff >= 0 : diff <= 0;
          return <span className={favorable ? "text-slate-700" : "text-red-600"}>{dollars(diff)}</span>;
        },
      },
    ],
    [editable, recordActualMutation]
  );

  return (
    <ParityTable<ForecastLine>
      columns={columns}
      rows={lines}
      rowKey={(r) => r.id}
      storageKey="finance-scenario-lines"
      tableTestId="finance-scenario-lines-table"
      emptyText="No line items."
    />
  );
}
