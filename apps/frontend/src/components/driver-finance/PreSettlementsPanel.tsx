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
import { QBO_MONEY_CELL_CLASS } from "../../design/qbo-parity";

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
  onViewAll?: () => void;
};

function renderLoadPills(settlement: SettlementListRow) {
  const links = settlement.load_links ?? [];
  if (links.length === 0) {
    // E11-D4 — "never blank": named gap, not a silent dash.
    return <span className="text-xs italic text-[#4B5563]">No load assigned</span>;
  }
  return (
    <span className="flex flex-wrap gap-1" data-testid="pre-settlement-load-pills">
      {links.map((link) => (
        <EntityLink
          key={link.id}
          kind="load"
          id={link.id}
          label={entityLabel(link.label, link.id, "Load")}
          className="inline-flex items-center rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-1.5 py-0.5 text-xs text-[#1F2A44]"
          title="Load on this open pre-settlement"
        />
      ))}
    </span>
  );
}

function renderNumber(settlement: SettlementListRow) {
  return (
    <EntityLink
      kind="settlement"
      id={settlement.id}
      label={settlementLabel(settlement)}
    />
  );
}

/**
 * ROUND 443.274-C board columns (Settlements-PreSettlements.png):
 * Number · Driver · Unit · Loads so far · Pay so far · Ready · Waiting on.
 * Unit / Ready / Waiting on are NOT on SettlementListRow — render "—" (never invent).
 * Rule 07 keeps Period Begin/End / Status / Liabilities as extra ParityTable columns.
 */
const preSettlementColumns: ParityColumn<SettlementListRow>[] = [
  {
    key: "number",
    label: "Number",
    sortable: true,
    sortValue: (row) => settlementLabel(row),
    render: renderNumber,
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
    key: "unit",
    label: "Unit",
    sortable: true,
    sortValue: () => "",
    render: () => (
      <span className="text-[#6B7280]" title="Unit is not on the open pre-settlement list row — open the tour">
        —
      </span>
    ),
  },
  {
    key: "loads_so_far",
    label: "Loads so far",
    sortable: true,
    sortValue: (row) => row.load_count,
    render: renderLoadPills,
  },
  {
    key: "amount",
    label: "Pay so far",
    sortable: true,
    sortValue: (row) => Number(row.net_pay ?? 0),
    className: QBO_MONEY_CELL_CLASS,
    render: (row) => <span className={QBO_MONEY_CELL_CLASS}>{formatMoney(Number(row.net_pay ?? 0))}</span>,
  },
  {
    key: "ready",
    label: "Ready",
    sortable: true,
    sortValue: () => "",
    render: () => (
      <span
        className="text-[#6B7280]"
        title="Ready checks live on the tour (443.269-A) — open the Number link"
      >
        —
      </span>
    ),
  },
  {
    key: "waiting_on",
    label: "Waiting on",
    sortable: true,
    sortValue: () => "",
    render: () => (
      <span
        className="text-[#6B7280]"
        title="Waiting-on text lives on the tour readiness panel — open the Number link"
      >
        —
      </span>
    ),
  },
  // Rule 07 — keep prior columns as extras (column chooser); board defaults are above.
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
    key: "liabilities",
    label: "Liabilities",
    sortable: true,
    sortValue: (row) => row.liability_ids?.length ?? 0,
    render: (settlement) => (
      <span>
        {(settlement.liability_ids ?? []).length > 0 ? (
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
        ) : null}
      </span>
    ),
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
  onViewAll,
}: Props) {
  const total = rows.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  const countLabel = loading || isError ? "—" : String(rows.length);
  return (
    <V3Panel
      title={`${title} · ${countLabel}`}
      subtitle="open tours · not closed · not paid"
      testId="pre-settlements-v3-panel"
      onViewAll={onViewAll}
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
          storageKey="pre-settlements-panel-v3-board"
          columns={preSettlementColumns}
          rows={rows}
          rowKey={(row) => row.id}
          rowTestId={() => "pre-settlement-row-reverse"}
          hidePager
          pageSize={Math.max(1, rows.length)}
          footerCells={
            showTotal
              ? {
                  loads_so_far: <span className="font-semibold">Total</span>,
                  amount: <span className={`font-semibold ${QBO_MONEY_CELL_CLASS}`}>{formatMoney(total)}</span>,
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
          <span className={`font-semibold ${QBO_MONEY_CELL_CLASS}`}>{formatMoney(total)}</span>
        </div>
      ) : null}
      <p
        className="px-3.5 py-2 text-xs text-[#6B7280]"
        data-testid="pre-settlements-booked-ahead-note"
        style={{ fontFamily: V3.font, borderTop: `1px solid ${V3.borderSoft}` }}
      >
        A booked-ahead load joins the driver&apos;s open pre-settlement (443.244).
      </p>
      </div>
    </V3Panel>
  );
}
