import type { SettlementListRow } from "../../api/driverFinance";
import { EntityLink } from "../shared/EntityLink";
import { DataPanel } from "../layout/DataPanel";
import { DataPanelRow } from "../layout/DataPanelRow";
import { colors } from "../../design/tokens";
import { formatUsd } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

function formatMoney(value: number) {
  return formatUsd(value);
}

type Props = {
  rows: SettlementListRow[];
  loading?: boolean;
  title?: string;
  showTotal?: boolean;
};

export function PreSettlementsPanel({ rows, loading = false, title = "Pre-settlements", showTotal = true }: Props) {
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  return (
    <DataPanel title={`${title} · ${rows.length} drivers`} accentColor={colors.accounting.strong}>
      {loading ? <p className="px-2 py-2 text-xs text-gray-500">Loading pre-settlements…</p> : null}
      {!loading &&
        rows.map((settlement) => (
          <DataPanelRow key={settlement.id} data-testid="pre-settlement-row-reverse">
            <span className="flex flex-wrap items-center gap-1 text-sm">
              <EntityLink
                kind="driver"
                id={settlement.driver_id}
                label={settlement.driver_full_name || "Driver"}
              />
              <span className="text-gray-400">·</span>
              <EntityLink
                kind="settlement"
                id={settlement.id}
                label={`${formatDateUS(settlement.period_start)} – ${formatDateUS(settlement.period_end)}`}
              />
              {settlement.load_count > 0 ? (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-xs text-gray-500">
                    {settlement.load_count} load{settlement.load_count !== 1 ? "s" : ""}
                  </span>
                </>
              ) : null}
            </span>
            <span>{formatMoney(Number(settlement.net_pay ?? 0))}</span>
          </DataPanelRow>
        ))}
      {!loading && rows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No pre-settlements ready right now.</p> : null}
      {showTotal ? (
        <DataPanelRow>
          <span className="font-semibold">Total payout this batch</span>
          <span className="font-semibold">{formatMoney(total)}</span>
        </DataPanelRow>
      ) : null}
    </DataPanel>
  );
}
