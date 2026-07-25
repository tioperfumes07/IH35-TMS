/**
 * ACCT-ECON-05 — canonical vendor identity resolution for A/P surfaces.
 *
 * A/P rows live in TWO identifier spaces on prod (Neon lucia 2026-07-25):
 *   - accounting.bills.vendor_id  = the QBO vendor id (text, e.g. '472') on 16211 of 16212 bills
 *   - accounting.vendor_credits.vendor_id = mdata.vendors.id (uuid), because the vendor picker and
 *     POST /vendor-credits both resolve against mdata.vendors
 * mdata.vendors.qbo_vendor_id bridges them (2779 of 2788 vendors mapped; 16211 bills join through it).
 *
 * Without this bridge every vendor-scoped bill read keyed by an mdata uuid returned ZERO rows, so a
 * vendor credit could never be applied to a real bill and a vendor's A/P tab looked empty.
 *
 * ENTITY SCOPE IS MANDATORY: qbo_vendor_id is unique per company but NOT globally (510 values repeat
 * across companies on prod), so every resolution is filtered by operating_company_id.
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * SQL for the set of identifiers that all mean "this vendor" inside one operating company:
 * the value supplied by the caller, plus its counterpart across the mdata↔QBO bridge in either
 * direction. Both parameters are compared as text — never cast the caller value to uuid, because a
 * QBO id ('472') would make the cast RAISE instead of simply not matching.
 */
export function vendorIdentitySetSql(companyParam: number, vendorParam: number): string {
  return `(
    SELECT ident FROM (
      SELECT $${vendorParam}::text AS ident
      UNION
      SELECT v.qbo_vendor_id
        FROM mdata.vendors v
       WHERE v.operating_company_id = $${companyParam}::uuid
         AND v.id::text = $${vendorParam}::text
         AND v.qbo_vendor_id IS NOT NULL
      UNION
      SELECT v.id::text
        FROM mdata.vendors v
       WHERE v.operating_company_id = $${companyParam}::uuid
         AND v.qbo_vendor_id = $${vendorParam}::text
    ) vendor_identity
    WHERE ident IS NOT NULL
  )`;
}

/** Runtime form of {@link vendorIdentitySetSql} for callers that compare in JS. */
export async function resolveVendorIdentitySet(
  client: Queryable,
  operatingCompanyId: string,
  vendorId: string
): Promise<string[]> {
  const res = await client.query<{ ident: string }>(
    `SELECT ident FROM ${vendorIdentitySetSql(1, 2)} identity_set`,
    [operatingCompanyId, vendorId]
  );
  const idents = new Set(res.rows.map((row) => row.ident).filter(Boolean));
  idents.add(vendorId);
  return [...idents];
}
