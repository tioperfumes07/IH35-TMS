// ACCT-CoA-ASYMMETRY — grouped diff report (READ-ONLY, owner-eyes).
//
// Surfaces how the active entity's postable CoA diverges from the frozen-entity pool.
// NEVER posts, writes, merges, or creates accounts — every statement is a SELECT over
// catalogs.accounts joined to org.companies (Rule 19: reserve/holdback/retainage untouched).
//
// Cross-entity read uses app.bypass_rls='lucia' inside withCurrentUser (Rule 10) because the
// report compares the active entity against frozen entities. Gated Owner/Admin only in the route.
// Allowlisted in verify-steps/84-verify-mdata-entity-scope.baseline.json.

import { withCurrentUser } from "../auth/db.js";

const FROZEN_ENTITY_CODES = ["TRK", "TRANSP"] as const;

export type CoaAsymmetryEntityCounts = {
  entity_code: string;
  postable: number;
  total_active: number;
};

export type CoaAsymmetryTypeBreakdown = {
  account_type: string;
  count: number;
};

export type CoaAsymmetrySampleRow = {
  account_id: string;
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
    active_only_postable: number;
    frozen_absent_on_active: number;
  };
  active_only_by_type: CoaAsymmetryTypeBreakdown[];
  sample_active_only: CoaAsymmetrySampleRow[];
};

const num = (v: unknown): number => Number(v ?? 0);

export async function getCoaAsymmetryReport(input: {
  userId: string;
  operatingCompanyId: string;
}): Promise<CoaAsymmetryReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    // Resolve entity code for the active company
    const entityRes = await client.query<{ code: string }>(
      `SELECT code FROM org.companies WHERE id = $1 LIMIT 1`,
      [input.operatingCompanyId],
    );
    const activeCode = entityRes.rows[0]?.code ?? "ACTIVE";
    const allCodes = [activeCode, ...FROZEN_ENTITY_CODES];

    // Postable counts per entity (active + frozen, for reference)
    const countsRes = await client.query(
      `
        SELECT c.code AS entity_code,
               count(*) FILTER (WHERE a.is_postable AND a.deactivated_at IS NULL)::bigint AS postable,
               count(*) FILTER (WHERE a.deactivated_at IS NULL)::bigint AS total_active
          FROM catalogs.accounts a
          JOIN org.companies c ON c.id = a.operating_company_id
         WHERE c.code = ANY($1::text[])
         GROUP BY c.code
         ORDER BY c.code = $2 DESC, postable DESC
      `,
      [allCodes, activeCode],
    );

    // Diff: accounts postable on the active entity but absent from ALL frozen entities
    // (active-unique); and frozen entity accounts absent from the active entity (gaps to fill)
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
        active AS (SELECT account_number FROM postable WHERE entity_code = $2),
        frozen AS (SELECT DISTINCT account_number FROM postable WHERE entity_code != $2)
        SELECT
          (SELECT count(*)::bigint FROM active a
            WHERE NOT EXISTS (SELECT 1 FROM frozen f WHERE f.account_number = a.account_number))
            AS active_only_postable,
          (SELECT count(*)::bigint FROM frozen f
            WHERE NOT EXISTS (SELECT 1 FROM active a WHERE a.account_number = f.account_number))
            AS frozen_absent_on_active
      `,
      [allCodes, activeCode],
    );

    // Active-only accounts by type (accounts postable on active entity but absent on all frozen)
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
             AND c.code = ANY($1::text[])
             AND a.account_number IS NOT NULL
        ),
        frozen_numbers AS (
          SELECT DISTINCT account_number FROM postable WHERE entity_code != $2
        )
        SELECT p.account_type,
               count(*)::bigint AS count
          FROM postable p
         WHERE p.entity_code = $2
           AND NOT EXISTS (
                 SELECT 1 FROM frozen_numbers f WHERE f.account_number = p.account_number
               )
         GROUP BY p.account_type
         ORDER BY count DESC
      `,
      [allCodes, activeCode],
    );

    // Sample list of active-only postable accounts (present on active, absent on all frozen)
    const sampleRes = await client.query(
      `
        WITH postable AS (
          SELECT a.id AS account_id,
                 a.account_number,
                 a.account_name,
                 a.account_type,
                 c.code AS entity_code
            FROM catalogs.accounts a
            JOIN org.companies c ON c.id = a.operating_company_id
           WHERE a.is_postable = true
             AND a.deactivated_at IS NULL
             AND c.code = ANY($1::text[])
             AND a.account_number IS NOT NULL
        ),
        frozen_numbers AS (
          SELECT DISTINCT account_number FROM postable WHERE entity_code != $2
        )
        SELECT p.account_id, p.account_number, p.account_name, p.account_type, p.entity_code
          FROM postable p
         WHERE p.entity_code = $2
           AND NOT EXISTS (
                 SELECT 1 FROM frozen_numbers f WHERE f.account_number = p.account_number
               )
         ORDER BY p.account_type, p.account_number
         LIMIT 20
      `,
      [allCodes, activeCode],
    );

    return {
      read_only: true,
      disclaimer:
        "Owner-eyes grouped diff only — no account is created, merged, reclassified, or deactivated. " +
        "Reserve/holdback/retainage accounts are owner-manual (Rule 19). Standardization is a CPA/owner decision.",
      generated_at: new Date().toISOString(),
      entity_codes: allCodes as readonly string[],
      postable_by_entity: countsRes.rows.map((row) => ({
        entity_code: String(row.entity_code),
        postable: num(row.postable),
        total_active: num(row.total_active),
      })),
      diff_summary: {
        active_only_postable: num(diffRes.rows[0]?.active_only_postable),
        frozen_absent_on_active: num(diffRes.rows[0]?.frozen_absent_on_active),
      },
      active_only_by_type: typeRes.rows.map((row) => ({
        account_type: String(row.account_type),
        count: num(row.count),
      })),
      sample_active_only: sampleRes.rows.map((row) => ({
        account_id: String(row.account_id),
        account_number: String(row.account_number),
        account_name: String(row.account_name),
        account_type: String(row.account_type),
        entity_code: String(row.entity_code),
      })),
    };
  });
}
