import { useQuery } from "@tanstack/react-query";
import { listFactoringReserveBalances, type FactorReserveBalance } from "../../api/accounting";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { titleize } from "../../lib/titleize";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

// Display-only ParityTable migration: column order (Customer / Current reserve / Accrued /
// Released), the money() cents formatter, and the read-only cells are preserved 1:1 from the
// former hand-rolled table markup. No mutation lives in this table.
const columns: Array<ParityColumn<FactorReserveBalance>> = [
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    sortValue: (row) => entityLabel(row.customer_name, row.customer_id, "Customer"),
    render: (row) => (
      <EntityLink
        kind="customer"
        id={row.customer_id}
        label={entityLabel(row.customer_name, row.customer_id, "Customer")}
      />
    ),
  },
  {
    key: "reserve_balance_cents",
    label: "Current reserve",
    sortable: true,
    render: (row) => money(row.reserve_balance_cents),
  },
  {
    key: "reserve_accrued_cents",
    label: "Accrued",
    sortable: true,
    render: (row) => money(row.reserve_accrued_cents),
  },
  {
    key: "reserve_released_cents",
    label: "Released",
    sortable: true,
    render: (row) => money(row.reserve_released_cents),
  },
];

export function FactorReserveCard({ operatingCompanyId }: { operatingCompanyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "factoring-reserve-balances", operatingCompanyId],
    queryFn: () => listFactoringReserveBalances(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const events = query.data?.recent_events ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DataPanel title="Reserve balances by customer">
        {query.isError ? (
          <ListErrorState
            title="Couldn't load reserve balances"
            status={0}
            message={(query.error as Error | undefined)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable<FactorReserveBalance>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.customer_id}
            loading={query.isLoading}
            emptyText="No reserve balances yet."
            storageKey="accounting-factor-reserve-balances"
            tableTestId="factor-reserve-balances-table"
          />
        )}
      </DataPanel>

      <DataPanel title="Latest reserve events">
        <div className="space-y-2">
          {events.length === 0 ? <div className="text-xs text-gray-500">No reserve events yet.</div> : null}
          {events.map((event) => (
            <div key={`${event.factoring_advance_id}-${event.occurred_at}`} className="rounded-sm border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">
                  <EntityLink kind="factoring_advance" id={event.factoring_advance_id} label={entityLabel(event.display_id, event.factoring_advance_id, "Advance")} />{" "}
                  ·{" "}
                  <EntityLink
                    kind="customer"
                    id={event.customer_id}
                    label={entityLabel(event.customer_name, event.customer_id, "Customer")}
                  />
                </span>
                <span className="text-gray-500">{new Date(event.occurred_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-gray-700">
                Status: {titleize(event.status)} | Reserve: {money(event.reserve_amount_cents)} | Release: {money(event.release_amount_cents)} | Fee:{" "}
                {money(event.factor_fee_cents)}
              </div>
            </div>
          ))}
        </div>
      </DataPanel>
    </div>
  );
}
