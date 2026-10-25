/**
 * ROUND 443.267 / 443.280 board 3 — Banking Home (board-faithful, not shell).
 * Board: docs/design/v3/Banking.png (+ Banking.dc.html)
 * Sections (order): KPI strip → Accounts | Reconciliation drift (1fr 1fr) → Latest lines.
 * Engines: getMoneyMap · getBankingTiles · getDriftAlerts · getPlaidCompanyTransactions.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  getBankingTiles,
  getDriftAlerts,
  getMoneyMap,
  getPlaidCompanyTransactions,
  type BankingTile,
  type DriftAlert,
  type MoneyMapAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { companyToday, monthBoundsIso } from "../../../lib/businessDate";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
import { BANKING_TAB_PATH } from "../../../router/route-manifest";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatUsdCents } from "../../../utils/qboFormat";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: CSSProperties = {
  fontSize: V3_TABLE.fontPx,
  color: V3.ink,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  verticalAlign: "middle",
};

function daysOpen(detectedAt: string): number {
  const ms = Date.now() - new Date(detectedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Board Latest lines Date column: "10-21" (MM-DD, no year). */
function formatBoardMmDd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const [, m, d] = day.split("-");
  if (!m || !d) return iso;
  return `${m}-${d}`;
}

/** Board Latest lines Amount: signed dollars without currency glyph (−150.00 / +2,000.00). */
function formatSignedCentsClean(cents: number, isCredit: boolean): string {
  const n = Math.abs(cents) / 100;
  const body = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isCredit ? `+${body}` : `−${body}`;
}

function accountTypeLabel(tile: BankingTile | undefined, mapRow: MoneyMapAccount | undefined): string {
  if (tile?.is_relay_wallet || tile?.system_purpose === "relay_fuel_wallet") return "Wallet";
  if (tile?.tile_kind === "virtual") {
    const name = `${tile.display_name ?? ""} ${tile.account_type ?? ""}`.toLowerCase();
    if (tile.account_type === "virtual_escrow" || /escrow|reserve/.test(name)) return "Reserve";
    if (tile.account_type === "virtual_factoring" || tile.account_type === "virtual_advance") return "Clearing";
    return "Virtual";
  }
  const t = String(tile?.account_type ?? mapRow?.account_name ?? "").toLowerCase();
  if (/credit|card|wex|diesel/.test(t) || /card/.test(String(tile?.tag ?? "").toLowerCase())) return "Card";
  if (/checking|depository|bank|freight|bofa/.test(t)) return "Checking";
  if (tile?.account_type) {
    const pretty = tile.account_type.replace(/_/g, " ");
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
  return "Bank";
}

function accountDisplayName(tile: BankingTile | undefined, mapRow: MoneyMapAccount | undefined): string {
  const base =
    tile?.display_name?.trim() ||
    mapRow?.account_nickname?.trim() ||
    mapRow?.account_name?.trim() ||
    "Account";
  // Board Accounts: "USMCA FREIGHT · BofA" when institution is known and not already in the label.
  const inst = (mapRow?.institution_name ?? "").trim();
  if (!inst || base.includes("·") || base.toLowerCase().includes(inst.toLowerCase())) return base;
  return `${base} · ${inst}`;
}

function FeedCell({ feed }: { feed: boolean }): ReactNode {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: V3_TABLE.fontPx,
        fontWeight: 500,
        color: V3.ink,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: feed ? "#15803D" : "#94A3B8",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {feed ? "Feed" : "No feed"}
    </span>
  );
}

function hasFeed(tile: BankingTile | undefined, mapRow: MoneyMapAccount | undefined): boolean {
  if (tile?.tile_kind === "virtual") return false;
  if (mapRow?.last_feed_at) return true;
  if (tile?.last_txn_date) return true;
  // Real tile with any lines this month counts as fed
  if (mapRow && Number(mapRow.line_count) > 0) return true;
  return false;
}

function virtualTilePath(tile: BankingTile | undefined): string | null {
  if (!tile || tile.tile_kind !== "virtual") return null;
  if (tile.account_type === "virtual_factoring") return "/factoring/reserve";
  if (tile.account_type === "virtual_escrow") return "/banking/driver-escrow";
  if (tile.account_type === "virtual_advance") return "/cash-advances";
  return null;
}

function linkCtaLabel(tx: PlaidBankTransaction, accountIsRelay: boolean): string {
  if (tx.is_credit) return "Apply to invoices →";
  const desc = `${tx.description ?? ""} ${tx.merchant_name ?? ""}`.toLowerCase();
  if (accountIsRelay || /love'?s|pilot|ta\b|relay|fuel/.test(desc)) return "Link truck · load →";
  if (/zelle|payment to|cash app|venmo/.test(desc)) return "Link driver →";
  if (/tire|truck center|repair|service|tow|shop/.test(desc)) return "Link unit · WO →";
  return "Link →";
}

function LinkedToCell({
  tx,
  accountIsRelay,
}: {
  tx: PlaidBankTransaction;
  accountIsRelay: boolean;
}): ReactNode {
  const bits: ReactNode[] = [];
  if (tx.categorization_driver_id) {
    bits.push(
      <EntityLink
        key="drv"
        kind="driver"
        id={tx.categorization_driver_id}
        label={entityLabel(tx.categorization_driver_name, tx.categorization_driver_id, "Driver")}
      />,
    );
  }
  if (tx.categorization_unit_id) {
    bits.push(
      <EntityLink
        key="unit"
        kind="unit"
        id={tx.categorization_unit_id}
        label={entityLabel(tx.categorization_unit_number, tx.categorization_unit_id, "Unit")}
      />,
    );
  }
  if (tx.resolved_load_id || tx.matched_load_id || tx.categorization_load_id) {
    const id = String(tx.resolved_load_id ?? tx.matched_load_id ?? tx.categorization_load_id);
    const label = entityLabel(
      tx.resolved_load_number ?? tx.matched_load_number ?? tx.categorization_load_number,
      id,
      "Load",
    );
    bits.push(<EntityLink key="load" kind="load" id={id} label={label} />);
  }
  if (tx.matched_bill_id) {
    bits.push(
      <EntityLink
        key="bill"
        kind="bill"
        id={tx.matched_bill_id}
        label={visibleDocumentLabel(tx.matched_bill_number, tx.matched_bill_id, "Bill")}
      />,
    );
  }
  if (tx.matched_expense_id) {
    bits.push(
      <EntityLink
        key="exp"
        kind="expense"
        id={tx.matched_expense_id}
        label={entityLabel(tx.matched_expense_number, tx.matched_expense_id, "Expense")}
      />,
    );
  }
  if (tx.categorization_vendor_id) {
    bits.push(
      <EntityLink
        key="vend"
        kind="vendor"
        id={tx.categorization_vendor_id}
        label={entityLabel(tx.categorization_vendor_name, tx.categorization_vendor_id, "Vendor")}
      />,
    );
  }
  if (bits.length > 0) {
    return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>{bits}</span>;
  }
  return (
    <Link
      to={`${BANKING_TAB_PATH.transactions}?txn_id=${encodeURIComponent(tx.id)}`}
      style={{ fontSize: 12, fontWeight: 600, color: V3.link, textDecoration: "none" }}
    >
      {linkCtaLabel(tx, accountIsRelay)}
    </Link>
  );
}

export function BankingHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const today = companyToday();
  const bounds = monthBoundsIso(today);
  const monthLabel = MONTH_SHORT[Number(today.slice(5, 7)) - 1] ?? "Month";

  const moneyMapQuery = useQuery({
    queryKey: ["banking", "money-map", companyId, bounds.start, today],
    queryFn: () => getMoneyMap(companyId, bounds.start, today),
    enabled: Boolean(companyId),
  });
  const tilesQuery = useQuery({
    queryKey: ["banking", "tiles", companyId, "home-board"],
    queryFn: () => getBankingTiles(companyId),
    enabled: Boolean(companyId),
  });
  const driftQuery = useQuery({
    queryKey: ["drift-alerts", companyId, "open"],
    queryFn: () => getDriftAlerts(companyId, false),
    enabled: Boolean(companyId),
  });
  const latestQuery = useQuery({
    queryKey: ["banking", "latest-lines", companyId],
    queryFn: () => getPlaidCompanyTransactions(companyId, { limit: 5, sort: "date_desc" }),
    enabled: Boolean(companyId),
  });

  const tileById = useMemo(() => {
    const m = new Map<string, BankingTile>();
    for (const t of tilesQuery.data?.tiles ?? []) m.set(t.id, t);
    return m;
  }, [tilesQuery.data?.tiles]);

  const relayIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tilesQuery.data?.tiles ?? []) {
      if (t.is_relay_wallet || t.system_purpose === "relay_fuel_wallet") s.add(t.id);
    }
    return s;
  }, [tilesQuery.data?.tiles]);

  const kpiSplit = useMemo(() => {
    const accounts = moneyMapQuery.data?.accounts ?? [];
    let opIn = 0;
    let opOut = 0;
    let opPending = 0;
    let relayPending = 0;
    for (const a of accounts) {
      const id = a.bank_account_id;
      const pending = Number(a.pending_review_count ?? 0);
      if (relayIds.has(id)) {
        relayPending += pending;
      } else {
        opIn += Number(a.in_cents ?? 0);
        opOut += Number(a.out_cents ?? 0);
        opPending += pending;
      }
    }
    return {
      opIn,
      opOut,
      opPending,
      relayPending,
      pendingTotal: opPending + relayPending,
    };
  }, [moneyMapQuery.data?.accounts, relayIds]);

  const accountRows = useMemo(() => {
    const mapAccounts = moneyMapQuery.data?.accounts ?? [];
    const mapById = new Map(mapAccounts.map((a) => [a.bank_account_id, a]));
    const tiles = tilesQuery.data?.tiles ?? [];
    const seen = new Set<string>();
    const rows: Array<{
      id: string;
      name: string;
      type: string;
      lines: number;
      feed: boolean;
      tile?: BankingTile;
    }> = [];

    // Real money-map accounts first (ordered by engine: lines desc)
    for (const a of mapAccounts) {
      seen.add(a.bank_account_id);
      const tile = tileById.get(a.bank_account_id);
      rows.push({
        id: a.bank_account_id,
        name: accountDisplayName(tile, a),
        type: accountTypeLabel(tile, a),
        lines: Number(a.line_count ?? 0),
        feed: hasFeed(tile, a),
        tile,
      });
    }
    // Virtual / other tiles not in money-map (Faro clearing, escrow, …)
    for (const t of tiles) {
      if (seen.has(t.id)) continue;
      rows.push({
        id: t.id,
        name: t.display_name,
        type: accountTypeLabel(t, mapById.get(t.id)),
        lines: Number(t.uncategorized_count ?? 0) > 0 ? 0 : 0,
        feed: hasFeed(t, mapById.get(t.id)),
        tile: t,
      });
    }
    return rows;
  }, [moneyMapQuery.data?.accounts, tilesQuery.data?.tiles, tileById]);

  const driftRows: DriftAlert[] = driftQuery.data?.rows ?? [];
  const driftCount = driftQuery.data?.total_count ?? driftRows.length;
  const latest = latestQuery.data?.transactions ?? [];

  const loadError =
    moneyMapQuery.isError || tilesQuery.isError || driftQuery.isError || latestQuery.isError;

  return (
    <div className="space-y-3" data-testid="banking-home-board" style={{ fontFamily: V3.font }}>
      {loadError ? (
        <ListErrorBanner
          message={userFacingApiError(
            moneyMapQuery.error ?? tilesQuery.error ?? driftQuery.error ?? latestQuery.error,
            "Failed to load Banking home",
          )}
          onRetry={() => {
            void moneyMapQuery.refetch();
            void tilesQuery.refetch();
            void driftQuery.refetch();
            void latestQuery.refetch();
          }}
        />
      ) : null}

      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-4"
        data-testid="banking-home-board-kpis"
        style={{ gap: 8 }}
      >
        <V3KpiTile
          label={`Money in · ${monthLabel}`}
          value={moneyMapQuery.isError ? "—" : formatUsdCents(kpiSplit.opIn)}
          sub="operating"
          tone="ink"
          testId="banking-kpi-money-in"
          onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?types=money_in`)}
        />
        <V3KpiTile
          label={`Money out · ${monthLabel}`}
          value={moneyMapQuery.isError ? "—" : formatUsdCents(kpiSplit.opOut)}
          sub="operating"
          tone="ink"
          testId="banking-kpi-money-out"
          onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?types=money_out`)}
        />
        <V3KpiTile
          label="Lines to review"
          value={moneyMapQuery.isError ? "—" : String(kpiSplit.pendingTotal)}
          sub={`${kpiSplit.opPending} operating · ${kpiSplit.relayPending} Relay`}
          tone={kpiSplit.pendingTotal > 0 ? "amber" : "green"}
          testId="banking-kpi-lines-to-review"
          onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`)}
        />
        <V3KpiTile
          label="Drift alerts"
          value={driftQuery.isError ? "—" : String(driftCount)}
          sub="bank vs book"
          tone={driftCount > 0 ? "red" : "ink"}
          testId="banking-kpi-drift-alerts"
          onClick={() => navigate(BANKING_TAB_PATH.reconciliation)}
        />
      </div>

      {/* Board: Accounts | Reconciliation drift side-by-side (1fr 1fr), then Latest lines full width. */}
      <div
        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        style={{ alignItems: "start" }}
        data-testid="banking-home-board-accounts-drift"
      >
        <BoardSection
          title="Accounts"
          onViewAll={() => navigate(BANKING_TAB_PATH.bank_accounts)}
          testId="banking-home-board-accounts"
        >
          <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Account</th>
                <th style={thStyle}>Type</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Lines</th>
                <th style={thStyle}>Feed</th>
              </tr>
            </thead>
            <tbody>
              {accountRows.length === 0 && !moneyMapQuery.isPending && !tilesQuery.isPending ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, color: V3.muted }}>
                    No bank accounts yet.
                  </td>
                </tr>
              ) : null}
              {accountRows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    {row.tile?.tile_kind === "virtual" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const path = virtualTilePath(row.tile);
                          navigate(path ?? `/banking/accounts/${row.id}`);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          color: V3.link,
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {row.name}
                      </button>
                    ) : (
                      <EntityLink kind="bank_account" id={row.id} label={row.name} />
                    )}
                  </td>
                  <td style={tdStyle}>{row.type}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.lines}
                  </td>
                  <td style={tdStyle}>
                    <FeedCell feed={row.feed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BoardSection>

        <BoardSection
          title="Reconciliation drift — bank vs book"
          onViewAll={() => navigate(BANKING_TAB_PATH.reconciliation)}
          headerRight={
            <button
              type="button"
              onClick={() => navigate(BANKING_TAB_PATH.reconciliation)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V3.link,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: V3.font,
              }}
            >
              Resolve
            </button>
          }
          footer={
            driftCount > 0
              ? `Bank $0.00 = no live balance feed for that account. ${driftCount} open alert${driftCount === 1 ? "" : "s"}.`
              : "No open drift alerts."
          }
          testId="banking-home-board-drift"
        >
          <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Account</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Bank</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Book</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Diff</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Days open</th>
              </tr>
            </thead>
            <tbody>
              {driftRows.length === 0 && !driftQuery.isPending ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, color: V3.muted }}>
                    No open reconciliation drift.
                  </td>
                </tr>
              ) : null}
              {driftRows.map((alert) => {
                const label =
                  [alert.institution_name, alert.account_name].filter(Boolean).join(" · ") ||
                  alert.account_name ||
                  "Account";
                const bank = Number(alert.bank_balance_cents);
                const book = Number(alert.book_balance_cents);
                const diff = Number(alert.drift_cents);
                return (
                  <tr key={alert.id} data-testid="banking-home-drift-row">
                    <td style={tdStyle}>
                      <EntityLink kind="bank_account" id={alert.bank_account_id} label={label} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <MoneyCell
                        cents={bank}
                        drill={{ entity: { kind: "bank_account", id: alert.bank_account_id } }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <MoneyCell
                        cents={book}
                        drill={{ entity: { kind: "bank_account", id: alert.bank_account_id } }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <MoneyCell
                        cents={diff}
                        drill={{ entity: { kind: "bank_account", id: alert.bank_account_id } }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {daysOpen(alert.detected_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </BoardSection>
      </div>

      <BoardSection
        title="Latest lines"
        onViewAll={() => navigate(BANKING_TAB_PATH.transactions)}
        footer="Nothing is matched automatically — a person links each line."
        testId="banking-home-board-latest"
      >
        <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Account</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th style={thStyle}>Linked to</th>
            </tr>
          </thead>
          <tbody>
            {latest.length === 0 && !latestQuery.isPending ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: V3.muted }}>
                  No bank lines yet.
                </td>
              </tr>
            ) : null}
            {latest.map((tx) => {
              const tile = tx.bank_account_id ? tileById.get(tx.bank_account_id) : undefined;
              const accountName =
                tile?.display_name ||
                tx.account_name ||
                tx.institution_name ||
                "Account";
              const isRelay = Boolean(
                (tx.bank_account_id && relayIds.has(tx.bank_account_id)) || tile?.is_relay_wallet,
              );
              const desc = (tx.merchant_name || tx.description || "—").trim() || "—";
              return (
                <tr key={tx.id} data-testid="banking-home-latest-row">
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {formatBoardMmDd(tx.transaction_date)}
                  </td>
                  <td style={tdStyle}>
                    <Link
                      to={`${BANKING_TAB_PATH.transactions}?txn_id=${encodeURIComponent(tx.id)}`}
                      style={{ color: V3.ink, textDecoration: "none", fontWeight: 500 }}
                    >
                      {desc}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    {tx.bank_account_id ? (
                      <EntityLink kind="bank_account" id={tx.bank_account_id} label={accountName} />
                    ) : (
                      accountName
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <MoneyCell
                      cents={Number(tx.amount_cents)}
                      format={(c) => formatSignedCentsClean(c, Boolean(tx.is_credit))}
                      drill={{ entity: { kind: "bank_transaction", id: tx.id } }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <LinkedToCell tx={tx} accountIsRelay={isRelay} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </BoardSection>
    </div>
  );
}
