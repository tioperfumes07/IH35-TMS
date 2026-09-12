import { settlementLabel } from "../../lib/settlementNumber";
import type { SettlementListRow } from "../../api/driverFinance";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { DataPanel } from "../layout/DataPanel";
import { DataPanelRow } from "../layout/DataPanelRow";
import { DataTable, type DataTableColumn } from "../DataTable";
import { colors } from "../../design/tokens";
import { formatUsd } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";

function formatMoney(value: number) {
  return formatUsd(value);
}

type Props = {
  rows: SettlementListRow[];
  loading?: boolean;
  /**
   * DISP-S33: without this, a failed fetch left `rows` at its `[]` default and rendered the SAME
   * "No pre-settlements ready right now." text as a genuine zero-row result — a swallowed error
   * masquerading as an honest empty state. Pass the query's isError through so a fetch failure is
   * named, not silently presented as "there is nothing to pay."
   */
  isError?: boolean;
  title?: string;
  showTotal?: boolean;
  emptyText?: string;
};

function renderLoadLinks(settlement: SettlementListRow) {
  const link = settlement.load_links?.[0];
  return link ? <EntityLink kind="load" id={link.id} label={entityLabel(link.label, link.id, "Load")} title="First linked load; open the settlement to see every load" /> : "—";
}

function renderSettlementLinks(settlement: SettlementListRow) {
  return (
    <span className="flex flex-col items-start gap-1">
      <EntityLink
        kind="settlement"
        id={settlement.id}
        label={settlementLabel(settlement)}
      />

    </span>
  );
}

// COL-06: both endpoints were already on SettlementListRow and already rendered, just collapsed
// under one ambiguous "Date" header instead of the canonical Settlement # / Period Begin / Period
// End contract (components/dispatch/LoadDetailSettlementTab.tsx) -- split to match it.
const preSettlementColumns: DataTableColumn<SettlementListRow>[] = [
  {
    key: "period_start",
    label: "Period Begin",
    sortable: true,
    sortValue: (row) => row.period_start,
    render: (row) => formatDateUS(row.period_start),
  },
  {
    key: "period_end",
    label: "Period End",
    sortable: true,
    sortValue: (row) => row.period_end,
    render: (row) => formatDateUS(row.period_end),
  },
  {
    key: "driver",
    label: "Driver",
    sortable: true,
    sortValue: (row) => row.driver_full_name,
    render: (row) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={row.driver_id}
        name={row.driver_full_name}
        noun="Driver"
      />
    ),
  },
  {
    key: "load_number",
    label: "Load Number",
    sortable: true,
    sortValue: (row) => row.load_links?.[0]?.label ?? "",
    render: renderLoadLinks,
  },
  {
    key: "settlement_number",
    label: "Settlement/Tour",
    sortable: true,
    sortValue: (row) => settlementLabel(row),
    render: renderSettlementLinks,
  },
  {
    key: "load_count", label: "Load count", sortable: true,
    sortValue: row => row.load_count, render: row => row.load_count,
  },
  {
    key: "liabilities", label: "Liabilities", sortable: true,
    sortValue: row => row.liability_ids?.length ?? 0,
    render: settlement => <span>      {(settlement.liability_ids ?? []).length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {(settlement.liability_ids ?? []).map((id, index) => (
            <EntityLink
              key={id}
              kind="liability"
              id={id}
              label={(settlement.liability_ids?.length ?? 0) > 1 ? `debt #${index + 1}` : "debt →"}
              className="text-xs text-red-600 hover:underline"
            />
          ))}
        </span>
      ) : null}</span>,
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    sortValue: (row) => Number(row.net_pay ?? 0),
    className: "text-right tabular-nums",
    render: (row) => formatMoney(Number(row.net_pay ?? 0)),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    sortValue: (row) => row.status,
    render: (row) => row.status,
  },
];

export function PreSettlementsPanel({ rows, loading = false, isError = false, title = "Pre-settlements", showTotal = true, emptyText = "No payment-ready pre-settlements for this company." }: Props) {
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  return (
    <DataPanel title={`${title} · ${loading || isError ? "—" : rows.length} settlements`} accentColor={colors.accounting.strong}>
      {loading ? <p className="px-2 py-2 text-xs text-gray-500">Loading pre-settlements…</p> : null}
      {!loading && isError ? (
        <p className="px-2 py-2 text-xs text-red-700" data-testid="pre-settlements-error">
          Couldn&apos;t load pre-settlements. Try refreshing the page.
        </p>
      ) : null}
      {!loading && !isError && rows.length > 0 ? (
        <DataTable
          columns={preSettlementColumns}
          rows={rows}
          rowKey={(row) => row.id}
          rowTestId={() => "pre-settlement-row-reverse"}
          hidePager
        />
      ) : null}
      {!loading && !isError && rows.length === 0 ? (
        <p
          className="px-2 py-2 text-xs text-gray-500"
          data-testid="dispatch-pre-settlements-honest-empty"
        >
          {emptyText}
        </p>
      ) : null}
      {!loading && !isError && showTotal ? (
        <DataPanelRow>
          <span className="font-semibold">Total payout this batch</span>
          <span className="font-semibold">{formatMoney(total)}</span>
        </DataPanelRow>
      ) : null}
    </DataPanel>
  );
}
