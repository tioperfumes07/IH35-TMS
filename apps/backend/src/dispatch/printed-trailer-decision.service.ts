// RULING 443.90 #4 (CC-3) — every trailer number PRINTED on a document (accounting.expenses.document_trailer_number) gets a
// decision, never left open:
//   1. ours in the equipment master (equipment_number / license plate / VIN suffix) -> trailer_id on the expense + its lines
//   2. a Samsara trailer (GET /fleet/trailers, live) with no equipment row -> listed with its Samsara id (443.80: no seat creates
//      equipment; the owner maps it) — reported, not guessed
//   3. not ours anywhere -> a CUSTOMER / shipper trailer (drop & hook): one dispatch.non_owned_trailers row per number and
//      customer, the load says trailer_source 'customer' and points at it, the expense points at it; the printed number stays.
// Owner / Administrator, dry_run supported, audited per decision.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type PrintedTrailerDecision = {
  trailer_number: string; expenses: number; loads: number;
  decision: "company_equipment" | "samsara_trailer_unmapped" | "customer_trailer";
  detail: string;
};

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();

export async function decidePrintedTrailers(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; samsaraTrailers?: Array<{ id: string; raw: Record<string, unknown> }> }
): Promise<PrintedTrailerDecision[]> {
  const co = input.operatingCompanyId;
  const open = (await client.query<{ n: string; expense_ids: string[]; load_ids: string[] }>(
    `SELECT upper(trim(e.document_trailer_number)) AS n, array_agg(e.id::text) AS expense_ids,
            array_agg(DISTINCT e.load_id::text) FILTER (WHERE e.load_id IS NOT NULL) AS load_ids
       FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.document_trailer_number IS NOT NULL
        AND e.trailer_id IS NULL AND e.non_owned_trailer_id IS NULL
      GROUP BY 1 ORDER BY 1`, [co])).rows;
  let samsara = input.samsaraTrailers;
  if (!samsara && open.length) {
    const cfg = await getSamsaraConfigForCompany(client as never, co);
    const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null });
    samsara = await api.listTrailers();
  }
  const out: PrintedTrailerDecision[] = [];
  for (const o of open) {
    const loadIds = o.load_ids ?? [];
    const eq = (await client.query<{ id: string; equipment_number: string }>(
      `SELECT e.id::text, e.equipment_number FROM mdata.equipment e
        WHERE COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $1::uuid AND e.deactivated_at IS NULL
          AND (upper(e.equipment_number) = $2 OR upper(coalesce(e.license_plate, '')) = $2 OR (length($2) >= 6 AND upper(coalesce(e.vin, '')) LIKE '%' || $2))
        LIMIT 2`, [co, o.n])).rows;
    if (eq.length === 1) {
      await client.query(`UPDATE accounting.expenses SET trailer_id = $2::uuid, updated_at = now() WHERE id = ANY($1::uuid[]) AND trailer_id IS NULL`, [o.expense_ids, eq[0]!.id]);
      await client.query(`UPDATE accounting.expense_lines SET trailer_id = $2::uuid WHERE expense_id = ANY($1::uuid[]) AND trailer_id IS NULL`, [o.expense_ids, eq[0]!.id]);
      await client.query(`UPDATE mdata.loads SET trailer_source = 'company', updated_at = now() WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid AND trailer_source IS NULL`, [loadIds, co]);
      out.push({ trailer_number: o.n, expenses: o.expense_ids.length, loads: loadIds.length, decision: "company_equipment", detail: `equipment ${eq[0]!.equipment_number}` });
      await appendCrudAudit(client as never, input.actorUserId, "dispatch.printed_trailer.decided", { operating_company_id: co, trailer_number: o.n, decision: "company_equipment", equipment_id: eq[0]!.id, expense_ids: o.expense_ids }, "info", "443.90");
      continue;
    }
    const st = (samsara ?? []).find((t) => [t.raw.name, t.raw.licensePlate].some((x) => norm(x) === o.n) || (o.n.length >= 6 && norm(t.raw.vin).endsWith(o.n)));
    if (st) {
      out.push({ trailer_number: o.n, expenses: o.expense_ids.length, loads: loadIds.length, decision: "samsara_trailer_unmapped",
        detail: `Samsara trailer ${st.id} "${String(st.raw.name ?? "")}" has no equipment row (443.80: the owner maps it)` });
      continue;
    }
    // Not ours anywhere: the customer's / shipper's trailer. One record per number and customer.
    const customers = (await client.query<{ customer_id: string | null; ids: string[] }>(
      `SELECT l.customer_id::text, array_agg(l.id::text) AS ids FROM mdata.loads l
        WHERE l.id = ANY($1::uuid[]) AND l.operating_company_id = $2::uuid GROUP BY 1`, [loadIds, co])).rows;
    for (const c of customers.length ? customers : [{ customer_id: null, ids: [] as string[] }]) {
      const existing = (await client.query<{ id: string }>(
        `SELECT id::text FROM dispatch.non_owned_trailers WHERE operating_company_id = $1::uuid AND upper(trailer_number) = $2
            AND counterparty_type = 'customer' AND counterparty_id IS NOT DISTINCT FROM $3::uuid AND voided_at IS NULL LIMIT 1`,
        [co, o.n, c.customer_id])).rows[0];
      const nid = existing?.id ?? (await client.query<{ id: string }>(
        `INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id, notes, is_active, is_sample_data, created_by_user_id)
         VALUES ($1::uuid, $2, 'customer', $3::uuid, $4, true, false, $5::uuid) RETURNING id::text`,
        [co, o.n, c.customer_id, "443.90 #4: printed on the load's documents; not in the equipment master nor Samsara — customer / shipper trailer (drop & hook)", input.actorUserId])).rows[0]!.id;
      await client.query(`UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $2::uuid, updated_at = now() WHERE id = ANY($1::uuid[]) AND operating_company_id = $3::uuid`, [c.ids, nid, co]);
      await client.query(`UPDATE accounting.expenses SET non_owned_trailer_id = $2::uuid, updated_at = now()
                           WHERE id = ANY($1::uuid[]) AND (load_id = ANY($3::uuid[]) OR $4::boolean)`, [o.expense_ids, nid, c.ids, customers.length === 0]);
      await appendCrudAudit(client as never, input.actorUserId, "dispatch.printed_trailer.decided", { operating_company_id: co, trailer_number: o.n, decision: "customer_trailer", non_owned_trailer_id: nid, customer_id: c.customer_id, load_ids: c.ids }, "info", "443.90");
    }
    out.push({ trailer_number: o.n, expenses: o.expense_ids.length, loads: loadIds.length, decision: "customer_trailer",
      detail: `not in the equipment master (${eq.length} match) nor Samsara (${(samsara ?? []).length} trailers checked) — customer trailer on ${customers.length} customer(s)` });
  }
  return out;
}
