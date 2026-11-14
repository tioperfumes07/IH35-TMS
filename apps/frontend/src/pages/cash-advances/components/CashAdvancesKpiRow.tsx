import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { entityLabel } from "../../../lib/entity-label";
import { formatUsdTable } from "../../../lib/money";
import { formatDateUS } from "../../../lib/formatDate";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatDisplayName } from "../../../components/v3/formatDisplayName";

/** A missing or non-numeric amount is UNKNOWN (null → "—"), never a confident 0. */
function amountOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function centsFromDollars(v: unknown): number | null {
  const n = amountOrNull(v);
  return n == null ? null : Math.round(n * 100);
}

type Props = {
  kpis?: Record<string, unknown>;
  /** ROUND 443.254 N1 — when mounted under Settlements, keep KPI drills in-module. */
  basePath?: string;
  /** Pending office requests (board Requests panel). */
  requestRows?: Array<Record<string, unknown>>;
  requestsLoading?: boolean;
  requestsFailed?: boolean;
  /** Advances preview (board Advances panel — same engine as roster). */
  advanceRows?: Array<Record<string, unknown>>;
  advancesLoading?: boolean;
  advancesFailed?: boolean;
  onOpenAdvance?: (row: Record<string, unknown>) => void;
};

/**
 * ROUND 443.274-C — Settlements-CashAdvances board
 * (Settlements-CashAdvances.dc.html).
 *
 * KPIs: Advances on file · Requests awaiting owner · Outstanding to recover ·
 * Recovered this period. Body: 1fr|2fr Requests | Advances + footnote.
 * Engines unchanged: getCashAdvancesKpis / listCashAdvances /
 * cashAdvanceRequestsOfficeApi.listPending.
 */

/** Absent stays absent. */
function amount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const money = (n: number | null) => (n === null ? null : formatUsdTable(n));
const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

function formatAsked(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  return formatDateUS(s) || s.slice(0, 10);
}

function formatPaid(raw: unknown): string {
  return formatAsked(raw);
}

function labelMethod(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const map: Record<string, string> = {
    cash: "Cash",
    check: "Check",
    ach: "ACH",
    wire: "Wire",
    fuel_card: "Fuel card",
    zelle: "Zelle",
    venmo: "Venmo",
    direct_bank_transfer: "Bank transfer",
    comdata: "Comdata",
    comchek: "Comchek",
    in_person_check: "Check",
  };
  if (map[s.toLowerCase()]) return map[s.toLowerCase()];
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function policyLabel(row: Record<string, unknown>): string {
  if (Boolean(row.owner_approval_required) && Boolean(row.owner_approval_token_expires_at)) {
    return "Pending owner";
  }
  if (Boolean(row.is_above_policy)) return "Above policy";
  return "Within policy";
}

const REQUESTS_PATH = "/driver-finance/cash-advance-requests";
const PREVIEW = 8;

export function CashAdvancesKpiRow({
  kpis,
  basePath = "/cash-advances",
  requestRows = [],
  requestsLoading = false,
  requestsFailed = false,
  advanceRows = [],
  advancesLoading = false,
  advancesFailed = false,
  onOpenAdvance,
}: Props) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const root = basePath.replace(/\/+$/, "") || "/cash-advances";
  // ROUND 8.20 — KPI drills shareable href+ret (not onClick navigate).
  const onFileHref = withReturnContext(root, originHref);
  const awaitingHref = withReturnContext(`${root}?tab=pending_approval`, originHref);
  const outstandingHref = withReturnContext(`${root}?tab=outstanding`, originHref);
  const recoveredHref = withReturnContext(`${root}?tab=paid_off`, originHref);
  const requestsViewAllHref = withReturnContext(REQUESTS_PATH, originHref);
  const advancesViewAllHref = withReturnContext(root, originHref);
  const onFile = amount(kpis, "advances_on_file");
  const awaiting = amount(kpis, "pending_approval");
  const outstanding = money(amount(kpis, "total_outstanding"));
  const recovered = money(amount(kpis, "recovered_this_period"));
  const previewRequests = requestRows.slice(0, PREVIEW);
  const previewAdvances = advanceRows.slice(0, PREVIEW);

  const requestColumns = useMemo<ParityColumn<Record<string, unknown>>[]>(
    () => [
      {
        key: "driver",
        label: "Driver",
        render: (row) => {
          const name = formatDisplayName(row.driver_name ? String(row.driver_name) : null);
          return (
            <EntityLink
              kind="driver"
              id={row.driver_id ? String(row.driver_id) : null}
              label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, "Driver")}
            />
          );
        },
      },
      {
        key: "asked",
        label: "Asked",
        render: (row) => formatAsked(row.submitted_at),
      },
      {
        key: "amount",
        label: "Amount",
        cellClass: "text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <MoneyCell
              cents={amountOrNull(row.requested_amount_cents)}
              drill={{ entity: { kind: "cash_advance_request", id } }}
            />
          );
        },
      },
      {
        key: "policy",
        label: "Policy",
        render: (row) => policyLabel(row),
      },
      {
        key: "action",
        label: "Action",
        render: () => (
          <button
            type="button"
            onClick={() => navigate(requestsViewAllHref)}
            className="bg-transparent p-0 text-xs font-semibold underline"
            style={{ color: V3.link, fontFamily: V3.font }}
          >
            Review
          </button>
        ),
      },
    ],
    [navigate, requestsViewAllHref],
  );

  const advanceColumns = useMemo<ParityColumn<Record<string, unknown>>[]>(
    () => [
      {
        key: "advance",
        label: "Advance",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <EntityLink
              kind="cash_advance"
              id={id}
              label={entityLabel(row.display_id != null ? String(row.display_id) : null, id, "Advance")}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
      },
      {
        key: "driver",
        label: "Driver",
        render: (row) => {
          const name = formatDisplayName(row.driver_full_name ? String(row.driver_full_name) : null);
          return (
            <EntityLink
              kind="driver"
              id={row.driver_id ? String(row.driver_id) : null}
              label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, "Driver")}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
      },
      {
        key: "paid",
        label: "Paid",
        render: (row) => formatPaid(row.disbursed_at ?? row.created_at),
      },
      {
        key: "method",
        label: "Method",
        render: (row) => labelMethod(row.disbursement_method),
      },
      {
        key: "amount",
        label: "Amount",
        cellClass: "text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <MoneyCell
              cents={centsFromDollars(row.amount)}
              format={(c) => formatUsdTable(c / 100)}
              drill={{ entity: { kind: "cash_advance", id } }}
            />
          );
        },
      },
      {
        key: "outstanding",
        label: "Outstanding",
        cellClass: "text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <MoneyCell
              cents={centsFromDollars(row.outstanding_balance)}
              format={(c) => formatUsdTable(c / 100)}
              drill={{ entity: { kind: "cash_advance", id } }}
            />
          );
        },
      },
      {
        key: "recover_on",
        label: "Recover on",
        render: (row) => {
          const loadLabel = row.load_display_id != null ? String(row.load_display_id) : null;
          if (!(row.load_id || loadLabel)) return "—";
          return (
            <EntityLink
              kind="load"
              id={row.load_id ? String(row.load_id) : null}
              label={entityLabel(loadLabel, row.load_id ? String(row.load_id) : null, "Load")}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="settlements-cash-advances-v3-chrome">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 8,
          fontFamily: V3.font,
        }}
        data-testid="cash-advances-kpi-strip"
        data-cash-advances-v3-kpis="1"
      >
        <V3KpiTile
          label="Advances on file"
          value={display(onFile === null ? null : Math.round(onFile))}
          testId="cash-advances-kpi-on-file"
          href={onFileHref}
        />
        <V3KpiTile
          label="Requests awaiting owner"
          value={display(awaiting === null ? null : Math.round(awaiting))}
          testId="cash-advances-kpi-awaiting"
          href={awaitingHref}
        />
        <V3KpiTile
          label="Outstanding to recover"
          value={display(outstanding)}
          testId="cash-advances-kpi-outstanding"
          href={outstandingHref}
        />
        <V3KpiTile
          label="Recovered this period"
          value={display(recovered)}
          sub="Sunday week advance_recovery lines"
          testId="cash-advances-kpi-recovered"
          href={recoveredHref}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}
        data-testid="settlements-cash-advances-board-body"
        data-settlements-cash-advances-board-1fr-2fr="1"
      >
        <BoardSection
          title="Requests"
          testId="settlements-cash-advances-requests-panel"
          viewAllHref={requestsViewAllHref}
        >
          <div data-testid="settlements-cash-advances-requests-body">
            {requestsFailed ? (
              <p className="px-3 py-2 text-xs" style={{ color: V3.muted }}>
                Requests failed to load — open View all to retry.
              </p>
            ) : (
              <ParityTable
                appearance="board"
                title="Requests preview"
                columns={requestColumns}
                rows={previewRequests}
                rowKey={(row) => String(row.id ?? row.display_id ?? "")}
                loading={requestsLoading}
                emptyText="No requests waiting"
                storageKey="settlements-cash-advances-requests-preview"
                tableTestId="settlements-cash-advances-requests-table"
                suppressToolbarSearch
                suppressToolbarRange
              />
            )}
          </div>
        </BoardSection>

        <BoardSection
          title="Advances"
          testId="settlements-cash-advances-advances-panel"
          viewAllHref={advancesViewAllHref}
          footer="Each advance links to its bank line (Zelle) and to the tour that recovers it."
        >
          <div data-testid="settlements-cash-advances-advances-body">
            {advancesFailed ? (
              <p className="px-3 py-2 text-xs" style={{ color: V3.muted }}>
                Advances failed to load — retry from the roster below.
              </p>
            ) : (
              <ParityTable
                appearance="board"
                title="Advances preview"
                columns={advanceColumns}
                rows={previewAdvances}
                rowKey={(row) => String(row.id ?? "")}
                loading={advancesLoading}
                emptyText="—"
                storageKey="settlements-cash-advances-advances-preview"
                tableTestId="settlements-cash-advances-advances-table"
                suppressToolbarSearch
                suppressToolbarRange
                onRowClick={onOpenAdvance ? (row) => onOpenAdvance(row) : undefined}
              />
            )}
          </div>
        </BoardSection>
      </div>
    </div>
  );
}
