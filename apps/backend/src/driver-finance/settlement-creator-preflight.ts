/**
 * Lead 443.38 / 443.39 — the Settlement Creator preview lists EVERY refusal of a draft in one pass. The rehearsal post
 * (R14) stops at the first engine refusal, so the problems the 69 entry files hit one at a time on the prod fork are
 * checked here up front, all together, read-only:
 *   loads: PO or W/O, short (pay) miles > 0 (443.192), practical miles > 0, short (pay) miles not above practical (loads_miles_shortest_not_over_practical),
 *          pickup + delivery coordinates (feed gate load.stops_geocoded), customer of this company, an existing load number
 *          that is not the replaced settlement's own (Edit)
 *   fuel:  vendor mapped in Vendors, a provider ticket not already live on another fill (same vendor + product), a Relay
 *          fill naming a Relay transaction this company ingested
 *   lines: company-expense vendor mapped, extra pay with its item
 * Nothing is written. Each finding names its load / line so the operator fixes the file once.
 */
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { findLiveFuelByProviderTransactionId, fuelPurchaseAlreadyRecordedMessage, providerTransactionId } from "../fuel/fuel-provider-reference.js";
import { findReceivedCardFillToAdopt } from "./creator-received-fill-adoption.js";
import { CREATOR_SHORT_MILES_REQUIRED_MESSAGE, findCreatorCustomer } from "./settlement-creator-seed-loads.js";
import { creatorLoadMiles } from "./settlement-creator-empty-pay.js";
import { creatorLineLoadNumber } from "./settlement-creator-line-load.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import { CREATOR_TRAILER_REQUIRED_MESSAGE, creatorLoadTrailerEquipmentId, creatorTrailerChoice } from "./creator-trailer-choice.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export async function creatorPreflightRefusals(client: Q, draft: SettlementCreatorDraft): Promise<string[]> {
  const out: string[] = [];
  const co = draft.operating_company_id;
  // LEAD 443.109 — a load is never born without its trailer: the document names it, or the operator marks none.
  // Only loads this post will BOOK are born here; a load the Edit adopts already exists.
  const typedNumbers = (draft.loads ?? []).map((l) => l.load_number?.trim()).filter((n): n is string => !!n);
  if (draft.seed_dispatched_loads !== false && typedNumbers.length) {
    const existing = await client.query<{ load_number: string }>(
      `SELECT load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL AND load_number = ANY($2::text[])`,
      [co, typedNumbers],
    );
    const born = typedNumbers.filter((n) => !existing.rows.some((r) => r.load_number === n));
    if (born.length) {
      const choice = await creatorTrailerChoice(client, draft);
      if (!choice) out.push(`Loads ${born.join(", ")}: ${CREATOR_TRAILER_REQUIRED_MESSAGE}`);
      else {
        try {
          await creatorLoadTrailerEquipmentId(client, co, choice);
        } catch (err) {
          if (!(err instanceof SettlementCreatorError)) throw err;
          out.push(`Loads ${born.join(", ")}: ${err.message}`);
        }
      }
    }
  }
  for (const l of draft.loads ?? []) {
    const n = l.load_number?.trim() || "(no number)";
    if (!l.customer_po_number?.trim() && !l.customer_wo_number?.trim()) out.push(`Load ${n}: the customer's PO number (or W/O number) is required.`);
    // LEAD 443.192 — the document's miles are the SHORT (pay) miles, required for a per-mile driver; practical is its own
    // figure, required to book (creatorLoadMiles — neither is a copy of the other).
    const miles = creatorLoadMiles(l);
    const practical = miles.miles_practical;
    if (miles.miles_shortest == null && !draft.salaried) out.push(`Load ${n}: ${CREATOR_SHORT_MILES_REQUIRED_MESSAGE}`);
    if (practical == null) {
      out.push(`Load ${n}: practical miles are required to book the load (E_MILES_PRACTICAL_REQUIRED) — a separate figure in Loaded mi (co) (or Historical / Google), never a copy of the short pay miles.`);
    }
    if (miles.miles_shortest != null && practical != null && miles.miles_shortest > practical) {
      out.push(`Load ${n}: pay (short) miles ${miles.miles_shortest} exceed practical miles ${practical} (loads_miles_shortest_not_over_practical).`);
    }
    if (l.pickup_lat == null || l.pickup_lng == null) out.push(`Load ${n}: pickup stop has no coordinates (load.stops_geocoded).`);
    if (l.delivery_lat == null || l.delivery_lng == null) out.push(`Load ${n}: delivery stop has no coordinates (load.stops_geocoded).`);
    // 443.110 G3 — the document's customer must match a customer of this company (no oldest-customer fallback). A load
    // an Edit adopts from the replaced settlement keeps its own customer and is not re-booked.
    const adopted =
      draft.edit_void_repost &&
      (await client.query(`SELECT 1 FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL`, [co, n])).rows.length > 0;
    if (!adopted) {
      const cust = await findCreatorCustomer(client as never, co, l);
      if (!("id" in cust)) out.push(cust.message);
    }
  }
  // 443.110 G5 — every reimbursement, reimbursable expense, additional-pay line and fuel fill resolves to a load: a typed
  // number of this draft or of this company, else the draft load covering its date / the settlement's only load.
  const draftLoadNumbers = new Set((draft.loads ?? []).map((x) => x.load_number?.trim()).filter(Boolean) as string[]);
  const lineLoad = async (line: { label: string; load_id?: string | null; load_number?: string | null; date?: string | null }) => {
    let num: string | null;
    try {
      num = creatorLineLoadNumber(draft.loads ?? [], line);
    } catch (err) {
      if (err instanceof SettlementCreatorError) { out.push(err.message); return; }
      throw err;
    }
    if (line.load_id) {
      const r = await client.query(`SELECT 1 FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`, [line.load_id, co]);
      if (!r.rows.length) out.push(`${line.label}: load ${line.load_id} is not a load of this company.`);
      return;
    }
    if (num && !draftLoadNumbers.has(num)) {
      const r = await client.query(`SELECT 1 FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL`, [co, num]);
      if (!r.rows.length) out.push(`${line.label}: load ${num} is not a load of this company.`);
    }
  };
  for (const r of draft.reimbursements ?? []) {
    if (r.amount_cents > 0) await lineLoad({ label: `Reimbursement "${r.description ?? ""}"`, load_number: r.load_number });
  }
  for (const e of draft.expenses ?? []) {
    if (e.is_reimbursable && e.amount_cents > 0) await lineLoad({ label: `Reimbursable expense "${e.item_name}"`, load_id: e.load_id, load_number: e.load_number, date: e.date });
  }
  for (const p of draft.additional_pay ?? []) {
    if (p.amount_cents > 0) await lineLoad({ label: `Additional pay "${p.description ?? ""}"`, load_number: p.load_number });
  }
  for (const f of draft.fuel_purchases ?? []) {
    if (f.load_number?.trim() && !draftLoadNumbers.has(f.load_number.trim())) {
      await lineLoad({ label: `Fuel line ${f.date}${f.invoice ? ` ticket ${f.invoice}` : ""}`, load_number: f.load_number });
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
      // 443.110 G12 — the SAME lookup and the SAME message as the post's refusal (refuseDuplicateProviderTransaction): the
      // base invoice is one purchase (a reference carrying a load suffix is that same invoice), shown with its existing load.
      const existing = await findLiveFuelByProviderTransactionId(client as never, {
        operatingCompanyId: co,
        vendorId: vid,
        reference: f.invoice,
        fuelType: f.fuel_type ?? "diesel",
      });
      // LEAD 443.116 #1 — a card fill already RECEIVED (imported, posted on receipt) on this line's own load is ADOPTED by
      // the post (findReceivedCardFillToAdopt, the same rule the post uses); every other existing receipt is refused.
      const lineLoadId = f.load_id
        ?? (f.load_number?.trim()
          ? ((await client.query(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL LIMIT 1`, [co, f.load_number.trim()])).rows[0]?.id as string | undefined) ?? null
          : null);
      const adoptable = existing && vid
        ? await findReceivedCardFillToAdopt(client as never, { operatingCompanyId: co, vendorId: vid, reference: f.invoice, fuelType: f.fuel_type ?? "diesel", loadId: lineLoadId })
        : null;
      if (existing && !draft.edit_void_repost && !adoptable) {
        out.push(`${label}: ${fuelPurchaseAlreadyRecordedMessage(providerTransactionId(f.invoice)!, existing.id, existing.load_number)}`);
      }
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
