// ACCT-CoA-ASYMMETRY — grouped diff report (READ-ONLY, owner-eyes).
//
// Surfaces how TRK / TRANSP / USMCA postable CoAs diverge. NEVER posts, writes, merges,
// or creates accounts — every statement is a SELECT over catalogs.accounts
// joined to org.companies for grouping only (Rule 19: reserve/holdback/retainage untouched).
//
// Cross-entity read uses app.bypass_rls='lucia' inside withCurrentUser (Rule 10) because the
// report compares all three entities in one response. No operating_company_id filter is applied
// to the diff itself — presence per entity IS the report.

import { withCurrentUser } from "../auth/db.js";

const ENTITY_CODES = ["TRK", "TRANSP", "USMCA"] as const;

export type CoaAsymmetryEntityCounts = {
  entity_code: string;
  postable: number;
  total_active: number;
};

export type CoaAsymmetryTypeBreakdown = {
  account_type: string;
  trk_only_postable: number;
};

export type CoaAsymmetrySampleRow = {
  account_number: string;
  account_name: string;
  account_type: string;
  entity_code: string;
};

export type CoaAsymmetryReport = {
  read_only: true;
  disclaimer: string;
  generated_at: string;
  entity_codes: readonly string[];
  postable_by_entity: CoaAsymmetryEntityCounts[];
  diff_summary: {
    trk_postable_absent_on_transp: number;
    transp_postable_absent_on_trk: number;
  };
  trk_only_postable_by_type: CoaAsymmetryTypeBreakdown[];
  sample_trk_only_postable: CoaAsymmetrySampleRow[];
};

const num = (v: unknown): number => Number(v ?? 0);

export async function getCoaAsymmetryReport(input: { userId: string }): Promise<CoaAsymmetryReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const countsRes = await client.query(
      `
        SELECT c.code AS entity_code,
               count(*) FILTER (WHERE a.is_postable AND a.deactivated_at IS NULL)::bigint AS postable,
               count(*) FILTER (WHERE a.deactivated_at IS NULL)::bigint AS total_active
          FROM catalogs.accounts a
          JOIN org.companies c ON c.id = a.operating_company_id
         WHERE c.code = ANY($1::text[])
         GROUP BY c.code
         ORDER BY postable DESC
      `,
      [ENTITY_CODES],
    );

    const diffRes = await client.query(
      `
        WITH postable AS (
          SELECT a.account_number,
                 c.code AS entity_code
            FROM catalogs.accounts a
            JOIN org.companies c ON c.id = a.operating_company_id
           WHERE a.is_postable = true
             AND a.deactivated_at IS NULL
             AND c.code = ANY($1::text[])
             AND a.account_number IS NOT NULL
        ),
        trk AS (SELECT account_number FROM postable WHERE entity_code = 'TRK'),
        transp AS (SELECT account_number FROM postable WHERE entity_code = 'TRANSP')
        SELECT
          (SELECT count(*)::bigint FROM trk t
            WHERE NOT EXISTS (SELECT 1 FROM transp x WHERE x.account_number = t.account_number)) AS trk_absent_transp,
          (SELECT count(*)::bigint FROM transp t
            WHERE NOT EXISTS (SELECT 1 FROM trk x WHERE x.account_number = t.account_number)) AS transp_absent_trk
      `,
      [ENTITY_CODES],
    );

    const typeRes = await client.query(
      `
        WITH postable AS (
          SELECT a.account_number,
                 a.account_type,
                 c.code AS entity_code
            FROM catalogs.accounts a
            JOIN org.companies c ON c.id = a.operating_company_id
           WHERE a.is_postable = true
             AND a.deactivated_at IS NULL
             AND c.code IN ('TRK', 'TRANSP')
             AND a.account_number IS NOT NULL
        )
        SELECT p.account_type,
               count(*)::bigint AS trk_only_postable
          FROM postable p
         WHERE p.entity_code = 'TRK'
           AND NOT EXISTS (
                 SELECT 1 FROM postable x
                  WHERE x.entity_code = 'TRANSP'
                    AND x.account_number = p.account_number
               )
         GROUP BY p.account_type
         ORDER BY trk_only_postable DESC
      `,
    );

    const sampleRes = await client.query(
      `
        WITH postable AS (
          SELECT a.account_number,
                 a.account_name,
                 a.account_type,
                 c.code AS entity_code
            FROM catalogs.accounts a
            JOIN org.companies c ON c.id = a.operating_company_id
           WHERE a.is_postable = true
             AND a.deactivated_at IS NULL
             AND c.code IN ('TRK', 'TRANSP')
             AND a.account_number IS NOT NULL
        )
        SELECT p.account_number,
               p.account_name,
               p.account_type,
               p.entity_code
          FROM postable p
         WHERE p.entity_code = 'TRK'
           AND NOT EXISTS (
                 SELECT 1 FROM postable x
                  WHERE x.entity_code = 'TRANSP'
                    AND x.account_number = p.account_number
               )
         ORDER BY p.account_type, p.account_number
         LIMIT 15
      `,
    );

    return {
      read_only: true,
      disclaimer:
        "Owner-eyes grouped diff only — no account is created, merged, reclassified, or deactivated. " +
        "Reserve/holdback/retainage accounts are owner-manual (Rule 19). Standardization is a CPA/owner decision.",
      generated_at: new Date().toISOString(),
      entity_codes: ENTITY_CODES,
      postable_by_entity: countsRes.rows.map((row) => ({
        entity_code: String(row.entity_code),
        postable: num(row.postable),
        total_active: num(row.total_active),
      })),
      diff_summary: {
        trk_postable_absent_on_transp: num(diffRes.rows[0]?.trk_absent_transp),
        transp_postable_absent_on_trk: num(diffRes.rows[0]?.transp_absent_trk),
      },
      trk_only_postable_by_type: typeRes.rows.map((row) => ({
        account_type: String(row.account_type),
        trk_only_postable: num(row.trk_only_postable),
      })),
      sample_trk_only_postable: sampleRes.rows.map((row) => ({
        account_number: String(row.account_number),
        account_name: String(row.account_name),
        account_type: String(row.account_type),
        entity_code: String(row.entity_code),
      })),
    };
  });
}
