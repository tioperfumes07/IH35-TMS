/**
 * FuelPurchasesSection — ROUND 83 RULING 3 (owner, verbatim: "CATEGORIZE THEM AS ITEMS, PRODUCT
 * SERVICE, SO YOU CAN HAVE THE QUANTITIES, COST TOTALS, ETC. AS IN QUICKBOOKS... Fuel-Truck
 * Diesel: qty = gallons, rate = price per gallon, amount = the charge. Fuel-DEF-Diesel Exhaust
 * Fluid: same, its own item, its own gallons.").
 *
 * The Company Waterfall (CompanyWaterfallSection.tsx) intentionally stays a rollup ("Less · Fuel
 * purchases (X gal): $Y") — that design is correct for a P&L summary and untouched here. This is
 * the itemized detail underneath it: one row per real fuel.fuel_transactions purchase, item ·
 * description · QTY (gallons) · RATE ($/gal) · AMOUNT, amount taken directly from the source row
 * (never re-derived as qty*rate — total_cost already nets card fees/discounts the raw multiply
 * would silently drop; see company-settlement-report.service.ts). Diesel and DEF render as
 * separate items per the owner, driven off the real fuel_type column, never invented.
 *
 * Mirrors EarningsSection.tsx's structure (ParityTable, em-dash fallbacks, Subtotal/Qty footer).
 */
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { mmmDd } from "../../../lib/formatDate";
import type { CompanySettlementFuelRow } from "../../../api/accounting";

const DASH = "—";

/** Real fuel_type values (fuel.fuel_transactions_fuel_type_check) -> the owner's named item. Any
 *  value outside this set (a future, not-yet-enumerated fuel_type) renders Title Case rather than
 *  a blank/undefined item — never silently drops the row. */
const FUEL_ITEM_LABEL: Record<string, string> = {
  diesel: "Fuel-Truck Diesel",
  def: "Fuel-DEF-Diesel Exhaust Fluid",
  reefer_diesel: "Fuel-Reefer Diesel",
  gas: "Fuel-Gas",
  other: "Fuel-Other",
};

function fuelItemLabel(fuelType: string): string {
  return FUEL_ITEM_LABEL[fuelType] ?? (fuelType ? fuelType.charAt(0).toUpperCase() + fuelType.slice(1) : "Fuel");
}

const COLUMNS: Array<ParityColumn<CompanySettlementFuelRow & { id: string }>> = [
  {
    key: "fuel_type",
    label: "Item",
    render: (row) => fuelItemLabel(row.fuel_type),
  },
  {
    key: "vendor",
    label: "Description",
    render: (row) => [row.vendor, row.location].filter(Boolean).join(" · ") || DASH,
  },
  {
    key: "transaction_date",
    label: "Date",
    sortable: true,
    sortValue: (row) => row.transaction_date ?? "",
    render: (row) => mmmDd(row.transaction_date) || DASH,
  },
  {
    key: "load_id",
    label: "Load #",
    render: (row) =>
      row.load_id ? (
        <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
      ) : (
        DASH
      ),
  },
  {
    key: "gallons",
    label: "Qty (gal)",
    // LAW §8 "zero is a claim" — a source row with no captured gallons renders "—", never 0.0.
    render: (row) =>
      row.gallons != null ? (
        <>{row.gallons.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 })}</>
      ) : (
        <span title="no gallons captured on this purchase">{DASH}</span>
      ),
  },
  {
    key: "price_per_gallon",
    label: "Rate",
    render: (row) =>
      row.price_per_gallon != null ? (
        <>${row.price_per_gallon.toFixed(4)}</>
      ) : (
        <span title="no price/gallon captured on this purchase">{DASH}</span>
      ),
  },
  {
    key: "amount_cents",
    label: "Amount",
    render: (row) => <>${(row.amount_cents / 100).toFixed(2)}</>,
  },
  {
    key: "invoice_number",
    label: "Invoice #",
    render: (row) => row.invoice_number ?? DASH,
  },
];

type Props = {
  rows: CompanySettlementFuelRow[];
};

export function FuelPurchasesSection({ rows }: Props) {
  if (rows.length === 0) return null;
  const withIds = rows.map((r, i) => ({ ...r, id: `${r.load_id ?? "no-load"}-${r.transaction_date ?? "no-date"}-${i}` }));
  const subtotalCents = rows.reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);
  const totalGallons = rows.reduce((sum, r) => sum + Number(r.gallons || 0), 0);
  return (
    <section className="rounded-sm border border-gray-200 bg-white" data-testid="fuel-purchases-section">
      <header className="flex items-center border-b border-gray-200 px-2.5 py-1.5">
        <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Fuel purchases</h2>
        <span className="ml-2 text-xs text-slate-500">one line per purchase · qty x rate = amount · diesel and DEF are separate items</span>
      </header>
      <ParityTable
        columns={COLUMNS}
        rows={withIds}
        rowKey={(row) => row.id}
        storageKey="driver-finance-fuel-purchases-section"
        tableTestId="fuel-purchases-section-table"
        embedded
        hidePager
      />
      <div className="mt-1 px-2.5 py-1 text-xs font-semibold">
        Subtotal: ${(subtotalCents / 100).toFixed(2)} · Gallons: {totalGallons.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </div>
    </section>
  );
}
