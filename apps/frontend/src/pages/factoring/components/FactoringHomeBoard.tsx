/**
 * ROUND 443.267 / 443.282 — Factoring Home (board-exact, V3Panel off on main sections).
 * Board: docs/design/v3/Factoring.dc.html
 * Sections (order): KPI strip → Each purchase (net vs kept) + Terms on file → Measured note.
 * Engines: getFactoringSummary · getFactoringChargebacksFees · getFactoringRecoursePipeline ·
 *          listFactoringPurchases · listFactors.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getFactoringChargebacksFees,
  getFactoringRecoursePipeline,
  getFactoringSummary,
  listFactors,
  type Factor,
} from "../../../api/factoring";
import { listFactoringPurchases, type FactoringPurchaseListRow } from "../../../api/factoring-purchases";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { companyToday, monthBoundsIso } from "../../../lib/businessDate";
import { rateToPctString } from "../../../lib/factorProfile";
import { userFacingApiError } from "../../../lib/api-error-message";
import { FACTORING_TAB_PATH } from "../../../router/route-manifest";
import { formatUsdCents } from "../../../utils/qboFormat";

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

/** Board card chrome (Factoring.dc.html) — not V3Panel (443.282 panels off). */
const BOARD_CARD_BORDER = "#DDE1E7";

function FactoringBoardCard({
  title,
  testId,
  onViewAll,
  headerRight,
  children,
  footer,
}: {
  title: string;
  testId: string;
  onViewAll?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        background: V3.surface,
        border: `1px solid ${BOARD_CARD_BORDER}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        fontFamily: V3.font,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid #ECEEF2",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.ink }}>{title}</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {headerRight}
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
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
              View all →
            </button>
          ) : null}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
      {footer != null ? footer : null}
    </section>
  );
}

const measuredNoteStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: "8px 12px",
  fontSize: 12,
  color: V3.ink,
  background: V3.surface,
  border: `1px solid ${BOARD_CARD_BORDER}`,
  borderLeft: "3px solid #B45309",
  borderRadius: 6,
};

function cents(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

function fmtMoneyDollars(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function mmDd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = String(iso).slice(0, 10);
  const [, m, d] = day.split("-");
  if (!m || !d) return day;
  return `${m}-${d}`;
}

/** Mode of posted wire fees (cents) — board Terms "Wire fee" when profile has no column. */
function modeWireFeeCents(purchases: FactoringPurchaseListRow[]): number | null {
  const counts = new Map<number, number>();
  for (const p of purchases) {
    const w = cents(p.wire_fee_cents);
    if (w <= 0) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [fee, n] of counts) {
    if (n > bestN) {
      best = fee;
      bestN = n;
    }
  }
  return best;
}

function PurchaseNetChart({ purchases }: { purchases: FactoringPurchaseListRow[] }) {
  const bars = useMemo(() => {
    const rows = [...purchases]
      .filter((p) => p.status === "posted")
      .sort((a, b) => String(a.wire_date ?? a.purchase_date).localeCompare(String(b.wire_date ?? b.purchase_date)))
      .slice(-16);
    return rows.map((p) => {
      const net = cents(p.net_to_company_cents);
      const kept =
        cents(p.fee_cents) + cents(p.escrow_reserve_cents) + cents(p.cash_reserve_cents) + cents(p.wire_fee_cents);
      return {
        id: p.id,
        label: mmDd(p.wire_date ?? p.purchase_date),
        net,
        kept,
        total: net + kept,
      };
    });
  }, [purchases]);

  const max = Math.max(1, ...bars.map((b) => b.total));
  const chartH = 160;

  if (bars.length === 0) {
    return (
      <div style={{ padding: "24px 12px", fontSize: 12, color: V3.muted }} data-testid="factoring-home-purchase-chart-empty">
        No posted purchases in range.
      </div>
    );
  }

  return (
    <div data-testid="factoring-home-purchase-chart" style={{ padding: "8px 4px 4px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: chartH, borderBottom: `1px solid ${V3.border}` }}>
        {bars.map((b) => {
          const netH = Math.max(2, Math.round((b.net / max) * (chartH - 24)));
          const keptH = Math.max(b.kept > 0 ? 2 : 0, Math.round((b.kept / max) * (chartH - 24)));
          return (
            <div
              key={b.id}
              title={`${b.label}: net ${formatUsdCents(b.net)} · kept ${formatUsdCents(b.kept)}`}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 0 }}
            >
              <div style={{ width: "70%", maxWidth: 28, display: "flex", flexDirection: "column-reverse" }}>
                <div style={{ height: netH, background: V3.shell, borderRadius: "2px 2px 0 0" }} />
                {keptH > 0 ? (
                  <div style={{ height: keptH, background: V3.red, borderRadius: "2px 2px 0 0", marginBottom: 1, opacity: 0.7 }} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {bars.map((b) => (
          <div key={`lbl-${b.id}`} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, color: V3.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {b.label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: V3.muted }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: V3.shell, borderRadius: 1 }} />
          net to bank
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: V3.red, borderRadius: 1, opacity: 0.7 }} />
          fee + reserve + wire
        </span>
      </div>
    </div>
  );
}

export function FactoringHomeBoard({
  companyId,
  onEditTerms,
}: {
  companyId: string;
  onEditTerms?: () => void;
}) {
  const navigate = useNavigate();
  const today = companyToday();
  const bounds = monthBoundsIso(today);

  const summaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId, "home-board"],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });
  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", companyId, "home-board"],
    queryFn: () => listFactors(companyId).then((r) => r.factors),
    enabled: Boolean(companyId),
  });
  const recourseQuery = useQuery({
    queryKey: ["factoring", "recourse", companyId, "home-board"],
    queryFn: () => getFactoringRecoursePipeline(companyId, 500),
    enabled: Boolean(companyId),
  });
  const feesQuery = useQuery({
    queryKey: ["factoring", "chargebacks-fees", companyId, "home-board"],
    queryFn: () => getFactoringChargebacksFees(companyId),
    enabled: Boolean(companyId),
  });
  const purchasesQuery = useQuery({
    queryKey: ["factoring", "purchases", "mtd", companyId, bounds.start, today],
    queryFn: () =>
      listFactoringPurchases(companyId, {
        status: "posted",
        from: bounds.start,
        to: today,
      }),
    enabled: Boolean(companyId),
  });
  // Chart uses a wider posted window (board shows Aug–Sep purchase days), still one engine.
  const chartPurchasesQuery = useQuery({
    queryKey: ["factoring", "purchases", "chart", companyId],
    queryFn: () => listFactoringPurchases(companyId, { status: "posted" }),
    enabled: Boolean(companyId),
  });

  const summary = summaryQuery.data;
  const activeFactor: Factor | undefined = useMemo(() => {
    const factors = factorsQuery.data ?? [];
    const profileId = summary?.active_factor_profile_id;
    if (profileId) {
      const hit = factors.find((f) => f.id === profileId);
      if (hit) return hit;
    }
    return factors.find((f) => f.active) ?? factors[0];
  }, [factorsQuery.data, summary?.active_factor_profile_id]);

  const mtdPurchases = purchasesQuery.data?.purchases ?? [];
  const mtdFeeCents = useMemo(() => mtdPurchases.reduce((s, p) => s + cents(p.fee_cents), 0), [mtdPurchases]);
  const mtdWireFeeCents = useMemo(() => mtdPurchases.reduce((s, p) => s + cents(p.wire_fee_cents), 0), [mtdPurchases]);
  const mtdAdvancedCents = useMemo(() => {
    // summary.mtd_advanced_total is dollars (views.factoring_summary); purchases advance_cents is cents.
    if (summary && !summaryQuery.isError && summary.mtd_advanced_total != null) {
      return Math.round(Number(summary.mtd_advanced_total) * 100);
    }
    return mtdPurchases.reduce((s, p) => s + cents(p.advance_cents), 0);
  }, [summary, summaryQuery.isError, mtdPurchases]);

  const trueCostPct = useMemo(() => {
    if (mtdAdvancedCents <= 0) return null;
    return ((mtdFeeCents + mtdWireFeeCents) / mtdAdvancedCents) * 100;
  }, [mtdAdvancedCents, mtdFeeCents, mtdWireFeeCents]);

  const chargebacksFees = useMemo(() => {
    const monthly = feesQuery.data?.monthly_summary?.[0];
    if (monthly) {
      return Number(monthly.chargeback_total ?? 0) + Number(monthly.factor_fee_total ?? 0);
    }
    return (feesQuery.data?.history ?? []).reduce(
      (s, h) => s + Number(h.chargeback_amount ?? 0) + Number(h.factor_fee_amount ?? 0),
      0,
    );
  }, [feesQuery.data]);

  const invoiceCount = recourseQuery.data?.total ?? recourseQuery.data?.invoices?.length ?? 0;
  const wiresCount = summaryQuery.isError ? null : Number(summary?.mtd_advances_count ?? mtdPurchases.length);
  const wireFeeTermCents = modeWireFeeCents(mtdPurchases.length ? mtdPurchases : chartPurchasesQuery.data?.purchases ?? []);

  const loadError =
    summaryQuery.isError ||
    factorsQuery.isError ||
    recourseQuery.isError ||
    feesQuery.isError ||
    purchasesQuery.isError ||
    chartPurchasesQuery.isError;

  const unclearedCents = Number(summary?.uncleared_cents ?? 0);
  const unclearedWireCount = summary?.uncleared_documents?.length ?? wiresCount ?? 0;

  const termsRows: Array<{ term: string; value: string }> = [
    { term: "Advance", value: activeFactor ? `${rateToPctString(activeFactor.advance_rate)}%` : "—" },
    { term: "Escrow reserve", value: activeFactor ? `${rateToPctString(activeFactor.reserve_rate)}%` : "—" },
    { term: "Cash reserve", value: activeFactor ? `${rateToPctString(activeFactor.cash_reserve_rate ?? 0)}%` : "—" },
    { term: "Fee", value: activeFactor ? `${rateToPctString(activeFactor.fee_rate)}%` : "—" },
    {
      term: "Recourse",
      value: activeFactor ? `${activeFactor.recourse_days} days` : summary?.recourse_days != null ? `${summary.recourse_days} days` : "—",
    },
    {
      term: "Wire fee",
      value: wireFeeTermCents != null ? formatUsdCents(wireFeeTermCents) : "—",
    },
  ];

  return (
    <div className="space-y-3" data-testid="factoring-home-board" style={{ fontFamily: V3.font }}>
      {loadError ? (
        <ListErrorBanner
          message={userFacingApiError(
            summaryQuery.error ??
              factorsQuery.error ??
              recourseQuery.error ??
              feesQuery.error ??
              purchasesQuery.error ??
              chartPurchasesQuery.error,
            "Failed to load Factoring home",
          )}
          onRetry={() => {
            void summaryQuery.refetch();
            void factorsQuery.refetch();
            void recourseQuery.refetch();
            void feesQuery.refetch();
            void purchasesQuery.refetch();
            void chartPurchasesQuery.refetch();
          }}
        />
      ) : null}

      {/* Board KPI strip — full width (supersedes FAC-07 side-by-side profile). Keep legacy test ids. */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        data-testid="factoring-home-kpi-row"
        style={{ gap: 8 }}
      >
        <V3KpiTile
          testId="factoring-kpi-outstanding-liability"
          label="Outstanding liability"
          value={summaryQuery.isError ? "—" : fmtMoneyDollars(summary?.outstanding_liability_balance)}
          sub={recourseQuery.isError ? "—" : `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}`}
          onClick={() => navigate(FACTORING_TAB_PATH.recourse_pipeline)}
        />
        <V3KpiTile
          testId="factoring-kpi-advanced-mtd"
          label="Advanced MTD"
          value={summaryQuery.isError ? "—" : fmtMoneyDollars(summary?.mtd_advanced_total)}
          sub={wiresCount == null ? "—" : `${wiresCount} wire${wiresCount === 1 ? "" : "s"}`}
          onClick={() => navigate(FACTORING_TAB_PATH.payments_to_you)}
        />
        <V3KpiTile
          testId="factoring-kpi-recourse-days"
          label="Repurchase deadline"
          value={summaryQuery.isError ? "—" : `${Number(summary?.recourse_days ?? 95)} days`}
          onClick={() => navigate(FACTORING_TAB_PATH.recourse_pipeline)}
        />
        <V3KpiTile
          testId="factoring-kpi-chargebacks"
          label="Chargebacks & fees"
          value={feesQuery.isError ? "—" : fmtMoneyDollars(chargebacksFees)}
          onClick={() => navigate(FACTORING_TAB_PATH.chargebacks_fees)}
        />
        <V3KpiTile
          testId="factoring-kpi-true-cost"
          label="True cost"
          value={
            summaryQuery.isError || purchasesQuery.isError
              ? "—"
              : trueCostPct == null
                ? "—"
                : `${trueCostPct.toFixed(2)}%`
          }
          sub={
            summaryQuery.isError || purchasesQuery.isError
              ? "—"
              : `fee ${formatUsdCents(mtdFeeCents)} + wires ${formatUsdCents(mtdWireFeeCents)}`
          }
          onClick={() => navigate(FACTORING_TAB_PATH.purchase_report)}
        />
      </div>

      {/* Honest label retained for readers/guards that still name Outstanding Liability Balance. */}
      <div className="sr-only" data-testid="factoring-home-liability-cleared">
        Outstanding Liability Balance cleared{" "}
        {summaryQuery.isError ? "—" : fmtMoneyDollars((summary?.cleared_open_cents ?? 0) / 100)}.
      </div>

      <div
        className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]"
        style={{ alignItems: "start" }}
        data-testid="factoring-home-board-main"
      >
        <FactoringBoardCard
          title="Each purchase — net to bank vs kept by Faro"
          onViewAll={() => navigate(FACTORING_TAB_PATH.purchase_report)}
          testId="factoring-home-purchase-panel"
        >
          {chartPurchasesQuery.isError ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: V3.muted }}>Could not load purchases.</div>
          ) : (
            <div style={{ padding: "12px 14px" }}>
              <PurchaseNetChart purchases={chartPurchasesQuery.data?.purchases ?? []} />
            </div>
          )}
        </FactoringBoardCard>

        <FactoringBoardCard
          title="Terms on file"
          onViewAll={() => navigate(FACTORING_TAB_PATH.statements_settings)}
          headerRight={
            onEditTerms ? (
              <button
                type="button"
                onClick={onEditTerms}
                style={{ fontSize: 11, fontWeight: 600, color: V3.link, background: "none", border: 0, cursor: "pointer", padding: 0 }}
                data-testid="factoring-home-terms-edit"
              >
                Edit
              </button>
            ) : undefined
          }
          testId="factoring-home-terms-panel"
          footer={
            activeFactor ? (
              <div style={{ padding: "8px 14px", fontSize: 11, color: V3.muted, borderTop: "1px solid #ECEEF2" }}>
                {summary?.active_factor_id ? (
                  <EntityLink kind="vendor" id={summary.active_factor_id} label={activeFactor.name} />
                ) : (
                  activeFactor.name
                )}
              </div>
            ) : (
              <div style={{ padding: "8px 14px", fontSize: 12, color: V3.muted }} data-testid="factoring-profile-empty">
                No factor configured. Activate a factor to manage its profile.
              </div>
            )
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse" }} data-testid="factoring-home-terms-table">
              <thead>
                <tr>
                  <th style={thStyle}>Term</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {termsRows.map((row) => (
                  <tr key={row.term}>
                    <td style={tdStyle}>{row.term}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FactoringBoardCard>
      </div>

      {!summaryQuery.isError && (unclearedCents > 0 || (summary?.uncleared_documents?.length ?? 0) > 0) ? (
        <div style={measuredNoteStyle} data-testid="factoring-home-measured-note">
          <b style={{ color: "#B45309", whiteSpace: "nowrap" }}>Measured</b>
          <span>
            {unclearedWireCount} wire{unclearedWireCount === 1 ? "" : "s"} · {formatUsdCents(unclearedCents)}{" "}
            &quot;not cleared&quot;: the advances are not linked to their bank deposits in Banking yet.
          </span>
        </div>
      ) : !summaryQuery.isError && summary ? (
        <div style={measuredNoteStyle} data-testid="factoring-home-measured-note">
          <b style={{ color: "#B45309", whiteSpace: "nowrap" }}>Measured</b>
          <span>
            {Number(summary.mtd_advances_count ?? 0)} wire
            {Number(summary.mtd_advances_count ?? 0) === 1 ? "" : "s"} · {fmtMoneyDollars(summary.mtd_advanced_total)}{" "}
            &quot;not cleared&quot;: the advances are not linked to their bank deposits in Banking yet.
          </span>
        </div>
      ) : null}
    </div>
  );
}
