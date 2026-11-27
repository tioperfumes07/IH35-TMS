/**
 * SCENTSX-BOOKS — ScentsX LLC's books inside the TIO Perfumes workspace (owner 2026-11-26 20:13 CT "Own company, same
 * engine"; 20:16 CT "complete wiring to ledgers liabilities assets"). Shows the company, its chart of accounts with the
 * role each account plays for the poster, and each account's posted balance.
 * TABLE_DATE_OMIT: a chart of accounts lists accounts, not dated events — the balance is "all posted entries to date". Read-only: accounts are added through the
 * chart migration / Accounting; journal entries come from the posting engine, never typed here.
 */
import { useQuery } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { KpiCard } from "../../components/layout/KpiCard";
import { getScentsxCompany, getScentsxPendingMoves, listScentsxAccounts, postScentsxPendingMoves, type ScentsxAccount } from "../../api/scentsx";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { tr } from "./perfumeI18n";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";

const DASH = "—";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const DEBIT_NORMAL = new Set(["Asset", "Expense", "CostOfGoodsSold", "OtherExpense"]);
/** Balance on the account's normal side (debit-normal for assets and expenses, credit-normal otherwise). */
export const normalBalance = (a: Pick<ScentsxAccount, "account_type" | "debit_cents" | "credit_cents">) =>
  DEBIT_NORMAL.has(a.account_type) ? Number(a.debit_cents) - Number(a.credit_cents) : Number(a.credit_cents) - Number(a.debit_cents);

export function PerfumeBooksPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const accts = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts });
  const [showNumbers, setShowNumbers] = useShowAccountNumbers();
  const pending = useQuery({ queryKey: ["scentsx", "pending-moves"], queryFn: getScentsxPendingMoves });
  const { pushToast } = useToast();
  const postNow = async () => {
    try {
      const { result } = await postScentsxPendingMoves();
      if (result.failed.length) pushToast(`${result.posted} posted · ${result.failed.length} failed: ${result.failed[0]!.error}`, "error");
      else pushToast(`${result.posted} stock move(s) posted to the books`, "success");
      void pending.refetch(); void accts.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not posted"), "error"); }
  };
  if (co.isError) return <ListErrorState title={tr("scentsx.books.error", "Couldn't load ScentsX's books")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  const c = co.data?.company;
  // The EIN is a tax number printed as text, not a record to open — so it is not an EntityLink.
  const ein = c?.tax_id ?? null;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="space-y-3" data-testid="scentsx-books-panel">
      <div className="rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs">
        <div className="text-section-header">{c ? `${c.legal_name} · ${c.short_name ?? ""}` : "…"}</div>
        <div className="mt-1 text-[#64748B]">{tr("scentsx.books.note", "Its own company in the accounting engine — its books never mix with USMCA, Transportation or Trucking.")}</div>
        <div className="mt-1">{tr("scentsx.books.ein", "EIN")}: {ein ?? tr("scentsx.books.ein_missing", "not entered yet")}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <KpiCard label={tr("scentsx.books.kpi_accounts", "Accounts")} number={String(c?.accounts ?? 0)} onClick={() => jump("scentsx-chart")} />
        <KpiCard label={tr("scentsx.books.kpi_roles", "Poster roles bound")} number={String(c?.roles ?? 0)} onClick={() => jump("scentsx-chart")} />
        <KpiCard label={tr("scentsx.books.kpi_periods", "Accounting periods")} number={String(c?.periods ?? 0)} onClick={() => jump("scentsx-chart")} />
        <KpiCard label={tr("scentsx.books.kpi_customers", "Customers linked")} number={String(c?.customers_linked ?? 0)} to="/perfume?tab=customers" />
        <KpiCard label={tr("scentsx.books.kpi_vendors", "Vendors linked")} number={String(c?.vendors_linked ?? 0)} to="/perfume?tab=vendors" />
      </div>
      <div className="flex items-center gap-2 rounded-[3px] border border-[#D8E0E8] bg-white p-2 text-xs" data-testid="scentsx-books-pending">
        <span>{tr("scentsx.books.pending", "Stock moves not yet in the books")}: <b className="tabular-nums">{pending.isError ? "?" : (pending.data?.pending ?? 0).toLocaleString()}</b></span>
        <span className="text-[#64748B]">{tr("scentsx.books.pending_note", "Each receipt, shipment, transfer, count and write-down posts automatically every 5 minutes.")}</span>
        <Button type="button" variant="secondary" className="ml-auto h-[30px] px-3 text-xs" disabled={!pending.data?.pending} onClick={() => void postNow()} data-testid="scentsx-books-post-now">
          {tr("scentsx.books.post_now", "Post now")}</Button>
      </div>
      {c && c.periods === 0 ? (
        <div className="rounded-[3px] border border-[#F59E0B] bg-[#FFFBEB] p-2 text-xs" data-testid="scentsx-books-no-period">
          {tr("scentsx.books.no_period", "No accounting periods are set up yet, so no month can be closed or locked. Entries still post by date; the books start date and the opening balances are yours to enter.")}
        </div>
      ) : null}
      <div id="scentsx-chart" className="space-y-1">
        <label className="flex items-center gap-1 text-xs text-[#64748B]">
          <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} data-testid="scentsx-books-show-numbers" />
          {tr("scentsx.books.show_numbers", "Show account numbers")}
        </label>
        {accts.isError ? (
          <ListErrorState title={tr("scentsx.books.chart_error", "Couldn't load the chart of accounts")} status={0} message={(accts.error as Error)?.message} onRetry={() => void accts.refetch()} />
        ) : (
          <ParityTable<ScentsxAccount>
            title={tr("scentsx.books.chart", "Chart of accounts")}
            rows={accts.data?.accounts ?? []}
            rowKey={(a) => a.id}
            loading={accts.isLoading}
            storageKey="scentsx-chart-v1"
            exportFilename="ScentsX chart of accounts"
            exportExcel
            emptyText="No accounts."
            columns={[
              { key: "account_name", label: "Account", sortable: true, render: (a) => <span className="font-semibold">{formatAccountDisplayLabel(a, { showNumber: showNumbers })}</span> },
              { key: "account_type", label: "Type", sortable: true },
              { key: "account_subtype", label: "Detail type", sortable: true, render: (a) => a.account_subtype ?? DASH },
              { key: "roles", label: "Poster role", sortable: true, render: (a) => (a.roles.length ? a.roles.join(", ") : DASH) },
              { key: "balance", label: "Posted balance", sortable: true, cellClass: "text-right tabular-nums", render: (a) => money(normalBalance(a)) },
            ]}
          />
        )}
      </div>
    </div>
  );
}
