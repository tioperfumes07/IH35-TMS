/**
 * ROUND 443.267 / 443.280 / 8.20 — Accounting › Unexpected expenses (board-faithful, BoardSection).
 * Board: docs/design/v3/Accounting-Unexpected.dc.html
 * Live pending bank debit candidates (shop / tire / tow / fine / lumper / medical).
 * Link → Banking Transactions Match drawer with txn_id + ret. No mock rows.
 */
import { ParityTable } from "../../components/parity/ParityTable";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getUnexpectedExpenses, type UnexpectedCandidate } from "../../api/unexpectedExpenses";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { BoardSection } from "../../components/v3/BoardSection";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { statementMonthBounds } from "../factoring/factoringMonthFeeDrill";

function mmDd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

/** Banking for-review money-out cohort for the Unexpected month (board2 KPI/by-kind drills). */
function unexpectedBankingHref(month: string | null | undefined, originHref: string): string {
  const bounds = statementMonthBounds(month);
  const params = new URLSearchParams({
    types: "money_out",
    review: "for_review",
  });
  if (bounds) {
    params.set("date_from", bounds.from);
    params.set("date_to", bounds.to);
  }
  return withReturnContext(`/banking/transactions?${params.toString()}`, originHref);
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

/** Accounting-Unexpected.dc.html — always-visible Link → Banking Match drawer (never Truck/WO substitute). */
function LinkCell({ row, originHref }: { row: UnexpectedCandidate; originHref: string }) {
  const target = `/banking/transactions?txn_id=${encodeURIComponent(row.id)}&review=for_review`;
  return (
    <Link
      to={withReturnContext(target, originHref)}
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
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);

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

  // ROUND 8.20 board 2 — View all opens Banking Transactions for-review (not Home accounts).
  const bankingMonthHref = unexpectedBankingHref(report?.month, originHref);
  const goBanking = () => navigate(bankingMonthHref);

  if (!companyId) {
    return (
      <AccountingSubNavWrapper title="Unexpected expenses">
        <BoardSection title="Unexpected expenses" testId="unexpected-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
        </BoardSection>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper
      title="Unexpected expenses"
      subtitle="Pending bank debits that look like shop / tire / tow / fine / lumper / medical — confirm each line."
    >
      <div
        className="space-y-3"
        data-testid="unexpected-expenses-page"
        style={{ fontFamily: V3.font }}
      >
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
              query.isLoading || !kpis ? "—" : formatUsdCents(kpis.month_total_cents)
            }
            sub={kpis?.month_sub ?? (query.isLoading ? "Loading…" : "0 shop / tire bank lines")}
            href={query.isLoading || !kpis ? undefined : bankingMonthHref}
            noDrill={query.isLoading || !kpis ? "unexpected month total still loading" : undefined}
            testId="unexpected-kpi-month"
          />
          <V3KpiTile
            label="Possible duplicates"
            value={query.isLoading || !kpis ? "—" : String(kpis.duplicate_count)}
            sub={duplicateSub}
            tone="amber"
            href={query.isLoading || !kpis ? undefined : bankingMonthHref}
            noDrill={query.isLoading || !kpis ? "duplicate count still loading" : undefined}
            testId="unexpected-kpi-dupes"
          />
          <V3KpiTile
            label="Linked to a truck"
            value={
              query.isLoading || !kpis
                ? "—"
                : `${kpis.linked_to_truck} of ${kpis.candidate_count}`
            }
            href={query.isLoading || !kpis ? undefined : bankingMonthHref}
            noDrill={query.isLoading || !kpis ? "linked-to-truck count still loading" : undefined}
            testId="unexpected-kpi-linked"
          />
          <V3KpiTile
            label="Tows · fines"
            value={
              query.isLoading || !kpis ? "—" : formatUsdCents(kpis.tows_fines_cents)
            }
            sub={kpis?.tows_fines_sub ?? ""}
            href={query.isLoading || !kpis ? undefined : bankingMonthHref}
            noDrill={query.isLoading || !kpis ? "tows/fines total still loading" : undefined}
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
                {
                  key: "transaction_date",
                  label: "Date",
                  sortable: true,
                  sortValue: (row) => row.transaction_date,
                  render: (row) => mmDd(row.transaction_date),
                },
                { key: "payee", label: "Payee", sortable: false, render: (row) => <PayeeCell row={row} /> },
                {
                  key: "kind_label",
                  label: "Kind",
                  sortable: true,
                  sortValue: (row) => row.kind_label,
                  render: (row) => row.kind_label,
                },
                {
                  key: "amount_cents",
                  label: "Amount",
                  sortable: true,
                  kind: "money",
                  sortValue: (row) => row.amount_cents,
                  // ROUND 8.20 board 2 — amount opens the bank transaction (Match drawer via EntityLink).
                  render: (row) => (
                    <MoneyCell
                      cents={row.amount_cents}
                      drill={{ entity: { kind: "bank_transaction", id: row.id } }}
                    />
                  ),
                },
                { key: "flag", label: "Flag", sortable: false, render: (row) => <FlagCell flag={row.flag} /> },
                {
                  key: "link",
                  label: "",
                  sortable: false,
                  render: (row) => <LinkCell row={row} originHref={originHref} />,
                },
              ]}
              footerCells={
                candidates.length > 0
                  ? {
                      transaction_date: (
                        <span className="font-semibold" data-testid="unexpected-total-row">
                          Total
                        </span>
                      ),
                      amount_cents: (
                        <span className="font-semibold">{formatPlainDollars(kpis?.month_total_cents ?? 0)}</span>
                      ),
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
                {
                  key: "amount_cents",
                  label: "Amount",
                  sortable: true,
                  kind: "money",
                  sortValue: (row) => row.amount_cents ?? -1,
                  render: (row) =>
                    row.amount_cents == null ? (
                      "—"
                    ) : (
                      <Link
                        to={bankingMonthHref}
                        className="tabular-nums text-[#1F2A44] hover:underline"
                        data-testid={`unexpected-kind-amount-${row.kind}`}
                      >
                        {formatPlainDollars(row.amount_cents)}
                      </Link>
                    ),
                },
              ]}
            />
          </BoardSection>
        </div>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default UnexpectedExpensesPage;
