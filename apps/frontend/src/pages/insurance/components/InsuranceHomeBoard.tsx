/**
 * ROUND 443.267 board 5 — Insurance Landing (board-faithful).
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Insurance.dc.html
 * Sections (order): KPI strip → Policy year + Premium by coverage → Fleet Covered note.
 * Engines: getInsuranceSummary · listInsurancePolicies · listInsuranceTypeCatalog.
 */
import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  getInsuranceSummary,
  listInsurancePolicies,
  listInsuranceTypeCatalog,
  type InsurancePolicy,
} from "../../../api/insurance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { companyToday } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";
import { insuranceTypeLabel } from "../../../lib/insurance-type-label";
import { userFacingApiError } from "../../../lib/api-error-message";
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

function dayMs(iso: string): number {
  const d = String(iso).slice(0, 10);
  return Date.parse(`${d}T12:00:00`);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = dayMs(fromIso);
  const b = dayMs(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function daysUntilExpiry(expiryIso: string, todayIso: string): number {
  return daysBetween(todayIso, expiryIso);
}

type PremiumShareRow = {
  coverage: string;
  carrier: string;
  premiumCents: number;
  share: number;
  policyId: string | null;
  vendorId: string | null;
};

export function InsuranceHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const today = companyToday();

  const summaryQuery = useQuery({
    queryKey: ["insurance", "landing", "summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceSummary(companyId).then((result) => result.summary),
  });

  const policiesQuery = useQuery({
    queryKey: ["insurance", "landing", "policies-active", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      listInsurancePolicies({ operating_company_id: companyId, status: "active" }).then((r) => r.policies),
  });

  const typesQuery = useQuery({
    queryKey: ["insurance", "landing", "type-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: companyId }).then((r) => r.types),
  });

  const activePolicies = useMemo(() => {
    const rows = policiesQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const pa = Number(a.total_premium_cents ?? 0);
      const pb = Number(b.total_premium_cents ?? 0);
      return pb - pa;
    });
  }, [policiesQuery.data]);

  const typeName = (p: InsurancePolicy) =>
    insuranceTypeLabel(
      p.coverage_type,
      p.coverage_type_name ?? typesQuery.data?.find((t) => t.code === p.coverage_type)?.name
    );

  const annualPremiumCents = useMemo(
    () => activePolicies.reduce((sum, p) => sum + Number(p.total_premium_cents ?? 0), 0),
    [activePolicies]
  );

  const renewal = useMemo(() => {
    if (activePolicies.length === 0) return null;
    let soonest: InsurancePolicy | null = null;
    for (const p of activePolicies) {
      if (!p.expiry_date) continue;
      if (!soonest || dayMs(p.expiry_date) < dayMs(soonest.expiry_date)) soonest = p;
    }
    if (!soonest?.expiry_date) return null;
    const days = daysUntilExpiry(soonest.expiry_date, today);
    return { date: soonest.expiry_date, days };
  }, [activePolicies, today]);

  const yearWindow = useMemo(() => {
    if (activePolicies.length === 0) return null;
    let start = activePolicies[0]!.effective_date;
    let end = activePolicies[0]!.expiry_date;
    for (const p of activePolicies) {
      if (p.effective_date && dayMs(p.effective_date) < dayMs(start)) start = p.effective_date;
      if (p.expiry_date && dayMs(p.expiry_date) > dayMs(end)) end = p.expiry_date;
    }
    const span = Math.max(1, daysBetween(start, end));
    const dayOfYear = Math.min(span, Math.max(0, daysBetween(start, today)));
    return { start, end, span, dayOfYear };
  }, [activePolicies, today]);

  const premiumRows: PremiumShareRow[] = useMemo(() => {
    const total = annualPremiumCents || 1;
    return activePolicies.map((p) => {
      const cents = Number(p.total_premium_cents ?? 0);
      return {
        coverage: typeName(p),
        carrier: (p.insurer_name ?? "").trim() || "—",
        premiumCents: cents,
        share: (cents / total) * 100,
        policyId: p.id,
        vendorId: p.vendor_id || null,
      };
    });
  }, [activePolicies, annualPremiumCents, typesQuery.data]);

  const summary = summaryQuery.data;
  const loading = summaryQuery.isLoading || policiesQuery.isLoading;
  const errored = summaryQuery.isError || policiesQuery.isError;
  const errorMsg = summaryQuery.isError
    ? userFacingApiError(summaryQuery.error, "Failed to load insurance summary.")
    : policiesQuery.isError
      ? userFacingApiError(policiesQuery.error, "Failed to load insurance policies.")
      : null;

  const activeCount =
    typeof summary?.total_active_policies === "number"
      ? summary.total_active_policies
      : policiesQuery.isSuccess
        ? activePolicies.length
        : null;
  const openClaims = typeof summary?.open_claims === "number" ? summary.open_claims : null;
  const gapCount = typeof summary?.coverage_gap_count === "number" ? summary.coverage_gap_count : null;

  const dash = (v: string | number | null | undefined) =>
    v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);

  return (
    <div className="min-w-0 space-y-3" data-testid="insurance-home-board" data-insurance-home-board="1">
      {errored ? (
        <ListErrorBanner
          message={errorMsg ?? "Failed to load insurance dashboard."}
          onRetry={() => {
            void summaryQuery.refetch();
            void policiesQuery.refetch();
          }}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
        }}
        data-testid="insurance-home-kpi-strip"
      >
        <V3KpiTile
          testId="insurance-kpi-active-policies"
          label="Active policies"
          value={loading && activeCount == null ? "…" : dash(activeCount)}
          onClick={() => navigate("/insurance/policies")}
        />
        <V3KpiTile
          testId="insurance-kpi-annual-premium"
          label="Annual premium"
          value={
            loading && !policiesQuery.isSuccess
              ? "…"
              : policiesQuery.isSuccess
                ? formatUsdCents(annualPremiumCents)
                : "—"
          }
          onClick={() => navigate("/insurance/policies")}
        />
        <V3KpiTile
          testId="insurance-kpi-renewal"
          label="Renewal"
          value={
            loading && !renewal
              ? "…"
              : renewal
                ? formatDateUS(renewal.date) || "—"
                : "—"
          }
          sub={renewal ? `${renewal.days} days` : undefined}
          onClick={() => navigate("/insurance/policies")}
        />
        <V3KpiTile
          testId="insurance-kpi-open-claims"
          label="Open claims"
          value={loading && openClaims == null ? "…" : dash(openClaims)}
          onClick={() => navigate("/insurance/claims")}
        />
        <V3KpiTile
          testId="insurance-kpi-coverage-gaps"
          label="Coverage gaps"
          value={loading && gapCount == null ? "…" : dash(gapCount)}
          sub="units without a policy"
          tone={gapCount != null && gapCount > 0 ? "red" : "ink"}
          onClick={() => navigate("/insurance/coverage-gaps")}
        />
      </div>

      <div
        className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start"
        data-testid="insurance-home-main-grid"
      >
        <V3Panel
          title="Policy year"
          onViewAll={() => navigate("/insurance/policies")}
          testId="insurance-home-policy-year"
        >
          {yearWindow ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: V3.muted,
                  fontFamily: V3.font,
                }}
              >
                <span>{formatDateUS(yearWindow.start) || "—"}</span>
                <span>{formatDateUS(yearWindow.end) || "—"}</span>
              </div>
              {activePolicies.map((p) => {
                const span = Math.max(1, yearWindow.span);
                const leftDays = Math.max(0, daysBetween(yearWindow.start, p.effective_date));
                const widthDays = Math.max(1, daysBetween(p.effective_date, p.expiry_date));
                const leftPct = Math.max(0, Math.min(100, (leftDays / span) * 100));
                const widthPct = Math.max(2, Math.min(100 - leftPct, (widthDays / span) * 100));
                const todayPct = Math.max(0, Math.min(100, (yearWindow.dayOfYear / span) * 100));
                const filledPct = Math.max(0, Math.min(widthPct, todayPct - leftPct));
                return (
                  <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: `700 12px ${V3.font}`, color: V3.ink }}>{typeName(p)}</div>
                        <div style={{ fontSize: 10, color: V3.muted, fontFamily: V3.font }}>
                          {p.vendor_id ? (
                            <EntityLink kind="vendor" id={p.vendor_id} label={p.insurer_name || "Carrier"} />
                          ) : (
                            p.insurer_name || "—"
                          )}
                          {" · "}
                          <EntityLink kind="insurance_policy" id={p.id} label={p.policy_number || p.id.slice(0, 8)} />
                        </div>
                      </div>
                      <div
                        className="tabular-nums"
                        style={{ font: `600 11px ${V3.font}`, color: V3.ink, whiteSpace: "nowrap" }}
                      >
                        {formatUsdCents(Number(p.total_premium_cents ?? 0))}
                      </div>
                    </div>
                    <div style={{ position: "relative", height: 22, background: V3.chartGrid, borderRadius: 2 }}>
                      <div
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          top: 0,
                          bottom: 0,
                          background: V3.chartBand,
                          borderRadius: 2,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          width: `${Math.max(0, filledPct)}%`,
                          top: 0,
                          bottom: 0,
                          background: V3.data,
                          borderRadius: 2,
                        }}
                      />
                      <div
                        title="Today"
                        style={{
                          position: "absolute",
                          left: `${todayPct}%`,
                          top: -2,
                          bottom: -2,
                          width: 2,
                          marginLeft: -1,
                          background: V3.live,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: V3.muted, fontFamily: V3.font }}>
                today · day {yearWindow.dayOfYear} / {yearWindow.span}
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px 14px", fontSize: 12, color: V3.muted, fontFamily: V3.font }}>
              {loading ? "Loading policies…" : "No active policies on file."}
            </div>
          )}
        </V3Panel>

        <V3Panel
          title="Premium by coverage"
          onViewAll={() => navigate("/insurance/policies")}
          testId="insurance-home-premium-by-coverage"
        >
          <div style={{ overflowX: "auto", padding: "0 0 4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
              <thead>
                <tr>
                  <th style={thStyle}>Coverage</th>
                  <th style={thStyle}>Carrier</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Premium</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {premiumRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, color: V3.muted }}>
                      {loading ? "Loading…" : "No active premiums."}
                    </td>
                  </tr>
                ) : (
                  premiumRows.map((row) => (
                    <tr key={`${row.coverage}-${row.policyId ?? row.carrier}`}>
                      <td style={tdStyle}>
                        {row.policyId ? (
                          <EntityLink kind="insurance_policy" id={row.policyId} label={row.coverage} />
                        ) : (
                          row.coverage
                        )}
                      </td>
                      <td style={tdStyle}>
                        {row.vendorId ? (
                          <EntityLink kind="vendor" id={row.vendorId} label={row.carrier} />
                        ) : (
                          row.carrier
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }} className="text-right tabular-nums">
                        {row.policyId ? (
                          <MoneyCell
                            cents={row.premiumCents}
                            drill={{ entity: { kind: "insurance_policy", id: row.policyId } }}
                          />
                        ) : (
                          <Link className="underline" to="/insurance" style={{ color: "inherit" }}>
                            {formatUsdCents(row.premiumCents)}
                          </Link>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }} className="tabular-nums" data-quantity="share-pct">
                        {row.share.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
                {premiumRows.length > 0 ? (
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 700, borderBottom: "none" }}>Total</td>
                    <td style={{ ...tdStyle, borderBottom: "none" }}>{""}</td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", fontWeight: 700, borderBottom: "none" }}
                      className="text-right tabular-nums"
                    >
                      <Link
                        className="underline"
                        to="/insurance"
                        style={{ color: "inherit", fontWeight: 700 }}
                      >
                        {formatUsdCents(annualPremiumCents)}
                      </Link>
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", fontWeight: 700, borderBottom: "none" }}
                      className="tabular-nums"
                    >
                      100%
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </V3Panel>
      </div>

      <p style={{ fontSize: 11, color: V3.muted, fontFamily: V3.font, margin: 0 }}>
        Per truck per month fills from{" "}
        <Link to="/insurance/fleet-covered" style={{ color: V3.link, fontWeight: 600 }}>
          Fleet Covered
        </Link>
        .
      </p>
    </div>
  );
}
