import type { SettlementListRow } from "../../api/driverFinance";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
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
        rows.map((settlement) => (
          <DataPanelRow key={settlement.id} data-testid="pre-settlement-row-reverse">
            <span className="flex flex-wrap items-center gap-1 text-sm">
              <EntityLinkOrTombstone
                kind="driver"
                id={settlement.driver_id}
                name={settlement.driver_full_name}
                noun="Driver"
              />
              <span className="text-gray-400">·</span>
              <EntityLink
                kind="settlement"
                id={settlement.id}
                label={`${formatDateUS(settlement.period_start)} – ${formatDateUS(settlement.period_end)}`}
              />
              {/* P14 settlements load reverse-link: real per-load EntityLinks when the ids are
                  present (current API), falling back to the honest plain count if an older cached
                  response still only carries load_count. */}
              {(settlement.load_ids ?? []).length > 0 ? (
                <>
                  <span className="text-gray-400">·</span>
                  {(settlement.load_ids ?? []).map((id, idx) => (
                    <EntityLink
                      key={id}
                      kind="load"
                      id={id}
                      label={
                        (settlement.load_ids?.length ?? 0) > 1 ? `load #${idx + 1}` : "load →"
                      }
                      className="text-xs text-gray-500 hover:underline"
                    />
                  ))}
                </>
              ) : settlement.load_count > 0 ? (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-xs text-gray-500">
                    {settlement.load_count} load{settlement.load_count !== 1 ? "s" : ""}
                  </span>
                </>
              ) : null}
              {/* LINK-F5187: same real driver_finance.driver_liabilities ids the Settlements list's
                  Debt Flag column now links — this panel reads the identical SettlementListRow shape. */}
              {(settlement.liability_ids ?? []).length > 0 ? (
                <>
                  <span className="text-gray-400">·</span>
                  {(settlement.liability_ids ?? []).map((id, idx) => (
                    <EntityLink
                      key={id}
                      kind="liability"
                      id={id}
                      label={(settlement.liability_ids?.length ?? 0) > 1 ? `debt #${idx + 1}` : "debt →"}
                      className="text-[10px] text-red-600 hover:underline"
                    />
                  ))}
                </>
              ) : null}
            </span>
            <span>{formatMoney(Number(settlement.net_pay ?? 0))}</span>
          </DataPanelRow>
        ))}
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
