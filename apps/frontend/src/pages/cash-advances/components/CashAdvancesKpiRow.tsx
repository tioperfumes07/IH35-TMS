import { useNavigate } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { entityLabel } from "../../../lib/entity-label";
import { formatUsdTable } from "../../../lib/money";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatDisplayName } from "../../../components/v3/formatDisplayName";

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
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

const thStyle = {
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 700,
  color: V3.muted,
  padding: "7px 12px",
  borderBottom: `1px solid ${V3.border}`,
  background: V3.page,
  whiteSpace: "nowrap" as const,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};

const tdStyle = {
  padding: "7px 12px",
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: 12,
  color: V3.ink,
  whiteSpace: "nowrap" as const,
  fontFamily: V3.font,
  fontVariantNumeric: "tabular-nums" as const,
};

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
  const root = basePath.replace(/\/+$/, "") || "/cash-advances";
  const onFile = amount(kpis, "advances_on_file");
  const awaiting = amount(kpis, "pending_approval");
  const outstanding = money(amount(kpis, "total_outstanding"));
  const previewRequests = requestRows.slice(0, PREVIEW);
  const previewAdvances = advanceRows.slice(0, PREVIEW);

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
          onClick={() => navigate(root)}
        />
        <V3KpiTile
          label="Requests awaiting owner"
          value={display(awaiting === null ? null : Math.round(awaiting))}
          testId="cash-advances-kpi-awaiting"
          onClick={() => navigate(`${root}?tab=pending_approval`)}
        />
        <V3KpiTile
          label="Outstanding to recover"
          value={display(outstanding)}
          testId="cash-advances-kpi-outstanding"
          onClick={() => navigate(`${root}?tab=outstanding`)}
        />
        <V3KpiTile
          label="Recovered this period"
          value="—"
          sub="no period total on KPI feed"
          testId="cash-advances-kpi-recovered"
          onClick={() => navigate(`${root}?tab=paid_off`)}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}
        data-testid="settlements-cash-advances-board-body"
        data-settlements-cash-advances-board-1fr-2fr="1"
      >
        <V3Panel
          title="Requests"
          testId="settlements-cash-advances-requests-panel"
          onViewAll={() => navigate(REQUESTS_PATH)}
        >
          <div style={{ overflowX: "auto" }} data-testid="settlements-cash-advances-requests-body">
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
              <thead>
                <tr>
                  <th style={thStyle}>Driver</th>
                  <th style={thStyle}>Asked</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  <th style={thStyle}>Policy</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requestsFailed ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, color: V3.muted }}>
                      Requests failed to load — open View all to retry.
                    </td>
                  </tr>
                ) : requestsLoading ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, color: V3.muted }}>
                      Loading…
                    </td>
                  </tr>
                ) : previewRequests.length === 0 ? (
                  <tr data-testid="settlements-cash-advances-requests-empty">
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>No requests waiting</td>
                  </tr>
                ) : (
                  previewRequests.map((row) => {
                    const id = String(row.id ?? "");
                    const name = formatDisplayName(row.driver_name ? String(row.driver_name) : null);
                    const cents = Number(row.requested_amount_cents ?? 0);
                    return (
                      <tr key={id || String(row.display_id)} data-testid={`settlements-cash-advances-request-${id}`}>
                        <td style={tdStyle}>
                          <EntityLink
                            kind="driver"
                            id={row.driver_id ? String(row.driver_id) : null}
                            label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, "Driver")}
                          />
                        </td>
                        <td style={tdStyle}>{formatAsked(row.submitted_at)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <MoneyCell
                            cents={Number.isFinite(cents) ? cents : null}
                            drill={{ entity: { kind: "cash_advance_request", id } }}
                          />
                        </td>
                        <td style={tdStyle}>{policyLabel(row)}</td>
                        <td style={tdStyle}>
                          <button
                            type="button"
                            onClick={() => navigate(REQUESTS_PATH)}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: V3.link,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              fontFamily: V3.font,
                              textDecoration: "underline",
                            }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </V3Panel>

        <V3Panel
          title="Advances"
          testId="settlements-cash-advances-advances-panel"
          onViewAll={() => navigate(root)}
          footer="Each advance links to its bank line (Zelle) and to the tour that recovers it."
        >
          <div style={{ overflowX: "auto" }} data-testid="settlements-cash-advances-advances-body">
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
              <thead>
                <tr>
                  <th style={thStyle}>Advance</th>
                  <th style={thStyle}>Driver</th>
                  <th style={thStyle}>Paid</th>
                  <th style={thStyle}>Method</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Outstanding</th>
                  <th style={thStyle}>Recover on</th>
                </tr>
              </thead>
              <tbody>
                {advancesFailed ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, color: V3.muted }}>
                      Advances failed to load — retry from the roster below.
                    </td>
                  </tr>
                ) : advancesLoading ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, color: V3.muted }}>
                      Loading…
                    </td>
                  </tr>
                ) : previewAdvances.length === 0 ? (
                  <tr data-testid="settlements-cash-advances-advances-empty">
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: V3.muted }}>—</td>
                    <td style={{ ...tdStyle, color: V3.muted }}>—</td>
                  </tr>
                ) : (
                  previewAdvances.map((row) => {
                    const id = String(row.id ?? "");
                    const name = formatDisplayName(
                      row.driver_full_name ? String(row.driver_full_name) : null,
                    );
                    const loadLabel = row.load_display_id != null ? String(row.load_display_id) : null;
                    return (
                      <tr
                        key={id}
                        data-testid={`settlements-cash-advances-advance-${id}`}
                        style={{ cursor: onOpenAdvance ? "pointer" : undefined }}
                        onClick={() => onOpenAdvance?.(row)}
                      >
                        <td style={tdStyle}>
                          <EntityLink
                            kind="cash_advance"
                            id={id}
                            label={entityLabel(
                              row.display_id != null ? String(row.display_id) : null,
                              id,
                              "Advance",
                            )}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td style={tdStyle}>
                          <EntityLink
                            kind="driver"
                            id={row.driver_id ? String(row.driver_id) : null}
                            label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, "Driver")}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td style={tdStyle}>{formatPaid(row.disbursed_at ?? row.created_at)}</td>
                        <td style={tdStyle}>{labelMethod(row.disbursement_method)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <MoneyCell
                            cents={Math.round(Number(row.amount ?? 0) * 100)}
                            format={(c) => formatUsdTable(c / 100)}
                            drill={{ entity: { kind: "cash_advance", id } }}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <MoneyCell
                            cents={Math.round(Number(row.outstanding_balance ?? 0) * 100)}
                            format={(c) => formatUsdTable(c / 100)}
                            drill={{ entity: { kind: "cash_advance", id } }}
                          />
                        </td>
                        <td style={tdStyle}>
                          {row.load_id || loadLabel ? (
                            <EntityLink
                              kind="load"
                              id={row.load_id ? String(row.load_id) : null}
                              label={entityLabel(loadLabel, row.load_id ? String(row.load_id) : null, "Load")}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </V3Panel>
      </div>
    </div>
  );
}
