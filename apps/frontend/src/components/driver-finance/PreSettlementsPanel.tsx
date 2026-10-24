import { Link } from "react-router-dom";
import { settlementNumber } from "../../lib/settlementNumber";
import type { TourListRow } from "../../api/tourReadout";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { V3Panel } from "../v3/V3Panel";
import { V3 } from "../../design/v3-tokens";
import { formatUsdCents } from "../../lib/money";
import { QBO_MONEY_CELL_CLASS } from "../../design/qbo-parity";

type TourRowWithLoadLinks = TourListRow & {
  /** Optional; when absent, projected from legs for SETL-F5831 reverse drill. */
  load_links?: Array<{ id: string; label: string }>;
  /** LINK-F5187: real driver_finance.driver_liabilities ids threaded from recompute_driver_debt.source_liabilities. */
  liability_ids?: string[];
};

/** LINK-F5187 — liability chip strip per settlement.liability_ids (real driver_finance.driver_liabilities ids). */
function renderLiabilityPills(settlement: TourRowWithLoadLinks) {
  const ids = settlement.liability_ids ?? [];
  if (ids.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id, idx) => (
        <EntityLink
          key={id}
          kind="liability"
          id={id}
          label={ids.length > 1 ? `debt #${idx + 1}` : "debt →"}
          className="text-xs text-red-600 hover:underline"
        />
      ))}
    </span>
  );
}

/** SETL-F5831 — each load drills kind=load with its human label (legs → load_links). */
function renderLoadPills(settlement: TourRowWithLoadLinks) {
  const links =
    settlement.load_links ??
    (settlement.legs ?? []).map((leg) => ({ id: leg.load_id, label: leg.load_number }));
  if (links.length === 0) {
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

type Props = {
  rows: TourListRow[];
  loading?: boolean;
  /**
   * DISP-S33: without this, a failed fetch left `rows` at its `[]` default and rendered the SAME
   * empty text as a genuine zero-row result — a swallowed error masquerading as an honest empty state.
   */
  isError?: boolean;
  title?: string;
  showTotal?: boolean;
  emptyText?: string;
  onViewAll?: () => void;
};

/** Board Number: AlwaysTrack doc when present, else P-series display_id while open. */
function tourNumberLabel(r: TourListRow): string {
  const at = settlementNumber(r);
  if (at) return at;
  const did = (r.display_id ?? "").trim();
  if (/^P-\d+/i.test(did)) return did;
  if (did && !/^S-\d{4}-\d+/i.test(did) && did.toLowerCase() !== "open" && did.toLowerCase() !== "pending") {
    return did;
  }
  return r.is_open ? "—" : "No number";
}

/** ROUND 443.280-A — Ready = n/6 dots from listTours ready_ok / ready_total. */
function ReadyDots({ ok, total }: { ok: number; total: number }) {
  const n = Math.max(0, total || 6);
  const passed = Math.max(0, Math.min(ok, n));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${passed}/${n} ready checks`}
      data-testid="pre-settle-ready-dots"
      aria-label={`${passed} of ${n} ready`}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: i < passed ? "#14314F" : "#D1D5DB" }}
          data-ready={i < passed ? "1" : "0"}
        />
      ))}
      <span className="ml-1 tabular-nums text-xs text-[#6B7280]">
        {passed}/{n}
      </span>
    </span>
  );
}

function waitingOnReason(r: TourListRow): string {
  return (r.close_blockers[0] ?? "").trim();
}

/**
 * ROUND 443.280-A board columns (Settlements-PreSettlements.png):
 * Number · Driver · Unit · Loads so far · Pay so far · Ready · Waiting on.
 * Unit / Ready / Waiting on read listTours — never hardcoded "—".
 * Period Begin/End / Liabilities / Status are OFF the board (layout replace, not Rule-07 layer).
 */
const preSettlementColumns: ParityColumn<TourListRow>[] = [
  {
    key: "number",
    label: "Number",
    sortable: true,
    sortValue: (row) => tourNumberLabel(row),
    render: (settlement) => (
      <span className="flex flex-col gap-0.5">
        <EntityLink kind="settlement" id={settlement.settlement_id} label={tourNumberLabel(settlement)} />
        {renderLiabilityPills(settlement)}
      </span>
    ),
  },
  {
    key: "driver",
    label: "Driver",
    sortable: true,
    sortValue: (row) => row.driver_name ?? "",
    render: (row) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={row.driver_id}
        name={entityLabel(row.driver_name, row.driver_id, "Driver")}
        noun="Driver"
      />
    ),
  },
  {
    key: "unit",
    label: "Unit",
    sortable: true,
    sortValue: (row) => row.unit_number ?? "",
    render: (row) => (
      <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
    ),
  },
  {
    key: "loads_so_far",
    label: "Loads so far",
    sortable: true,
    sortValue: (row) => row.leg_count,
    render: (row) => renderLoadPills(row),
  },
  {
    key: "amount",
    label: "Pay so far",
    sortable: true,
    sortValue: (row) => row.driver_pay_cents,
    className: QBO_MONEY_CELL_CLASS,
    render: (row) => (
      <span className={QBO_MONEY_CELL_CLASS}>{formatUsdCents(row.driver_pay_cents)}</span>
    ),
  },
  {
    key: "ready",
    label: "Ready",
    sortable: true,
    sortValue: (row) => row.ready_ok,
    render: (row) => <ReadyDots ok={row.ready_ok} total={row.ready_total || 6} />,
  },
  {
    key: "waiting_on",
    label: "Waiting on",
    sortable: true,
    sortValue: (row) => waitingOnReason(row),
    render: (row) => {
      const reason = waitingOnReason(row);
      return reason ? (
        <span
          title={row.close_blockers.join("\n")}
          data-testid="pre-settle-waiting-on"
          className="block max-w-[260px] truncate text-left"
        >
          {reason}
        </span>
      ) : (
        <span className="text-[#6B7280]">—</span>
      );
    },
  },
  // 443.293-B — Dispatch / Settlements board: Close settlement → same 7-step wizard (one engine).
  {
    key: "close",
    label: "Close",
    sortable: false,
    render: (row) =>
      row.is_open && row.driver_id ? (
        <Link
          to={`/driver-finance/settlement-close?driver_id=${encodeURIComponent(row.driver_id)}&settlement_id=${encodeURIComponent(row.settlement_id)}`}
          className="inline-flex h-7 items-center rounded-sm bg-[#14314F] px-2 text-xs font-semibold text-white hover:opacity-90"
          data-testid="pre-settle-close-settlement"
          title="Opens the same 7-step Settlement Close wizard for this driver's open tour"
        >
          Close settlement
        </Link>
      ) : (
        <span className="text-[#6B7280]">—</span>
      ),
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
  const totalCents = rows.reduce((sum, row) => sum + Number(row.driver_pay_cents ?? 0), 0);
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
            storageKey="pre-settlements-panel-v3-board-tours"
            columns={preSettlementColumns}
            rows={rows}
            rowKey={(row) => row.settlement_id}
            rowTestId={() => "pre-settlement-row-reverse"}
            hidePager
            pageSize={Math.max(1, rows.length)}
            footerCells={
              showTotal
                ? {
                    loads_so_far: <span className="font-semibold">Total</span>,
                    amount: (
                      <span className={`font-semibold ${QBO_MONEY_CELL_CLASS}`}>
                        {formatUsdCents(totalCents)}
                      </span>
                    ),
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
            <span className={`font-semibold ${QBO_MONEY_CELL_CLASS}`}>{formatUsdCents(totalCents)}</span>
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
