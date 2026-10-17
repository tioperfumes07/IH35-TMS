// LINKAGE LAW §10-B (reverse drill) for the ROUND 315 factoring purchase document: an invoice, a load and a customer each
// show the factoring purchases (= Faro wires) they sit on — the purchase, its date, gross / reserves / fee / net, the
// funding journal entry and the bank deposit it matched — every id an EntityLink. One component, mounted on the invoice
// detail page, the load's Factoring tab and the customer drill modal; it reads GET /api/v1/factoring/purchases with the
// existing reverse-drill filters (invoice_id / load_id / customer_id); money columns are the filtered record's OWN line share
// (line_* from listPurchases), the net is the whole wire's. Read-only: the Owner creates purchases on the
// Submit to Factor tab.
import { useQuery } from "@tanstack/react-query";
import { listFactoringPurchases, type ListFactoringPurchasesFilters } from "../../api/factoring-purchases";
import { ParityTable } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

type Props = {
  companyId: string | null | undefined;
  filter: Pick<ListFactoringPurchasesFilters, "invoice_id" | "load_id" | "customer_id">;
  /** Shown when nothing is factored (e.g. "This invoice has not been sold to the factor."). */
  emptyText?: string;
};

type PurchaseRow = Awaited<ReturnType<typeof listFactoringPurchases>>["purchases"][number];

const cents = (v: number | string | null | undefined) => formatUsdCents(Number(v ?? 0));

export function FactoringPurchaseLinksPanel({ companyId, filter, emptyText = "Not on any factoring purchase." }: Props) {
  const enabled = Boolean(companyId) && Boolean(filter.invoice_id || filter.load_id || filter.customer_id);
  const query = useQuery({
    queryKey: ["factoring", "purchases", "reverse", companyId, filter.invoice_id ?? null, filter.load_id ?? null, filter.customer_id ?? null],
    queryFn: () => listFactoringPurchases(String(companyId), filter).then((r) => r.purchases),
    enabled,
  });

  if (!enabled) return null;
  if (query.isLoading) return <p className="text-xs text-[#4B5563]">Loading factoring purchases…</p>;
  if (query.isError) {
    return (
      <p className="text-xs text-[#1F2A44]" data-testid="factoring-purchase-links-error">
        Could not load factoring purchases.{" "}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    );
  }
  const rows = query.data ?? [];
  if (!rows.length) {
    return (
      <p className="text-xs text-[#4B5563]" data-testid="factoring-purchase-links-empty">
        {emptyText}
      </p>
    );
  }
  return (
    <ParityTable<PurchaseRow>
      tableTestId="factoring-purchase-links"
      rows={rows}
      rowKey={(p) => p.id}
      density="compact"
      columns={[
        {
          key: "display_id",
          label: "Purchase",
          render: (p) => (
            <span data-testid={`factoring-purchase-link-${p.id}`}>
              <EntityLink kind="factoring_purchase" id={p.id} label={p.display_id} />
              <span className="ml-1 text-[#4B5563]">{p.status}</span>
            </span>
          ),
        },
        {
          key: "purchase_date",
          label: "Date", sortable: true,
          render: (p) => (p.purchase_date ? formatDateUS(p.purchase_date) : "—"),
        },
        {
          key: "line_gross_cents",
          label: "Gross (this record)", sortable: true,
          className: "text-right",
          cellClass: "text-right",
          render: (p) => cents(p.line_gross_cents ?? p.gross_cents),
        },
        {
          key: "line_escrow_reserve_cents",
          label: "Escrow", sortable: true,
          className: "text-right",
          cellClass: "text-right",
          render: (p) => cents(p.line_escrow_reserve_cents ?? p.escrow_reserve_cents),
        },
        {
          key: "line_cash_reserve_cents",
          label: "Cash reserve", sortable: true,
          className: "text-right",
          cellClass: "text-right",
          render: (p) => cents(p.line_cash_reserve_cents ?? p.cash_reserve_cents),
        },
        {
          key: "line_fee_cents",
          label: "Fee", sortable: true,
          className: "text-right",
          cellClass: "text-right",
          render: (p) => cents(p.line_fee_cents ?? p.fee_cents),
        },
        {
          key: "net_to_company_cents",
          label: "Wire net to IH35", sortable: true,
          className: "text-right",
          cellClass: "text-right",
          render: (p) => cents(p.net_to_company_cents),
        },
        {
          key: "journal_entry_id",
          label: "Journal entry",
          render: (p) =>
            p.journal_entry_id ? <EntityLink kind="journal_entry" id={p.journal_entry_id} label="Funding JE" /> : "—",
        },
        {
          key: "bank_transaction_id",
          label: "Bank deposit",
          render: (p) =>
            p.bank_transaction_id ? (
              <EntityLink kind="bank_transaction" id={p.bank_transaction_id} label="Matched deposit" />
            ) : (
              "Not matched"
            ),
        },
      ]}
    />
  );
}
