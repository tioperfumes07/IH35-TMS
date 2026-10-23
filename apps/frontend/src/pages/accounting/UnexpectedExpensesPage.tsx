/**
 * ROUND 443.267 — Accounting › Unexpected expenses.
 * Board: 10-22-2026-LEAD-MOD-DESIGN-V3-Accounting-Unexpected.dc.html
 * Live pending bank debit candidates (shop / tire / tow / fine / lumper / medical).
 * Link → Banking For-review with txn_id. No mock rows.
 */
import { useMemo, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getUnexpectedExpenses, type UnexpectedCandidate } from "../../api/unexpectedExpenses";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { V3, V3_TABLE } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";

function mmDd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

function formatPlainDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  fontFamily: V3.font,
};

const tdStyle: CSSProperties = {
  textAlign: "left",
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: V3_TABLE.fontPx,
  whiteSpace: "nowrap",
  color: V3.ink,
  fontFamily: V3.font,
  fontVariantNumeric: "tabular-nums",
};

function PayeeCell({ row }: { row: UnexpectedCandidate }) {
  if (row.vendor_id) {
    return <EntityLink kind="vendor" id={row.vendor_id} label={row.payee_display} />;
  }
  return <span>{row.payee_display}</span>;
}

function TruckWoCell({ row }: { row: UnexpectedCandidate }) {
  if (row.work_order_id && row.work_order_display_id) {
    return <EntityLink kind="work_order" id={row.work_order_id} label={row.work_order_display_id} />;
  }
  if (row.unit_id && row.unit_number) {
    return <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} />;
  }
  return (
    <Link
      to={`/banking?txn_id=${encodeURIComponent(row.id)}`}
      style={{ color: V3.link, fontWeight: 500, textDecoration: "none" }}
      data-testid={`unexpected-link-${row.id}`}
    >
      Link →
    </Link>
  );
}

function FlagCell({ flag }: { flag: string | null }) {
  if (!flag) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        color: V3.ink,
        whiteSpace: "nowrap",
        fontFamily: V3.font,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: V3.amber,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {flag}
    </span>
  );
}

export function UnexpectedExpensesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["accounting", "unexpected-expenses", companyId],
    queryFn: () => getUnexpectedExpenses(companyId),
    enabled: Boolean(companyId),
  });

  const report = query.data;
  const candidates = report?.candidates ?? [];
  const byKind = report?.by_kind ?? [];
  const kpis = report?.kpis;

  const duplicateSub = useMemo(() => {
    if (!kpis || kpis.duplicate_count === 0) return "none";
    return kpis.duplicate_amounts_cents.map((c) => `$${formatPlainDollars(c)}`).join(" · ");
  }, [kpis]);

  const goBanking = () => navigate("/banking?type=uncategorized");

  return (
    <AccountingSubNavWrapper
      title="Unexpected expenses"
      subtitle="Bills, expenses, invoices, settlements & transaction review"
      crumbs={[]}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: V3.font }}
        data-testid="unexpected-expenses-page"
      >
        {!companyId ? (
          <p style={{ fontSize: 12, color: V3.red }}>Select an operating company.</p>
        ) : null}

        {query.isError ? (
          <p style={{ fontSize: 12, color: V3.red }} data-testid="unexpected-error">
            Could not load unexpected expenses.
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 8,
          }}
          data-testid="unexpected-kpi-strip"
        >
          <V3KpiTile
            label={`${report?.month_label ?? "Month"} so far`}
            value={
              query.isLoading || !kpis
                ? "—"
                : formatUsdCents(kpis.month_total_cents)
            }
            sub={kpis?.month_sub ?? (query.isLoading ? "Loading…" : "0 shop / tire bank lines")}
            testId="unexpected-kpi-month"
          />
          <V3KpiTile
            label="Possible duplicates"
            value={query.isLoading || !kpis ? "—" : String(kpis.duplicate_count)}
            sub={duplicateSub}
            tone="amber"
            testId="unexpected-kpi-dupes"
          />
          <V3KpiTile
            label="Linked to a truck"
            value={
              query.isLoading || !kpis
                ? "—"
                : `${kpis.linked_to_truck} of ${kpis.candidate_count}`
            }
            testId="unexpected-kpi-linked"
          />
          <V3KpiTile
            label="Tows · fines"
            value={
              query.isLoading || !kpis ? "—" : formatUsdCents(kpis.tows_fines_cents)
            }
            sub={kpis?.tows_fines_sub ?? ""}
            testId="unexpected-kpi-tows"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          <V3Panel
            title={`Candidates from the bank — ${report?.month_label ?? "Month"}`}
            onViewAll={goBanking}
            footer="Found by payee name only — nothing is categorized or matched; a person confirms each line."
            testId="unexpected-candidates-panel"
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="unexpected-candidates-table">
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Payee</th>
                    <th style={thStyle}>Kind</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={thStyle}>Flag</th>
                    <th style={thStyle}>Truck / WO</th>
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, color: V3.muted }}>
                        Loading…
                      </td>
                    </tr>
                  ) : candidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, color: V3.muted }} data-testid="unexpected-empty">
                        No unexpected bank lines this month.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((row) => (
                      <tr key={row.id} data-testid={`unexpected-row-${row.id}`}>
                        <td style={tdStyle}>{mmDd(row.transaction_date)}</td>
                        <td style={tdStyle}>
                          <PayeeCell row={row} />
                        </td>
                        <td style={tdStyle}>{row.kind_label}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{formatPlainDollars(row.amount_cents)}</td>
                        <td style={tdStyle}>
                          <FlagCell flag={row.flag} />
                        </td>
                        <td style={tdStyle}>
                          <TruckWoCell row={row} />
                        </td>
                      </tr>
                    ))
                  )}
                  {candidates.length > 0 ? (
                    <tr data-testid="unexpected-total-row">
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 700,
                          borderTop: `1px solid ${V3.border}`,
                          background: V3.headerBg,
                          borderBottom: "none",
                        }}
                      >
                        Total
                      </td>
                      <td style={{ ...tdStyle, borderTop: `1px solid ${V3.border}`, background: V3.headerBg, borderBottom: "none" }} />
                      <td style={{ ...tdStyle, borderTop: `1px solid ${V3.border}`, background: V3.headerBg, borderBottom: "none" }} />
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 700,
                          borderTop: `1px solid ${V3.border}`,
                          background: V3.headerBg,
                          borderBottom: "none",
                        }}
                      >
                        {formatPlainDollars(kpis?.month_total_cents ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, borderTop: `1px solid ${V3.border}`, background: V3.headerBg, borderBottom: "none" }} />
                      <td style={{ ...tdStyle, borderTop: `1px solid ${V3.border}`, background: V3.headerBg, borderBottom: "none" }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </V3Panel>

          <V3Panel title="By kind" onViewAll={goBanking} testId="unexpected-by-kind-panel">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="unexpected-by-kind-table">
                <thead>
                  <tr>
                    <th style={thStyle}>Kind</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(byKind.length
                    ? byKind
                    : [
                        { kind: "shop" as const, label: "Repairs · shop", amount_cents: null, count: 0 },
                        { kind: "tires" as const, label: "Tires", amount_cents: null, count: 0 },
                        { kind: "towing" as const, label: "Towing · road service", amount_cents: null, count: 0 },
                        { kind: "fines" as const, label: "Fines · citations · scales", amount_cents: null, count: 0 },
                        { kind: "lumper" as const, label: "Lumper · detention", amount_cents: null, count: 0 },
                        { kind: "medical" as const, label: "Driver medical · hotel", amount_cents: null, count: 0 },
                      ]
                  ).map((row) => (
                    <tr key={row.kind} data-testid={`unexpected-kind-${row.kind}`}>
                      <td style={tdStyle}>{row.label}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {row.amount_cents == null ? "—" : formatPlainDollars(row.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </V3Panel>
        </div>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default UnexpectedExpensesPage;
