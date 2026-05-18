import type { SettlementListRow } from "../../api/driverFinance";
import { DataPanel } from "../layout/DataPanel";
import { DataPanelRow } from "../layout/DataPanelRow";
import { colors } from "../../design/tokens";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
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
          <DataPanelRow key={settlement.id}>
            <span>{settlement.driver_full_name} · {settlement.period_start} to {settlement.period_end}</span>
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
