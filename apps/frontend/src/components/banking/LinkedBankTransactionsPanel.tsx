import { useQuery } from "@tanstack/react-query";
import { getBankTransactionSplitsByLinkage, getBankTransactionsByLinkage, type LinkedBankTransactionSplitRow } from "../../api/banking";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel as formatEntityLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

type LinkageKind = "driver_id" | "unit_id" | "trailer_id" | "load_id" | "vendor_id" | "customer_id";

type Props = {
  companyId: string;
  linkage: { kind: LinkageKind; id: string };
  /** Short label for the entity (e.g. driver name) — display only */
  entityLabel?: string;
};

/**
 * Law §9 REVERSE drill — BLOCK-6b.
 * API `GET /banking/transactions/by-linkage` existed with zero UI callers.
 * Mount on Driver / Unit (finance) / Load / Vendor / Customer surfaces so bank feed tags are
 * reachable both ways.
 */
export function LinkedBankTransactionsPanel({ companyId, linkage, entityLabel }: Props) {
  const query = useQuery({
    queryKey: ["banking", "by-linkage", companyId, linkage.kind, linkage.id],
    queryFn: () =>
      getBankTransactionsByLinkage(companyId, {
        [linkage.kind]: linkage.id,
        limit: 50,
      }),
    enabled: Boolean(companyId && linkage.id),
  });

  const rows = query.data?.rows ?? [];
  const splitQuery = useQuery({
    queryKey: ["banking", "split-lines-by-linkage", companyId, linkage.kind, linkage.id],
    queryFn: () =>
      getBankTransactionSplitsByLinkage(companyId, {
        [linkage.kind]: linkage.id,
        limit: 50,
      }),
    enabled: Boolean(companyId && linkage.id),
  });
  const splitRows: LinkedBankTransactionSplitRow[] = splitQuery.data?.rows ?? [];

  return (
    <div
      className="rounded-sm border border-gray-200 bg-white p-3"
      data-testid="linked-bank-transactions-panel"
      data-linkage-kind={linkage.kind}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Linked bank transactions{entityLabel ? ` · ${entityLabel}` : ""}
        </p>
        <span className="text-[11px] text-gray-500">{query.data?.total_count ?? rows.length} tagged</span>
      </div>
      <p className="mb-2 text-[11px] text-gray-600">
        Reverse Law §9: bank feed rows with this {linkage.kind.replace("_id", "")} categorization tag. Open a row to
        Match/Categorize on Banking → Transactions.
      </p>
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
      {splitQuery.isError ? <ListErrorBanner onRetry={() => void splitQuery.refetch()} /> : null}
      {query.isLoading || splitQuery.isLoading ? <p className="text-sm text-gray-500">Loading linked bank transactions…</p> : null}
      {/* Absence only after a successful response — never from a failed/pending fetch. */}
      {query.isSuccess && splitQuery.isSuccess && rows.length === 0 && splitRows.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="linked-bank-transactions-empty">
          No bank transactions tagged to this {linkage.kind.replace("_id", "")} yet. Tagging happens on Banking →
          Transactions → Categorize (persisted links only).
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => {
            const cents = Math.abs(Number(row.amount_cents ?? 0));
            const signed = row.is_credit ? cents : -cents;
            return (
              <li
                key={row.bank_transaction_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <EntityLink
                    kind="bank_transaction"
                    id={row.bank_transaction_id}
                    label={formatEntityLabel(row.description?.trim() || null, row.bank_transaction_id, "Bank transaction")}
                  />
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {formatDateUS(row.transaction_date) || "—"}
                    {row.category_kind ? ` · ${row.category_kind}` : ""}
                    {row.matched_journal_entry_id ? (
                      <>
                        {" · "}
                        <EntityLink
                          kind="journal_entry"
                          id={row.matched_journal_entry_id}
                          label={formatEntityLabel(row.matched_journal_entry_memo, row.matched_journal_entry_id, "Journal entry")}
                        />
                      </>
                    ) : null}
                    {row.deduction_id ? (
                      <>
                        {" · "}
                        <EntityLink
                          kind="settlement_deduction"
                          id={row.deduction_id}
                          label={`${row.deduction_label || row.deduction_type || "Driver deduction"}${
                            row.deduction_amount_cents != null
                              ? ` · ${formatUsdCents(Math.abs(Number(row.deduction_amount_cents)))}`
                              : ""
                          } · ${row.deduction_status || "—"}`}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
                <span className={`shrink-0 tabular-nums font-medium ${signed < 0 ? "text-red-700" : "text-slate-800"}`}>
                  {formatUsdCents(signed)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {splitRows.length > 0 ? (
        <div className="mt-3 border-t border-gray-100 pt-2" data-testid="linked-bank-split-lines">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tagged split lines</p>
          <ul className="divide-y divide-gray-100">
            {splitRows.map((row) => (
              <li key={row.split_line_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <EntityLink
                    kind="bank_transaction"
                    id={row.bank_transaction_id}
                    label={formatEntityLabel(row.description?.trim() || null, row.bank_transaction_id, `Bank transaction · split ${row.line_no}`)}
                  />
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
                    <span>{formatDateUS(row.transaction_date) || "—"} · line {row.line_no}</span>
                    {row.result_bill_id ? <EntityLink kind="bill" id={row.result_bill_id} label="Posted bill" /> : null}
                    {row.result_driver_advance_id ? <EntityLink kind="cash_advance" id={row.result_driver_advance_id} label="Driver advance" /> : null}
                    {row.result_deduction_id ? <EntityLink kind="settlement_deduction" id={row.result_deduction_id} label="Recovery deduction" /> : null}
                    {row.result_journal_entry_id ? <EntityLink kind="journal_entry" id={row.result_journal_entry_id} label="Journal entry" /> : null}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-800">{formatUsdCents(Math.abs(Number(row.amount_cents ?? 0)))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
