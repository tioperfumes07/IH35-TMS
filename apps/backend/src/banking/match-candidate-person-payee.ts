/**
 * D071 (register row 247) — Banking › Categorize / Match › candidate payee labels.
 *
 * The Match drawer ran EVERY candidate payee through formatPersonName, so organisation names were
 * re-cased as if they were people ("XYZ TRUCKING LLC" → "Xyz Trucking Llc") while the owner ruling
 * (443.266-A) keeps proper case for PEOPLE only and organisation names exactly as stored. The drawer
 * could not tell the two apart because the candidate carried no person/organisation fact.
 *
 * This read-only decorator supplies that fact from the canonical master: a vendor-kind counterparty is
 * a PERSON when its mdata.vendors row is a driver payee (driver_id set, or vendor_type 'Driver'), and a
 * counterparty id that is itself an mdata.drivers row is a person. Same-company only. Display metadata —
 * it reads no money, writes nothing and changes no ranking.
 */
type Queryable = { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type PersonFlaggable = {
  counterparty_id?: string | null;
  counterparty_kind?: string | null;
  counterparty_is_person?: boolean;
};

/** Pure: stamp counterparty_is_person on every candidate from a resolved id set. */
export function applyCounterpartyPersonFlag<T extends PersonFlaggable>(candidates: T[], personIds: ReadonlySet<string>): T[] {
  return candidates.map((c) => ({
    ...c,
    counterparty_is_person: Boolean(c.counterparty_id && personIds.has(String(c.counterparty_id))),
  }));
}

export async function resolvePersonCounterpartyIds(
  client: Queryable,
  operatingCompanyId: string,
  counterpartyIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(counterpartyIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return new Set();
  const res = await client.query(
    `SELECT v.id::text AS id
       FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
        AND v.id::text = ANY($2::text[])
        AND (v.driver_id IS NOT NULL OR lower(COALESCE(v.vendor_type, '')) = 'driver')
     UNION
     SELECT d.id::text AS id
       FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.id::text = ANY($2::text[])`,
    [operatingCompanyId, ids],
  );
  return new Set(res.rows.map((r) => String(r.id)));
}
