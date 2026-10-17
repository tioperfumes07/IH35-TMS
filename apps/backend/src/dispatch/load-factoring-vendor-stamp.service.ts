/**
 * LEAD 443.197 1a — the ONE narrow, audited writer that stamps mdata.loads.factoring_company_vendor_id on a load that
 * was booked without one, FROM the evidence of the load's own live factoring advance.
 *
 * factoring_company_vendor_id is LINKAGE (which factor bought the load's invoice), not money: nothing here re-prices,
 * re-bills or posts. Edit Load (update-load.service.ts) cannot carry it — the column is not in its SCALAR_COLUMNS and a
 * settled load is edit-locked — so a stamp goes through this writer instead, never a bare UPDATE.
 *
 * Refuses (returns status "refused" + reason, writes nothing) when:
 *  - the load is not this company's live load, or already carries a factoring vendor (never overwrites);
 *  - the load has no live advance (live invoice with source_load_id = the load → live accounting.factoring_advances);
 *  - its live advances disagree on the factor (more than one vendor);
 *  - the advance's factor is not an ACTIVE vendor of the SAME company (never cross-company);
 *  - the load's customer carries a factor that is NOT the advance's factor (the Lead lists these; nothing is guessed).
 * A customer with NO factor does not refuse: the advance itself is the evidence.
 * Every stamp writes audit 'dispatch.load.factoring_vendor_stamped' with the advance ids, the vendor and the reason.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type FactoringVendorStampResult = {
  load_id: string;
  load_number: string | null;
  status: "stamped" | "refused";
  vendor_id: string | null;
  advance_ids: string[];
  customer_factor_vendor_id: string | null;
  reason: string | null;
};

export const FACTORING_VENDOR_STAMP_EVENT = "dispatch.load.factoring_vendor_stamped";

export async function stampLoadFactoringVendorFromAdvance(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; actorUserId: string; reason: string }
): Promise<FactoringVendorStampResult> {
  const reason = String(args.reason ?? "").trim();
  if (reason.length < 10) throw new Error("factoring_vendor_stamp_requires_reason");
  const base: FactoringVendorStampResult = {
    load_id: args.loadId, load_number: null, status: "refused", vendor_id: null, advance_ids: [], customer_factor_vendor_id: null, reason: null,
  };
  const refuse = (why: string, extra: Partial<FactoringVendorStampResult> = {}): FactoringVendorStampResult => ({ ...base, ...extra, status: "refused", reason: why });

  const load = (
    await client.query<{ load_number: string | null; customer_id: string | null; factoring_company_vendor_id: string | null }>(
      `SELECT load_number, customer_id::text, factoring_company_vendor_id::text
         FROM mdata.loads
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND soft_deleted_at IS NULL
        FOR UPDATE`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows[0];
  if (!load) return refuse("load not found in this company (or voided)");
  base.load_number = load.load_number;
  if (load.factoring_company_vendor_id) return refuse("load already carries a factoring vendor");

  const adv = await client.query<{ id: string; vendor_id: string | null }>(
    `SELECT DISTINCT fa.id::text, fa.factoring_company_vendor_id::text AS vendor_id
       FROM accounting.invoices i
       JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
      WHERE i.source_load_id = $1::uuid AND i.operating_company_id = $2::uuid AND i.voided_at IS NULL
        AND fa.operating_company_id = $2::uuid AND fa.voided_at IS NULL
      ORDER BY 1`,
    [args.loadId, args.operatingCompanyId]
  );
  const advanceIds = adv.rows.map((r) => r.id);
  if (!advanceIds.length) return refuse("no live factoring advance on the load");
  const vendors = [...new Set(adv.rows.map((r) => r.vendor_id ?? ""))];
  if (vendors.length !== 1 || !vendors[0]) return refuse("the load's live advances do not name exactly one factor", { advance_ids: advanceIds });
  const vendorId = vendors[0];

  const vendorOk = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`,
    [vendorId, args.operatingCompanyId]
  );
  if (!vendorOk.rows.length) return refuse("the advance's factor is not an active vendor of this company", { advance_ids: advanceIds, vendor_id: vendorId });

  const cust = load.customer_id
    ? (
        await client.query<{ factor: string | null }>(
          `SELECT factoring_company_vendor_id::text AS factor FROM mdata.get_customer_same_company($1::uuid, $2::uuid)`,
          [load.customer_id, args.operatingCompanyId]
        )
      ).rows[0]?.factor ?? null
    : null;
  if (cust && cust !== vendorId) {
    return refuse("the customer's factor disagrees with the advance's factor", { advance_ids: advanceIds, vendor_id: vendorId, customer_factor_vendor_id: cust });
  }

  const upd = await client.query<{ id: string }>(
    `UPDATE mdata.loads SET factoring_company_vendor_id = $3::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND factoring_company_vendor_id IS NULL
      RETURNING id::text`,
    [args.loadId, args.operatingCompanyId, vendorId]
  );
  if (upd.rows.length !== 1) return refuse("load changed under the stamp", { advance_ids: advanceIds, vendor_id: vendorId });

  await appendCrudAudit(client as never, args.actorUserId, FACTORING_VENDOR_STAMP_EVENT, {
    resource_type: "mdata.loads", resource_id: args.loadId, load_id: args.loadId, load_number: load.load_number,
    operating_company_id: args.operatingCompanyId, column: "factoring_company_vendor_id", old_value: null, new_value: vendorId,
    evidence: "live_factoring_advance", advance_ids: advanceIds, customer_factor_vendor_id: cust, reason,
  });
  return { ...base, status: "stamped", vendor_id: vendorId, advance_ids: advanceIds, customer_factor_vendor_id: cust, reason: null };
}
