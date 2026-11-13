/**
 * ROUND 443.267 / 443.280 board 3 — Banking Home (board-faithful, not shell).
 * Board: docs/design/v3/Banking.png (+ Banking.dc.html)
 * Sections (order): KPI strip → Accounts | Reconciliation drift (1fr 1fr) → Latest lines → Pending (scroll).
 * ACCT-F11100 (QuickBooks parity): Money in / Money out are CLEARED lines only; pending bank-feed lines are
 * listed in their own Pending section with a count and total and are never added into the tiles.
 * Engines: getMoneyMap · getBankingTiles · getDriftAlerts · getPlaidCompanyTransactions.
 * U30: Accounts / Drift / Latest use ParityTable so every header sorts asc/desc.
 */
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import {
  getBankingKpiList,
  getBankingTiles,
  getDriftAlerts,
  getMoneyMap,
  getPlaidCompanyTransactions,
  type BankingTile,
  type DriftAlert,
  type MoneyMapAccount,
  type MoneyMapPendingLine,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { companyToday, monthBoundsIso } from "../../../lib/businessDate";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatUsdCentsTable } from "../../../lib/money";
import { BANKING_TAB_PATH } from "../../../router/route-manifest";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatUsdCents } from "../../../utils/qboFormat";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type AccountBoardRow = {
  id: string;
  name: string;
  type: string;
  lines: number;
  feed: boolean;
  tile?: BankingTile;
};

type DriftBoardRow = DriftAlert & {
  account_label: string;
  bank_cents: number;
  book_cents: number;
  diff_cents: number;
  days_open: number;
};

function daysOpen(detectedAt: string): number {
  const ms = Date.now() - new Date(detectedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Board Latest lines Date column: "10/21" (MM/DD, no year). */
function formatBoardMmDd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const [, m, d] = day.split("-");
  if (!m || !d) return iso;
  return `${m}/${d}`;
}

/** Board Latest lines Amount: signed dollars without currency glyph (−150.00 / +2,000.00). */
function formatSignedCentsClean(cents: number, isCredit: boolean): string {
  // House grouping/decimals via formatUsdCentsTable; strip $ / accounting parens for board sign chrome.
  const body = formatUsdCentsTable(Math.abs(cents))
    .replace(/[()]/g, "")
    .replace(/^\$/, "")
    .replace(/^-/, "");
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
          // Board Feed / No feed: design-system tokens (V3.green / V3.slate), never a raw hex.
          background: feed ? V3.green : V3.slate,
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
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const today = companyToday();
  const bounds = monthBoundsIso(today);
  const monthLabel = MONTH_SHORT[Number(today.slice(5, 7)) - 1] ?? "Month";
  // ROUND 8.20 board 3 — Money In/Out = CLEARED posted lines (for_review + categorized), NOT categorized-only.
  // Codex FAIL: review=categorized emptied the cohort while money-map counts bank-cleared deposits still For review.
  const moneyInHref = withReturnContext(
    `${BANKING_TAB_PATH.transactions}?types=money_in&review=all&date_from=${bounds.start}&date_to=${today}`,
    originHref,
  );
  const moneyOutHref = withReturnContext(
    `${BANKING_TAB_PATH.transactions}?types=money_out&review=all&date_from=${bounds.start}&date_to=${today}`,
    originHref,
  );
  const reviewHref = withReturnContext(
    `${BANKING_TAB_PATH.transactions}?type=uncategorized&review=for_review`,
    originHref,
  );

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
  // Row 22 — Relay ingest heartbeat: hours since last successful relay_fuel_daily_pull pull.
  const relayKpiQuery = useQuery({
    queryKey: ["banking", "kpis", companyId],
    queryFn: () => getBankingKpiList(companyId),
    enabled: Boolean(companyId),
  });
  const relayHeartbeat = relayKpiQuery.data?.kpis?.find((k) => k.key === "relay_ingest_heartbeat") ?? null;
  const relayHoursAgo = relayHeartbeat?.value ?? null;
  const relayLabel = relayHeartbeat
    ? (relayHeartbeat.primary_label ?? (relayHoursAgo != null ? `${relayHoursAgo}h ago` : "Never"))
    : "—";

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

  const accountRows = useMemo((): AccountBoardRow[] => {
    const mapAccounts = moneyMapQuery.data?.accounts ?? [];
    const mapById = new Map(mapAccounts.map((a) => [a.bank_account_id, a]));
    const tiles = tilesQuery.data?.tiles ?? [];
    const seen = new Set<string>();
    const rows: AccountBoardRow[] = [];

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

  // ROW 222 (D046) — the drift account label resolves from the alert's own joined name first, then from the
  // accounts list THIS page already loaded (Accounts table rows, same bank_account_id), then the mask —
  // never the generic word "Account" for an alert that carries a bank_account_id.
  const accountNameById = useMemo(() => new Map(accountRows.map((r) => [r.id, r.name])), [accountRows]);
  const driftRows = useMemo((): DriftBoardRow[] => {
    return (driftQuery.data?.rows ?? []).map((alert) => {
      const ownName = alert.account_name || accountNameById.get(alert.bank_account_id) || null;
      const account_label =
        [alert.institution_name, ownName].filter(Boolean).join(" · ") ||
        (alert.account_mask ? `••${alert.account_mask}` : "") ||
        entityLabel(null, alert.bank_account_id, "Bank account");
      return {
        ...alert,
        account_label,
        bank_cents: Number(alert.bank_balance_cents),
        book_cents: Number(alert.book_balance_cents),
        diff_cents: Number(alert.drift_cents),
        days_open: daysOpen(alert.detected_at),
      };
    });
  }, [driftQuery.data?.rows, accountNameById]);

  const driftCount = driftQuery.data?.total_count ?? driftRows.length;
  const pendingLines: MoneyMapPendingLine[] = moneyMapQuery.data?.pending_lines ?? [];
  const pendingSummary = useMemo(() => {
    let inCents = 0;
    let outCents = 0;
    for (const p of pendingLines) {
      if (p.is_credit) inCents += Number(p.amount_cents);
      else outCents += Number(p.amount_cents);
    }
    return { count: pendingLines.length, inCents, outCents };
  }, [pendingLines]);
  const latest = latestQuery.data?.transactions ?? [];

  const accountColumns = useMemo((): Array<ParityColumn<AccountBoardRow>> => {
    return [
      {
        key: "name",
        label: "Account",
        sortable: true,
        sortValue: (row) => row.name,
        render: (row) =>
          row.tile?.tile_kind === "virtual" ? (
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
          ),
      },
      {
        key: "type",
        label: "Type",
        sortable: true,
        sortValue: (row) => row.type,
        render: (row) => row.type,
      },
      {
        key: "lines",
        label: "Lines",
        kind: "number",
        sortable: true,
        sortValue: (row) => row.lines,
        cellClass: "text-right tabular-nums",
        render: (row) => row.lines,
      },
      {
        key: "feed",
        label: "Feed",
        sortable: true,
        sortValue: (row) => (row.feed ? 1 : 0),
        render: (row) => <FeedCell feed={row.feed} />,
      },
    ];
  }, [navigate]);

  const driftColumns = useMemo((): Array<ParityColumn<DriftBoardRow>> => {
    return [
      {
        key: "account_label",
        label: "Account",
        sortable: true,
        sortValue: (row) => row.account_label,
        render: (row) => (
          <EntityLink kind="bank_account" id={row.bank_account_id} label={row.account_label} />
        ),
      },
      {
        key: "bank_cents",
        label: "Bank",
        kind: "money",
        sortable: true,
        minWidth: 120,
        sortValue: (row) => row.bank_cents,
        cellClass: "text-right",
        render: (row) => (
          <MoneyCell
            cents={row.bank_cents}
            drill={{ entity: { kind: "bank_account", id: row.bank_account_id } }}
          />
        ),
      },
      {
        key: "book_cents",
        label: "Book",
        kind: "money",
        sortable: true,
        minWidth: 120,
        sortValue: (row) => row.book_cents,
        cellClass: "text-right",
        render: (row) => (
          <MoneyCell
            cents={row.book_cents}
            drill={{ entity: { kind: "bank_account", id: row.bank_account_id } }}
          />
        ),
      },
      {
        key: "diff_cents",
        label: "Diff",
        kind: "money",
        sortable: true,
        minWidth: 120,
        sortValue: (row) => row.diff_cents,
        cellClass: "text-right",
        render: (row) => (
          <MoneyCell
            cents={row.diff_cents}
            drill={{ entity: { kind: "bank_account", id: row.bank_account_id } }}
          />
        ),
      },
      {
        key: "days_open",
        label: "Days open",
        kind: "number",
        sortable: true,
        sortValue: (row) => row.days_open,
        cellClass: "text-right tabular-nums",
        render: (row) => row.days_open,
      },
    ];
  }, []);

  const pendingColumns = useMemo((): Array<ParityColumn<MoneyMapPendingLine>> => {
    return [
      {
        key: "transaction_date",
        label: "Date",
        sortable: true,
        sortValue: (row) => row.transaction_date,
        render: (row) => <span style={{ whiteSpace: "nowrap" }}>{formatBoardMmDd(row.transaction_date)}</span>,
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        allowWrap: true,
        sortValue: (row) => (row.description ?? "").trim(),
        render: (row) => (row.description ?? "—").trim() || "—",
      },
      {
        key: "bank_account_id",
        label: "Account",
        sortable: true,
        sortValue: (row) => tileById.get(row.bank_account_id)?.display_name ?? "",
        render: (row) => (
          <EntityLink
            kind="bank_account"
            id={row.bank_account_id}
            label={tileById.get(row.bank_account_id)?.display_name ?? "Bank account"}
          />
        ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        kind: "money",
        sortable: true,
        sortValue: (row) => (row.is_credit ? Number(row.amount_cents) : -Number(row.amount_cents)),
        cellClass: "text-right",
        render: (row) => (
          <MoneyCell
            cents={Number(row.amount_cents)}
            format={(c) => formatSignedCentsClean(c, Boolean(row.is_credit))}
            drill={{ entity: { kind: "bank_transaction", id: row.bank_transaction_id } }}
          />
        ),
      },
    ];
  }, [tileById]);

  const latestColumns = useMemo((): Array<ParityColumn<PlaidBankTransaction>> => {
    return [
      {
        key: "transaction_date",
        label: "Date",
        sortable: true,
        sortValue: (tx) => tx.transaction_date,
        render: (tx) => (
          <span style={{ whiteSpace: "nowrap" }}>{formatBoardMmDd(tx.transaction_date)}</span>
        ),
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        sortValue: (tx) => (tx.merchant_name || tx.description || "").trim(),
        allowWrap: true,
        render: (tx) => {
          const desc = (tx.merchant_name || tx.description || "—").trim() || "—";
          return (
            <Link
              to={`${BANKING_TAB_PATH.transactions}?txn_id=${encodeURIComponent(tx.id)}`}
              style={{ color: V3.ink, textDecoration: "none", fontWeight: 500 }}
            >
              {desc}
            </Link>
          );
        },
      },
      {
        key: "account_name",
        label: "Account",
        sortable: true,
        sortValue: (tx) => {
          const tile = tx.bank_account_id ? tileById.get(tx.bank_account_id) : undefined;
          return tile?.display_name || tx.account_name || tx.institution_name || "";
        },
        render: (tx) => {
          const tile = tx.bank_account_id ? tileById.get(tx.bank_account_id) : undefined;
          const accountName =
            tile?.display_name || tx.account_name || tx.institution_name || "Account";
          return tx.bank_account_id ? (
            <EntityLink kind="bank_account" id={tx.bank_account_id} label={accountName} />
          ) : (
            accountName
          );
        },
      },
      {
        key: "amount_cents",
        label: "Amount",
        kind: "money",
        sortable: true,
        sortValue: (tx) => (tx.is_credit ? Number(tx.amount_cents) : -Number(tx.amount_cents)),
        cellClass: "text-right",
        render: (tx) => (
          <MoneyCell
            cents={Number(tx.amount_cents)}
            format={(c) => formatSignedCentsClean(c, Boolean(tx.is_credit))}
            drill={{ entity: { kind: "bank_transaction", id: tx.id } }}
          />
        ),
      },
      {
        key: "linked_to",
        label: "Linked to",
        sortable: false,
        allowWrap: true,
        render: (tx) => {
          const tile = tx.bank_account_id ? tileById.get(tx.bank_account_id) : undefined;
          const isRelay = Boolean(
            (tx.bank_account_id && relayIds.has(tx.bank_account_id)) || tile?.is_relay_wallet,
          );
          return <LinkedToCell tx={tx} accountIsRelay={isRelay} />;
        },
      },
    ];
  }, [tileById, relayIds]);

  const loadError =
    moneyMapQuery.isError || tilesQuery.isError || driftQuery.isError || latestQuery.isError;
  const relayTone = !relayKpiQuery.isError && relayHoursAgo != null && relayHoursAgo <= 24 ? "green" : "red";

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
        className="grid grid-cols-2 gap-2 md:grid-cols-5"
        data-testid="banking-home-board-kpis"
        style={{ gap: 8 }}
      >
        <V3KpiTile
          label={`Money in · ${monthLabel}`}
          value={moneyMapQuery.isError ? "—" : formatUsdCents(kpiSplit.opIn)}
          sub="operating · cleared"
          tone="ink"
          testId="banking-kpi-money-in"
          // ROUND 8.20 board 3 — month dates + money_in + review=all (cleared for_review∪categorized).
          href={moneyInHref}
        />
        <V3KpiTile
          label={`Money out · ${monthLabel}`}
          value={moneyMapQuery.isError ? "—" : formatUsdCents(kpiSplit.opOut)}
          sub="operating · cleared"
          tone="ink"
          testId="banking-kpi-money-out"
          href={moneyOutHref}
        />
        <V3KpiTile
          label="Lines to review"
          value={moneyMapQuery.isError ? "—" : String(kpiSplit.pendingTotal)}
          sub={`${kpiSplit.opPending} operating · ${kpiSplit.relayPending} Relay`}
          tone={kpiSplit.pendingTotal > 0 ? "amber" : "green"}
          testId="banking-kpi-lines-to-review"
          href={reviewHref}
        />
        <V3KpiTile
          label="Drift alerts"
          value={driftQuery.isError ? "—" : String(driftCount)}
          sub="bank vs book"
          tone={driftCount > 0 ? "red" : "ink"}
          testId="banking-kpi-drift-alerts"
          href={BANKING_TAB_PATH.reconciliation}
        />
        {/* Row 22 — Relay ingest heartbeat tile: green ≤24h, red >24h or never. */}
        <V3KpiTile
          label={"RELAY FEED"}
          value={relayKpiQuery.isError ? "—" : relayLabel}
          sub="last pull · fuel cards"
          tone={relayKpiQuery.isError ? "red" : relayTone}
          testId="banking-kpi-relay-feed"
          href="/banking/relay-card"
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
          <ParityTable<AccountBoardRow>
            embedded
            appearance="board"
            rows={accountRows}
            rowKey={(row) => row.id}
            columns={accountColumns}
            loading={moneyMapQuery.isPending || tilesQuery.isPending}
            emptyText="No bank accounts yet."
            storageKey="banking-home-accounts"
            tableTestId="banking-home-accounts-table"
            suppressToolbarSearch
            suppressToolbarRange
            hidePager
            initialPageSize={50}
          />
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
          <ParityTable<DriftBoardRow>
            embedded
            appearance="board"
            rows={driftRows}
            rowKey={(row) => row.id}
            columns={driftColumns}
            loading={driftQuery.isPending}
            emptyText="No open reconciliation drift."
            storageKey="banking-home-drift"
            tableTestId="banking-home-drift-table"
            rowTestId={() => "banking-home-drift-row"}
            suppressToolbarSearch
            suppressToolbarRange
            hidePager
            initialPageSize={50}
          />
        </BoardSection>
      </div>

      {/* ROUND 8.5 B2 — board order: Accounts | Drift → Latest lines immediately below.
          Pending stays fully reachable (all rows) in a bounded scroll region after Latest. */}
      <BoardSection
        title="Latest lines"
        onViewAll={() => navigate(BANKING_TAB_PATH.transactions)}
        footer="Nothing is matched automatically — a person links each line."
        testId="banking-home-board-latest"
      >
        <ParityTable<PlaidBankTransaction>
          embedded
          appearance="board"
          rows={latest}
          rowKey={(row) => row.id}
          columns={latestColumns}
          loading={latestQuery.isPending}
          emptyText="No bank lines yet."
          storageKey="banking-home-latest"
          tableTestId="banking-home-latest-table"
          rowTestId={() => "banking-home-latest-row"}
          suppressToolbarSearch
          suppressToolbarRange
          hidePager
          initialPageSize={10}
        />
      </BoardSection>

      <BoardSection
        title={`Pending · ${pendingSummary.count}`}
        headerRight={
          <span style={{ fontSize: 11, color: V3.ink, fontFamily: V3.font }} data-testid="banking-home-pending-total">
            {`out ${formatUsdCents(pendingSummary.outCents)} · in ${formatUsdCents(pendingSummary.inCents)}`}
          </span>
        }
        footer="Pending bank-feed lines are not counted in Money in / Money out. When the bank posts a line, the posted line replaces it."
        testId="banking-home-board-pending"
      >
        <div style={{ maxHeight: 280, overflowY: "auto" }} data-testid="banking-home-pending-scroll">
          <ParityTable<MoneyMapPendingLine>
            embedded
            appearance="board"
            rows={pendingLines}
            rowKey={(row) => row.bank_transaction_id}
            columns={pendingColumns}
            loading={moneyMapQuery.isPending}
            emptyText="No pending bank lines."
            storageKey="banking-home-pending"
            tableTestId="banking-home-pending-table"
            rowTestId={() => "banking-home-pending-row"}
            suppressToolbarSearch
            suppressToolbarRange
            hidePager
            initialPageSize={50}
          />
        </div>
      </BoardSection>
    </div>
  );
}
