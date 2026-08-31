import type { SettlementListRow } from "../../api/driverFinance";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { DataPanel } from "../layout/DataPanel";
import { DataPanelRow } from "../layout/DataPanelRow";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { colors } from "../../design/tokens";
import { formatUsd } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";

function formatMoney(value: number) {
  return formatUsd(value);
}

// GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31: PreSettlementsPanel uses DataTable columns
// (DRIVER · PERIOD · LOADS · DEBT · NET PAY) instead of the old column-jam flex layout.
const preSettlementColumns: DataTableColumn<SettlementListRow>[] = [
  {
    key: "driver",
    header: "Driver",
    render: (settlement) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={settlement.driver_id}
        name={settlement.driver_full_name}
        noun="Driver"
      />
    ),
  },
  {
    key: "period",
    header: "Period",
    render: (settlement) => (
      <EntityLink
        kind="settlement"
        id={settlement.id}
        label={`${formatDateUS(settlement.period_start)} – ${formatDateUS(settlement.period_end)}`}
      />
    ),
  },
  {
    key: "loads",
    header: "Loads",
    render: (settlement) => {
      // P14: real per-load EntityLinks when ids are present, fallback to count
      const links = settlement.load_links ?? [];
      if (links.length > 0) {
        return (
          <span className="flex flex-wrap gap-1">
            {links.map((link) => (
              <EntityLink
                key={link.id}
                kind="load"
                id={link.id}
                label={entityLabel(link.label, link.id, "Load")}
                className="text-xs text-gray-500 hover:underline"
              />
            ))}
          </span>
        );
      }
      if (settlement.load_count > 0) {
        return (
          <span className="text-xs text-gray-500">
            {settlement.load_count} load{settlement.load_count !== 1 ? "s" : ""}
          </span>
        );
      }
      return <span className="text-xs text-gray-400">—</span>;
    },
  },
  {
    key: "debt",
    header: "Debt",
    render: (settlement) => {
      // LINK-F5187: same real driver_finance.driver_liabilities ids the Settlements list links
      const ids = settlement.liability_ids ?? [];
      if (ids.length === 0) return <span className="text-xs text-gray-400">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {ids.map((id, idx) => (
            <EntityLink
              key={id}
              kind="liability"
              id={id}
              label={ids.length > 1 ? `debt #${idx + 1}` : "debt →"}
              className="text-[10px] text-red-600 hover:underline"
            />
          ))}
        </span>
      );
    },
  },
  {
    key: "net_pay",
    header: "Net Pay",
    className: "text-right",
    render: (settlement) => <span className="font-semibold">{formatMoney(Number(settlement.net_pay ?? 0))}</span>,
  },
];

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
};

export function PreSettlementsPanel({ rows, loading = false, isError = false, title = "Pre-settlements", showTotal = true }: Props) {
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  return (
    <DataPanel title={`${title} · ${rows.length} drivers`} accentColor={colors.accounting.strong}>
      {loading ? <p className="px-2 py-2 text-xs text-gray-500">Loading pre-settlements…</p> : null}
      {!loading && isError ? (
        <p className="px-2 py-2 text-xs text-red-700" data-testid="pre-settlements-error">
          Couldn&apos;t load pre-settlements. Try refreshing the page.
        </p>
      ) : null}
      {!loading &&
        !isError &&
        rows.length > 0 &&
        (
          <DataTable
            columns={preSettlementColumns}
            rows={rows}
            rowKey={(s) => s.id}
          />
        )}
      {!loading && !isError && rows.length === 0 ? (
        <p
          className="px-2 py-2 text-xs text-gray-500"
          data-testid="dispatch-pre-settlements-honest-empty"
        >
          No pre-settlements in presettle/acked/locked for this company. Deliver loads and run
          pre-settle in Driver Finance — rows appear here once settlements enter those statuses.
        </p>
      ) : null}
      {!isError && showTotal ? (
        <DataPanelRow>
          <span className="font-semibold">Total payout this batch</span>
          <span className="font-semibold">{formatMoney(total)}</span>
        </DataPanelRow>
      ) : null}
    </DataPanel>
  );
}
