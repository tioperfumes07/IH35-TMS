/**
 * ROUND 443.267 board 8 — Trial balance viewer (board-faithful).
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Reports-Viewer-TrialBalance.dc.html
 * Sections (order): KPI strip → N accounts panel (table, no footer row) → Measured A/R note.
 * ROUND 443.280 row 41: grand-total KPI tiles drill to the ledger; the Measured note is a live ReactNode
 * (GL 1100 net vs the A/R invoice list) built by TrialBalancePage — nothing hardcoded.
 * Engines stay on TrialBalancePage (getTrialBalanceReport · AmountLink · ParityTable · export/print).
 * 443.282: Measured callout uses live account 1100 from this TB — no hardcoded A/R dollars (443.248).
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3 } from "../../../design/v3-tokens";
import { formatUsdCents } from "../../../lib/money";

export type TrialBalanceBoardSummary = {
  grand_total_debits: number;
  grand_total_credits: number;
  balanced: boolean;
};

const chromeBtn: CSSProperties = {
  height: 28,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 2,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: V3.font,
  background: V3.surface,
  color: V3.ink,
  border: `1px solid ${V3.border}`,
  cursor: "pointer",
};

function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

/** Live 1100 note for Measured callout — no static dollar invent (443.248 / 443.282). */
export function trialBalanceMeasuredArNote(arNetCents: number | null | undefined): string {
  if (arNetCents == null) {
    return "Account 1100 (A/R) is not on this trial balance for the selected period — reconcile the subledger before trusting any AR report (assigned 443.248).";
  }
  return `Account 1100 (A/R) nets ${formatUsdCents(arNetCents)} on this trial balance — reconcile the invoice subledger before trusting any AR report (assigned 443.248).`;
}

export function TrialBalanceBoard({
  summary,
  accountCount,
  loading,
  onCustomize,
  measuredArNote,
  onTotalsDrill,
  children,
}: {
  summary: TrialBalanceBoardSummary | null | undefined;
  accountCount: number;
  loading?: boolean;
  onCustomize?: () => void;
  /** Live 1100 note from TrialBalancePage — never a hardcoded dollar string. */
  measuredArNote?: ReactNode;
  /** Opens the ledger lines behind the grand totals; omitted when no list sums to them (e.g. cash basis). */
  onTotalsDrill?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="trial-balance-board">
      {summary ? (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 8 }}
          data-testid="trial-balance-kpi-strip"
        >
          <V3KpiTile
            label="Grand total debits"
            value={money(summary.grand_total_debits)}
            onClick={onTotalsDrill}
            testId="trial-balance-kpi-debits"
          />
          <V3KpiTile
            label="Grand total credits"
            value={money(summary.grand_total_credits)}
            onClick={onTotalsDrill}
            testId="trial-balance-kpi-credits"
          />
          <V3KpiTile
            label="Balance check"
            value={summary.balanced ? "Balanced" : "Out of balance"}
            tone={summary.balanced ? "green" : "red"}
            sub="debits = credits"
            testId="trial-balance-kpi-balance"
          />
        </div>
      ) : loading ? (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 8 }}
          data-testid="trial-balance-kpi-strip"
        >
          <V3KpiTile label="Grand total debits" value="…" testId="trial-balance-kpi-debits" />
          <V3KpiTile label="Grand total credits" value="…" testId="trial-balance-kpi-credits" />
          <V3KpiTile label="Balance check" value="…" sub="debits = credits" testId="trial-balance-kpi-balance" />
        </div>
      ) : null}

      <V3Panel
        title={`${accountCount} account${accountCount === 1 ? "" : "s"}`}
        testId="trial-balance-accounts-panel"
        headerRight={
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              style={chromeBtn}
              onClick={() => setCollapsed((c) => !c)}
              data-testid="trial-balance-collapse"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
            <button
              type="button"
              style={chromeBtn}
              onClick={() => onCustomize?.()}
              data-testid="trial-balance-customize"
            >
              Customize
            </button>
          </span>
        }
        onViewAll={
          collapsed
            ? () => setCollapsed(false)
            : () => {
                document
                  .querySelector('[data-testid="trial-balance-accounts-panel"]')
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
        }
        footer="Each account opens its general-ledger lines; each line opens its source document."
      >
        {collapsed ? (
          <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: V3.muted }}>
            Table collapsed — Expand or View all to show accounts.
          </p>
        ) : (
          children
        )}
      </V3Panel>

      {measuredArNote ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: V3.surface,
            border: `1px solid ${V3.border}`,
            borderLeft: `3px solid ${V3.amber}`,
            borderRadius: 2,
            padding: "8px 12px",
            fontSize: 12,
            color: V3.ink,
            fontFamily: V3.font,
          }}
          data-testid="trial-balance-measured-ar"
        >
          <b style={{ color: V3.amber, whiteSpace: "nowrap" }}>Measured</b>
          <span>{measuredArNote}</span>
        </div>
      ) : null}
    </div>
  );
}
