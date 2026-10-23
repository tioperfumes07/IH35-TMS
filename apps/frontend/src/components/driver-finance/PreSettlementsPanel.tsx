import { settlementLabel } from "../../lib/settlementNumber";
import type { SettlementListRow } from "../../api/driverFinance";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { V3Panel } from "../v3/V3Panel";
import { V3 } from "../../design/v3-tokens";
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
  if (link) {
    return <EntityLink kind="load" id={link.id} label={entityLabel(link.label, link.id, "Load")} title="First linked load; open the settlement to see every load" />;
  }
  // E11-D4 (Lead ruling, 2026-09-23) — "never blank": a settlement ready for review/payment with
  // no load link is a real, named state (e.g. a non-load-bookended settlement model), not an
  // absence to render silently.
  return <span className="text-xs italic text-[#4B5563]">No load assigned</span>;
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
// ROUND 443.250 board also names Number / Loads so far / Pay so far — mapped onto Settlement/Tour,
// Load count, Amount. Unit / Ready / Waiting on are NOT on SettlementListRow — not invented.
const preSettlementColumns: ParityColumn<SettlementListRow>[] = [
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
    key: "load_count", label: "Loads so far", sortable: true,
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
    label: "Pay so far",
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

export function PreSettlementsPanel({
  rows,
  loading = false,
  isError = false,
  title = "Open pre-settlements",
  showTotal = true,
  emptyText = "No payment-ready pre-settlements for this company.",
}: Props) {
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  const countLabel = loading || isError ? "—" : String(rows.length);
  return (
    <V3Panel
      title={`${title} · ${countLabel}`}
      subtitle="open tours · not closed · not paid"
      testId="pre-settlements-v3-panel"
    >
      <div data-settlements-presettle-v3-panel="1">
      {loading ? <p className="px-2 py-2 text-xs text-gray-500">Loading pre-settlements…</p> : null}
      {!loading && isError ? (
        <p className="px-2 py-2 text-xs text-red-700" data-testid="pre-settlements-error">
          Couldn&apos;t load pre-settlements. Try refreshing the page.
        </p>
      ) : null}
      {!loading && !isError && rows.length > 0 ? (
        <ParityTable
          storageKey="pre-settlements-panel"
          columns={preSettlementColumns}
          rows={rows}
          rowKey={(row) => row.id}
          rowTestId={() => "pre-settlement-row-reverse"}
          hidePager
          pageSize={Math.max(1, rows.length)}
          footerCells={
            showTotal
              ? {
                  period_start: <span className="font-semibold">Total payout this batch</span>,
                  amount: <span className="font-semibold">{formatMoney(total)}</span>,
                }
              : undefined
          }
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
      {!loading && !isError && showTotal && rows.length === 0 ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 14px",
            fontSize: 12,
            fontFamily: V3.font,
            color: V3.ink,
            borderTop: `1px solid ${V3.borderSoft}`,
          }}
        >
          <span className="font-semibold">Total payout this batch</span>
          <span className="font-semibold">{formatMoney(total)}</span>
        </div>
      ) : null}
      </div>
    </V3Panel>
  );
}
