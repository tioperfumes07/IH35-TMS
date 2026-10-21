import type { ScopedQueryClient } from "../auth/operating-company-scope.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import type { ForecastEntryInput } from "./cash-forecast-manual.routes.js";

/** The single forecast snapshot writer. Caller owns the scoped transaction. No money posting. */
export async function createCashForecastEntry(client: ScopedQueryClient, userId: string, input: ForecastEntryInput) {
  let refLabel = input.ref_label ?? null;
  if (input.ref_kind === "unit") {
    if (!input.ref_external_id) throw Object.assign(new Error("Select a unit."), { statusCode: 400 });
    const unit = await client.query<{ label: string }>(
      `SELECT unit_number AS label FROM mdata.units WHERE id = $1::uuid AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
      [input.ref_external_id, input.operating_company_id],
    );
    if (!unit.rows[0]) throw Object.assign(new Error("Unit does not belong to this operating company."), { statusCode: 400 });
    refLabel = unit.rows[0].label;
  }
  let partyName = input.party_name ?? null;
  let partyRefLabel = input.party_ref_label ?? null;
  if (input.party_ref_kind === "driver") {
    if (!input.party_ref_id) throw Object.assign(new Error("Select a driver."), { statusCode: 400 });
    const driver = await client.query<{ label: string }>(
      `SELECT trim(concat_ws(' ', first_name, last_name)) AS label
         FROM mdata.drivers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1`,
      [input.party_ref_id, input.operating_company_id],
    );
    if (!driver.rows[0]) throw Object.assign(new Error("Driver does not belong to this operating company."), { statusCode: 400 });
    partyName = driver.rows[0].label;
    partyRefLabel = driver.rows[0].label;
  } else if (input.party_ref_kind === "customer") {
    if (!input.party_ref_id) throw Object.assign(new Error("Select a customer."), { statusCode: 400 });
    const customer = await client.query<{ label: string }>(
      `SELECT customer_name AS label FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [input.party_ref_id, input.operating_company_id],
    );
    if (!customer.rows[0]) throw Object.assign(new Error("Customer does not belong to this operating company."), { statusCode: 400 });
    partyName = customer.rows[0].label;
    partyRefLabel = customer.rows[0].label;
  } else if (input.party_ref_kind === "vendor") {
    if (!input.party_ref_id) throw Object.assign(new Error("Select a vendor."), { statusCode: 400 });
    const vendor = await client.query<{ label: string }>(
      `SELECT vendor_name AS label FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [input.party_ref_id, input.operating_company_id],
    );
    if (!vendor.rows[0]) throw Object.assign(new Error("Vendor does not belong to this operating company."), { statusCode: 400 });
    partyName = vendor.rows[0].label;
    partyRefLabel = vendor.rows[0].label;
  }
  const res = await client.query(
    `INSERT INTO forecast.cash_entries
       (operating_company_id, entry_date, direction, amount_cents, party_name, invoice_no,
        category, memo, ref_kind, ref_label, ref_external_id,
        load_ref_id, load_ref_label, unit_ref_label, customer_ref_label,
        party_ref_kind, party_ref_id, party_ref_label,
        created_by_user_id, updated_by_user_id)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::uuid,$19::uuid)
     RETURNING *`,
    [input.operating_company_id, input.entry_date, input.direction, input.amount_cents,
     partyName, input.invoice_no ?? null, input.category ?? null, input.memo ?? null,
     input.ref_kind ?? null, refLabel, input.ref_external_id ?? null,
     input.load_ref_id ?? null, input.load_ref_label ?? null, input.unit_ref_label ?? null,
     input.customer_ref_label ?? null, input.party_ref_kind ?? null, input.party_ref_id ?? null,
     partyRefLabel, userId]
  );
  const created = res.rows[0];
  await appendCrudAudit(client, userId, "forecast.cash_entry.created", {
    resource_id: created?.id,
    resource_type: "forecast.cash_entries",
  });
  return created;
}
