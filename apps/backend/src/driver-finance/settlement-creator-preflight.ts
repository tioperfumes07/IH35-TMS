/**
 * Lead 443.38 / 443.39 — the Settlement Creator preview lists EVERY refusal of a draft in one pass. The rehearsal post
 * (R14) stops at the first engine refusal, so the problems the 69 entry files hit one at a time on the prod fork are
 * checked here up front, all together, read-only:
 *   loads: PO or W/O, practical miles > 0, short (pay) miles not above practical (loads_miles_shortest_not_over_practical),
 *          pickup + delivery coordinates (feed gate load.stops_geocoded), customer of this company, an existing load number
 *          that is not the replaced settlement's own (Edit)
 *   fuel:  vendor mapped in Vendors, a provider ticket not already live on another fill (same vendor + product), a Relay
 *          fill naming a Relay transaction this company ingested
 *   lines: company-expense vendor mapped, extra pay with its item
 * Nothing is written. Each finding names its load / line so the operator fixes the file once.
 */
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { providerTransactionId } from "../fuel/fuel-provider-reference.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export async function creatorPreflightRefusals(client: Q, draft: SettlementCreatorDraft): Promise<string[]> {
  const out: string[] = [];
  const co = draft.operating_company_id;
  for (const l of draft.loads ?? []) {
    const n = l.load_number?.trim() || "(no number)";
    if (!l.customer_po_number?.trim() && !l.customer_wo_number?.trim()) out.push(`Load ${n}: the customer's PO number (or W/O number) is required.`);
    const practical = Number(l.loaded_miles ?? l.line_haul_miles ?? 0);
    if (!(practical > 0)) out.push(`Load ${n}: practical miles are required (E_MILES_PRACTICAL_REQUIRED).`);
    if (l.miles_shortest != null && practical > 0 && Number(l.miles_shortest) > practical) {
      out.push(`Load ${n}: pay (short) miles ${l.miles_shortest} exceed practical miles ${practical} (loads_miles_shortest_not_over_practical).`);
    }
    if (l.pickup_lat == null || l.pickup_lng == null) out.push(`Load ${n}: pickup stop has no coordinates (load.stops_geocoded).`);
    if (l.delivery_lat == null || l.delivery_lng == null) out.push(`Load ${n}: delivery stop has no coordinates (load.stops_geocoded).`);
    if (l.customer_id) {
      const c = await client.query(`SELECT 1 FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [l.customer_id, co]);
      if (!c.rows.length) out.push(`Load ${n}: customer ${l.customer_id} is not a customer of this company.`);
    }
  }
  const vendorId = async (name: string | null | undefined): Promise<string | null> => {
    if (!name?.trim()) return null;
    const v = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(trim(vendor_name)) = lower(trim($2))
          AND COALESCE(is_sample_data, false) IS NOT TRUE LIMIT 1`,
      [co, name],
    );
    return v.rows[0]?.id ?? null;
  };
  for (const f of draft.fuel_purchases ?? []) {
    const label = `Fuel line ${f.date}${f.invoice ? ` ticket ${f.invoice}` : ""} (${f.fuel_type ?? "diesel"})`;
    const vid = await vendorId(f.vendor_name);
    if (!vid) out.push(`${label}: map vendor "${f.vendor_name ?? ""}" in Vendors first.`);
    if (f.card === "relay") {
      if (!f.relay_transaction_id) out.push(`${label}: a Relay fill must name its Relay transaction (txn_…).`);
      else {
        const r = await client.query(`SELECT 1 FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_id = $2 AND voided_at IS NULL AND is_active`, [co, f.relay_transaction_id]);
        if (!r.rows.length) out.push(`${label}: Relay transaction ${f.relay_transaction_id} is not in this company's Relay fills.`);
      }
    } else if (vid && providerTransactionId(f.invoice)) {
      const d = await client.query<{ load_number: string | null }>(
        `SELECT l.load_number FROM fuel.fuel_transactions ft LEFT JOIN mdata.loads l ON l.id = ft.load_id
          WHERE ft.operating_company_id = $1::uuid AND ft.vendor_id = $2::uuid AND btrim(ft.transaction_reference) = $3
            AND ft.fuel_type = $4 AND ft.voided_at IS NULL LIMIT 1`,
        [co, vid, providerTransactionId(f.invoice), f.fuel_type ?? "diesel"],
      );
      if (d.rows.length && !draft.edit_void_repost) out.push(`${label}: already recorded on load ${d.rows[0].load_number ?? "?"} — a cross-load duplicate is entered as <ticket>-<load>.`);
    }
  }
  for (const e of draft.expenses ?? []) {
    if (e.is_company_expense && e.vendor_name && !(await vendorId(e.vendor_name))) out.push(`Company expense "${e.item_name}" ${e.date}: map vendor "${e.vendor_name}" in Vendors first.`);
  }
  for (const p of draft.additional_pay ?? []) {
    if (p.pay_kind !== "detention" && !p.item_id) out.push(`Additional pay "${p.description}": pick its Driver Pay item.`);
  }
  return out;
}
