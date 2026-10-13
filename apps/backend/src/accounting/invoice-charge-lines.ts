/**
 * LEAD 443.110 G10 — the from-load invoice is itemized from the load's own charge lines (dispatch.load_charge_lines, written by
 * Book Load / Edit Load): line haul, fuel surcharge and each accessorial become their own invoice line, each with its item and
 * that item's income account — instead of one "Linehaul" line carrying the whole rate_total_cents.
 *
 * mdata.loads.rate_total_cents IS the sum of the load's charge lines (book-load-accessorial.ts bookLoadRateTotalCents), so the
 * lines must foot to it to the cent; a load whose charge lines do not is refused by name, never plugged. A load with no charge
 * lines (booked before the wizard wrote them) keeps the single line-haul line for its rate.
 */
import type { InvoiceLineType } from "../invoices/invoice-line-revenue-resolution.service.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }> };

export type LoadChargeLineRow = { id: string; charge_code: string; description: string | null; amount_cents: number | string; display_name: string | null };

export type PlannedInvoiceLine = {
  charge_line_id: string;
  line_type: InvoiceLineType;
  /** Catalog item names to try first, in order (the item must still default to the line's income account). */
  preferred_item_names: string[];
  description: string;
  amount_cents: number;
};

/** Which invoice line a charge code is. Detention / layover / lumper / TONU by code or wording; anything else accessorial. */
export function chargeLineType(code: string, description: string | null): { line_type: InvoiceLineType; preferred_item_names: string[] } {
  const c = code.trim().toLowerCase();
  const d = (description ?? "").toLowerCase();
  if (c === "linehaul" || c === "line_haul") return { line_type: "linehaul", preferred_item_names: ["Line Haul"] };
  if (c === "fuel_surcharge" || c === "fsc") return { line_type: "fsc", preferred_item_names: ["Fuel Surcharge"] };
  if (c.includes("detention") || d.includes("detention")) return { line_type: "detention", preferred_item_names: ["Sales-Detention Charge", "Detention"] };
  if (c.includes("layover") || d.includes("layover")) return { line_type: "layover", preferred_item_names: ["Layover Charge", "Layover"] };
  if (c.includes("lumper") || d.includes("lumper")) return { line_type: "lumper", preferred_item_names: ["Warehouse-Lumper Fee", "Lumper"] };
  if (c === "tonu" || d.includes("truck order not used")) return { line_type: "tonu", preferred_item_names: ["TONU"] };
  return { line_type: "accessorial", preferred_item_names: [] };
}

export class InvoiceChargeLinesDoNotFootError extends Error {
  readonly code = "invoice_charge_lines_do_not_foot";
  constructor(public readonly chargeLinesCents: number, public readonly rateTotalCents: number) {
    super(`invoice_charge_lines_do_not_foot: the load's charge lines total ${chargeLinesCents} cents but its rate is ${rateTotalCents} cents — fix the load's charges; the invoice is never plugged`);
    this.name = "InvoiceChargeLinesDoNotFootError";
  }
}

/** One invoice line per charge line (amount 0 lines skipped), footed to the load's rate to the cent. */
export function planInvoiceChargeLines(rows: LoadChargeLineRow[], rateTotalCents: number, loadNumber: string): PlannedInvoiceLine[] {
  const total = rows.reduce((sum, r) => sum + Number(r.amount_cents), 0);
  if (total !== rateTotalCents) throw new InvoiceChargeLinesDoNotFootError(total, rateTotalCents);
  return rows
    .filter((r) => Number(r.amount_cents) > 0)
    .map((r) => {
      const kind = chargeLineType(r.charge_code, r.description);
      const label = r.description?.trim() || r.display_name?.trim() || (kind.line_type === "linehaul" ? "Linehaul" : kind.line_type === "fsc" ? "Fuel surcharge" : r.charge_code);
      const preferred = r.display_name?.trim() ? [...kind.preferred_item_names, r.display_name.trim()] : kind.preferred_item_names;
      return {
        charge_line_id: r.id,
        line_type: kind.line_type,
        preferred_item_names: preferred,
        // LV-INV-UUID — customer-facing text carries the load number, never the load UUID.
        description: `${label} · Load ${loadNumber}`,
        amount_cents: Number(r.amount_cents),
      };
    });
}

/**
 * The line's item: a preferred-name item of this company whose income account IS the line's account, else the ONE active item
 * defaulting to that account. Two or more candidates -> null, and accounting.enforce_line_categorization (enforcing companies)
 * refuses the line naming the account — the item is chosen in the catalog, never guessed here.
 */
export async function resolveInvoiceLineItemId(
  client: Queryable,
  operatingCompanyId: string,
  accountId: string,
  preferredNames: string[]
): Promise<string | null> {
  for (const name of preferredNames) {
    const named = await client.query<{ id: string }>(
      `SELECT id::text FROM catalogs.items
        WHERE operating_company_id = $1::uuid AND item_name = $2 AND deactivated_at IS NULL AND default_income_account_id = $3::uuid
        LIMIT 2`,
      [operatingCompanyId, name, accountId]
    );
    if (named.rows.length === 1) return named.rows[0]!.id;
  }
  const onAccount = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.items
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND default_income_account_id = $2::uuid
      LIMIT 2`,
    [operatingCompanyId, accountId]
  );
  return onAccount.rows.length === 1 ? onAccount.rows[0]!.id : null;
}
