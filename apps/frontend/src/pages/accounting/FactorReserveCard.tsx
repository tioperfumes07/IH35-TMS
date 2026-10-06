// Lead ROUND 296 §3 / owner "they are not cards" — the per-customer Faro reserve is a TABLE, a row per customer (gear
// column chooser via ParityTable, money right-aligned tabular-nums, em dash for missing). One server query
// (GET /api/v1/factoring/reserves/by-customer) computes every column from the posted purchase lines and the reserve
// movements stamped to each invoice, and reports whether the column total ties to the GL balance of 1230 (Faro Escrow
// report) + 1235 (Faro Cash report). Each customer row drills to its invoices; each invoice links to the invoice.
// Read-only — no mutation lives here; money moves only through the Banking match.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReserveByCustomer, getReserveByInvoice, type ReserveByCustomerRow, type ReserveByInvoiceRow } from "../../api/factoring-reserves";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Modal } from "../../components/Modal";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter.
function money(cents: number | null | undefined) {
  return cents == null ? "—" : formatUsdCents(cents);
}

const columns: Array<ParityColumn<ReserveByCustomerRow>> = [
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    sortValue: (row) => row.customer_name,
    render: (row) =>
      row.customer_id ? (
        <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />
      ) : (
        <span className="text-slate-600">{row.customer_name}</span>
      ),
  },
  { key: "invoices_purchased", label: "Invoices purchased", kind: "number", sortable: true, render: (row) => String(row.invoices_purchased) },
  { key: "face_cents", label: "Face", kind: "money", sortable: true, render: (row) => money(row.face_cents) },
  { key: "advanced_cents", label: "Advanced", kind: "money", sortable: true, render: (row) => money(row.advanced_cents) },
  { key: "held_cents", label: "Held", kind: "money", sortable: true, render: (row) => money(row.held_cents) },
  { key: "released_cents", label: "Released", kind: "money", sortable: true, render: (row) => money(row.released_cents) },
  { key: "fees_cents", label: "Fees & short-pays", kind: "money", sortable: true, render: (row) => money(row.fees_cents) },
  { key: "recourse_cents", label: "Recourse", kind: "money", sortable: true, render: (row) => money(row.recourse_cents) },
  { key: "reserve_now_cents", label: "Reserve now", kind: "money", sortable: true, render: (row) => money(row.reserve_now_cents) },
];

const invoiceColumns: Array<ParityColumn<ReserveByInvoiceRow>> = [
  {
    key: "invoice_display_id",
    label: "Invoice",
    sortable: true,
    render: (row) =>
      row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={entityLabel(row.invoice_display_id, row.invoice_id, "Invoice")} /> : "Not stamped to an invoice",
  },
  ...(columns.slice(2) as unknown as Array<ParityColumn<ReserveByInvoiceRow>>),
];

export function FactorReserveCard({ operatingCompanyId }: { operatingCompanyId: string }) {
  const [drill, setDrill] = useState<ReserveByCustomerRow | null>(null);
  const query = useQuery({
    queryKey: ["factoring", "reserves", "by-customer", operatingCompanyId],
    queryFn: () => getReserveByCustomer(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const invoices = useQuery({
    queryKey: ["factoring", "reserves", "by-invoice", operatingCompanyId, drill?.customer_id ?? null],
    queryFn: () => getReserveByInvoice(operatingCompanyId, drill?.customer_id ?? null),
    enabled: Boolean(operatingCompanyId && drill),
  });

  const rows = query.data?.rows ?? [];

  return (
    <div className="grid gap-3">
      <DataPanel title="Reserve by customer">
        {query.isError ? (
          <ListErrorState
            title="Couldn't load reserve balances"
            status={0}
            message={(query.error as Error | undefined)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable<ReserveByCustomerRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.customer_id ?? "unstamped"}
            onRowClick={(row) => setDrill(row)}
            loading={query.isLoading}
            emptyText={query.data?.empty_reason ?? "No reserve balances yet."}
            storageKey="accounting-factor-reserve-balances"
            tableTestId="factor-reserve-balances-table"
          />
        )}
        {query.data ? (
          <p className="mt-2 text-xs tabular-nums text-slate-700" data-testid="factor-reserve-tie-out">
            Reserve now {money(query.data.total_reserve_now_cents)} · GL 1230 + 1235 {money(query.data.gl_balance_cents)} ·{" "}
            {query.data.ties_to_gl ? "ties to the cent" : "DOES NOT TIE — a reserve movement is missing its invoice stamp"}
          </p>
        ) : null}
      </DataPanel>
      {drill ? (
        <Modal open onClose={() => setDrill(null)} title={`Reserve — ${entityLabel(drill.customer_name, drill.customer_id, "Customer")}`}>
          {invoices.isError ? (
            <ListErrorState title="Couldn't load the invoices" status={0} onRetry={() => void invoices.refetch()} />
          ) : (
            <ParityTable<ReserveByInvoiceRow>
              columns={invoiceColumns}
              rows={invoices.data?.rows ?? []}
              rowKey={(row) => row.invoice_id ?? "unstamped"}
              loading={invoices.isLoading}
              emptyText="No invoices."
              storageKey="accounting-factor-reserve-by-invoice"
              tableTestId="factor-reserve-by-invoice-table"
            />
          )}
        </Modal>
      ) : null}
    </div>
  );
}
