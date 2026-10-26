/**
 * ROUND 443.267 / 443.280 — Accounting › Unexpected expenses (board-faithful, BoardSection).
 * Board: 10-22-2026-LEAD-MOD-DESIGN-V3-Accounting-Unexpected.dc.html
 * Live pending bank debit candidates (shop / tire / tow / fine / lumper / medical).
 * Link → Banking For-review with txn_id. No mock rows.
 */
import { ParityTable } from "../../components/parity/ParityTable";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getUnexpectedExpenses, type UnexpectedCandidate } from "../../api/unexpectedExpenses";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { BoardSection } from "../../components/v3/BoardSection";

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
    // Board CashFlow-Unexpected KPI sub: "$460.01 - $155.86" (hyphen, not middle-dot).
    return kpis.duplicate_amounts_cents.map((c) => `$${formatPlainDollars(c)}`).join(" - ");
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
          <BoardSection
            title={`Candidates from the bank — ${report?.month_label ?? "Month"}`}
            onViewAll={goBanking}
            footer="Found by payee name only — nothing is categorized or matched; a person confirms each line."
            testId="unexpected-candidates-panel"
          >
            <ParityTable<(typeof candidates)[number]>
              tableTestId="unexpected-candidates-table"
              appearance="board"
              hidePager
              density="compact"
              suppressToolbarSearch
              suppressToolbarRange
              loading={query.isLoading}
              rows={candidates}
              rowKey={(row) => row.id}
              rowTestId={(row) => `unexpected-row-${row.id}`}
              emptyText="No unexpected bank lines this month."
              columns={[
                { key: "transaction_date", label: "Date", sortable: true, sortValue: (row) => row.transaction_date, render: (row) => mmDd(row.transaction_date) },
                { key: "payee", label: "Payee", sortable: false, render: (row) => <PayeeCell row={row} /> },
                { key: "kind_label", label: "Kind", sortable: true, sortValue: (row) => row.kind_label, render: (row) => row.kind_label },
                { key: "amount_cents", label: "Amount", sortable: true, kind: "money", sortValue: (row) => row.amount_cents, render: (row) => formatPlainDollars(row.amount_cents) },
                { key: "flag", label: "Flag", sortable: false, render: (row) => <FlagCell flag={row.flag} /> },
                { key: "truck_wo", label: "Truck / WO", sortable: false, render: (row) => <TruckWoCell row={row} /> },
              ]}
              footerCells={
                candidates.length > 0
                  ? {
                      transaction_date: <span className="font-semibold" data-testid="unexpected-total-row">Total</span>,
                      amount_cents: <span className="font-semibold">{formatPlainDollars(kpis?.month_total_cents ?? 0)}</span>,
                    }
                  : undefined
              }
            />
          </BoardSection>

          <BoardSection title="By kind" onViewAll={goBanking} testId="unexpected-by-kind-panel">
            <ParityTable<{ kind: string; label: string; amount_cents: number | null; count: number }>
              tableTestId="unexpected-by-kind-table"
              appearance="board"
              hidePager
              density="compact"
              suppressToolbarSearch
              suppressToolbarRange
              rows={
                byKind.length
                  ? byKind
                  : [
                      { kind: "shop", label: "Repairs · shop", amount_cents: null, count: 0 },
                      { kind: "tires", label: "Tires", amount_cents: null, count: 0 },
                      { kind: "towing", label: "Towing · road service", amount_cents: null, count: 0 },
                      { kind: "fines", label: "Fines · citations · scales", amount_cents: null, count: 0 },
                      { kind: "lumper", label: "Lumper · detention", amount_cents: null, count: 0 },
                      { kind: "medical", label: "Driver medical · hotel", amount_cents: null, count: 0 },
                    ]
              }
              rowKey={(row) => row.kind}
              rowTestId={(row) => `unexpected-kind-${row.kind}`}
              columns={[
                { key: "label", label: "Kind", sortable: true, sortValue: (row) => row.label, render: (row) => row.label },
                { key: "amount_cents", label: "Amount", sortable: true, kind: "money", sortValue: (row) => row.amount_cents ?? -1, render: (row) => (row.amount_cents == null ? "—" : formatPlainDollars(row.amount_cents)) },
              ]}
            />
          </BoardSection>
        </div>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default UnexpectedExpensesPage;
