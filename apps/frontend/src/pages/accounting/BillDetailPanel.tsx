import { FlatFieldGrid } from "../../components/layout/FlatFieldGrid";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

type BillSummary = {
  /** LINK-F5188: real accounting.bills row id — the caller always has it (selectedBill.id). */
  id?: string | null;
  display_id?: string | null;
  bill_number?: string | null;
  vendor_name?: string | null;
  vendor_id?: string | null;
  status?: string | null;
  amount_cents?: number | null;
  balance_cents?: number | null;
  due_date?: string | null;
  /** Law §9 — resolved from journal_entry_postings when the bill has posted. */
  journal_entry_id?: string | null;
  journal_entry_date?: string | null;
  journal_entry_memo?: string | null;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type Props = {
  bill: BillSummary | null;
};

export function BillDetailPanel({ bill }: Props) {
  if (!bill) {
    return <p className="text-sm text-gray-500">Select a bill to view details.</p>;
  }

  const amount = Number(bill.amount_cents ?? 0) / 100;
  const balance = Number(bill.balance_cents ?? bill.amount_cents ?? 0) / 100;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-bill-detail-panel>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Bill details</h3>
      <FlatFieldGrid
        columns={3}
        fields={[
          {
            label: "Bill #",
            value: bill.id ? (
              <EntityLink
                kind="bill"
                id={bill.id}
                label={visibleDocumentLabel(bill.display_id ?? bill.vendor_name, bill.id, "Bill")}
              />
            ) : (
              bill.display_id ?? "—"
            ),
          },
          { label: "Vendor Invoice #", value: bill.bill_number ?? "—" },
          { label: "Vendor", value: entityLabel(bill.vendor_name, bill.vendor_id, "Vendor") },
          { label: "Status", value: bill.status ?? "—" },
          { label: "Amount", value: money.format(amount) },
          { label: "Open balance", value: money.format(balance) },
          { label: "Due date", value: bill.due_date ? new Date(bill.due_date).toLocaleDateString() : "—" },
          {
            label: "Journal entry",
            value: bill.journal_entry_id ? (
              <EntityLink
                kind="journal_entry"
                id={bill.journal_entry_id}
                label={
                  bill.journal_entry_date
                    ? `${formatDateUS(bill.journal_entry_date)}${bill.journal_entry_memo ? ` — ${bill.journal_entry_memo}` : ""}`
                    : entityLabel(bill.journal_entry_memo, bill.journal_entry_id, "Journal entry")
                }
              />
            ) : (
              "—"
            ),
          },
        ]}
      />
    </section>
  );
}
