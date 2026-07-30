// LEASE-02 reader — the queries that make mdata.lease_contracts / _groups / _units and
// mdata.asset_leases live schema rather than dead schema (§10a linkage law).
//
// Read-only. Creating and amending a lease is an owner action through Legal, and posting rent /
// rental income needs a per-deal ASC 842 election plus owner-designated accounts, so neither is done
// here. What this provides is the linkage the law requires: forward contract -> group -> line ->
// asset -> companies, and reverse asset -> every lease and contract line naming it.
//
// Every query is entity-scoped by the caller's company GUC through withCompanyScope, and the tables
// are FORCE RLS with a bilateral header policy, so Trucking sees the leases it is lessor on while each
// operating company sees the ones it is lessee on.

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type LeaseContractRow = {
  id: string;
  lessor_code: string | null;
  lessee_code: string | null;
  contract_format: string;
  asc842_classification: string;
  status: string;
  commenced_on: string | null;
  ended_on: string | null;
  contract_instance_id: string | null;
  line_count: number;
  monthly_total_cents: string;
};

/**
 * Contracts this entity is party to — as lessee (its own leases) or as lessor (what it leases out).
 * monthly_total_cents is summed from the STORED per-line amounts, never recomputed from a group total,
 * so the figure shown is the figure agreed.
 */
export async function listLeaseContracts(
  client: Queryable,
  operatingCompanyId: string
): Promise<LeaseContractRow[]> {
  const res = await client.query<LeaseContractRow>(
    `
      SELECT
        lc.id::text                                   AS id,
        lessor.code                                   AS lessor_code,
        lessee.code                                   AS lessee_code,
        lc.contract_format,
        lc.asc842_classification,
        lc.status,
        lc.commenced_on::text                         AS commenced_on,
        lc.ended_on::text                             AS ended_on,
        lc.contract_instance_id::text                 AS contract_instance_id,
        COUNT(lcu.id) FILTER (WHERE lcu.is_active)::int          AS line_count,
        COALESCE(SUM(lcu.monthly_amount_cents)
                 FILTER (WHERE lcu.is_active), 0)::bigint        AS monthly_total_cents
      FROM mdata.lease_contracts lc
      LEFT JOIN org.companies lessor ON lessor.id = lc.lessor_company_id
      LEFT JOIN org.companies lessee ON lessee.id = lc.lessee_company_id
      LEFT JOIN mdata.lease_contract_units lcu
             ON lcu.lease_contract_id = lc.id AND lcu.deactivated_at IS NULL
      WHERE lc.is_active
        AND (lc.operating_company_id = $1::uuid OR lc.lessor_company_id = $1::uuid)
      GROUP BY lc.id, lessor.code, lessee.code
      ORDER BY lc.created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

/** The groups and their per-asset lines for one contract — forward drill contract -> group -> line. */
export async function getLeaseContractLines(
  client: Queryable,
  operatingCompanyId: string,
  contractId: string
) {
  const res = await client.query(
    `
      SELECT
        g.id::text                       AS group_id,
        g.asset_group_label,
        g.allocation_method,
        g.group_total_cents::bigint      AS group_total_cents,
        lcu.id::text                     AS line_id,
        lcu.unit_id::text                AS unit_id,
        lcu.equipment_id::text           AS equipment_id,
        COALESCE(u.unit_number, e.equipment_number) AS asset_number,
        lcu.monthly_amount_cents::bigint AS monthly_amount_cents
      FROM mdata.lease_contract_units lcu
      JOIN mdata.lease_contracts lc ON lc.id = lcu.lease_contract_id
      LEFT JOIN mdata.lease_contract_groups g ON g.id = lcu.lease_contract_group_id
      LEFT JOIN mdata.units u      ON u.id = lcu.unit_id
      LEFT JOIN mdata.equipment e  ON e.id = lcu.equipment_id
      WHERE lcu.lease_contract_id = $2::uuid
        AND lcu.is_active
        AND (lc.operating_company_id = $1::uuid OR lc.lessor_company_id = $1::uuid)
      ORDER BY g.asset_group_label NULLS LAST, asset_number
    `,
    [operatingCompanyId, contractId]
  );
  return res.rows;
}

/**
 * REVERSE LINKAGE — every lessee a given asset is leased to, and what it costs each of them.
 *
 * This is the query the single currently_leased_to_company_id column could never answer: one unit,
 * more than one lessee. Trucking leases the same truck to Transportation AND USMCA, so an asset row
 * here legitimately returns two rows.
 */
export async function getAssetLeaseParties(
  client: Queryable,
  operatingCompanyId: string,
  assetId: string
) {
  const res = await client.query(
    `
      SELECT
        lessee.code                       AS lessee_code,
        lessor.code                       AS lessor_code,
        al.commenced_on::text             AS commenced_on,
        al.ended_on::text                 AS ended_on,
        lcu.monthly_amount_cents::bigint  AS monthly_amount_cents,
        lc.contract_format,
        lc.asc842_classification
      FROM mdata.asset_leases al
      LEFT JOIN org.companies lessee ON lessee.id = al.lessee_company_id
      LEFT JOIN org.companies lessor ON lessor.id = al.lessor_company_id
      LEFT JOIN mdata.lease_contract_units lcu
             ON (lcu.unit_id = al.unit_id OR lcu.equipment_id = al.equipment_id)
            AND lcu.is_active
      LEFT JOIN mdata.lease_contracts lc
             ON lc.id = lcu.lease_contract_id
            AND lc.lessee_company_id = al.lessee_company_id
      WHERE al.is_active
        AND al.deactivated_at IS NULL
        AND (al.unit_id = $2::uuid OR al.equipment_id = $2::uuid)
        AND (al.operating_company_id = $1::uuid OR al.lessor_company_id = $1::uuid)
      ORDER BY lessee.code
    `,
    [operatingCompanyId, assetId]
  );
  return res.rows;
}
