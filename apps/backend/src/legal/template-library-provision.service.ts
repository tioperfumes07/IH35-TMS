// Legal Template Library — auto-provisioning (LEGAL-SEED-01).
//
// The library (`legal.contract_templates`) is per-entity: TRANSP / TRK / USMCA are fully
// independent, every row scoped by operating_company_id, and each active entity gets its OWN
// copy — rows are NEVER shared across entities. The canonical insert logic lives in
// ensureLegalTemplateLibrary (template-library.service.ts) and is reused verbatim here — this
// file only decides WHICH entities to provision and WHEN, never re-implements the insert.
//
// Two entry points:
//   • backfillLegalTemplateLibraries() — deploy/boot-time sweep of every active entity, so the
//     library works the moment the build deploys (no manual "Seed library" button click).
//   • provisionLegalTemplateLibraryForCompany() — single-entity provision, called from the
//     carrier-bootstrap path so a newly-activated entity (e.g. USMCA on launch) auto-gets its
//     library with zero special-casing.
//
// Idempotent: ensureLegalTemplateLibrary uses ON CONFLICT (operating_company_id, template_code,
// version) DO NOTHING, so re-running on every deploy adds zero duplicates and never mutates an
// existing row.

import type pg from "pg";
import { withLuciaBypass } from "../auth/db.js";
import { ensureLegalTemplateLibrary } from "./template-library.service.js";

type Queryable = { query: pg.PoolClient["query"] };

export type LegalLibraryCompanyResult = {
  operating_company_id: string;
  code: string;
  inserted: number;
  already_present: number;
  skipped_reason?: string;
};

export type LegalLibraryBackfillResult = {
  companies_seen: number;
  companies_seeded: number;
  companies_skipped: number;
  total_inserted: number;
  per_company: LegalLibraryCompanyResult[];
};

/**
 * Resolve an accountable actor user for a company: prefer an Owner with active access, fall back
 * to any active user with access. created_by_user_id / audit actor_user_id are FKs to
 * identity.users, so we never invent an id — a company with no accountable user is skipped
 * (logged), not seeded under a phantom actor.
 */
async function resolveAccountableActor(client: Queryable, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT u.id::text AS id
      FROM identity.users u
      JOIN org.user_company_access uca ON uca.user_id = u.id
      WHERE uca.company_id = $1
        AND uca.deactivated_at IS NULL
        AND u.deactivated_at IS NULL
      ORDER BY (u.role = 'Owner') DESC, u.created_at ASC, u.id ASC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Provision the canonical legal template library for ONE entity, in that entity's own scope.
 * Sets app.operating_company_id to the target so the insert is valid under enforced RLS (mirrors
 * the route mechanism; under a lucia-bypass txn it is harmless last-write-wins). Reuses
 * ensureLegalTemplateLibrary — NO insert logic here.
 *
 * The caller supplies a client already inside a transaction (withLuciaBypass, withCurrentUser, or
 * the carrier-bootstrap txn). The set_config is transaction-local (is_local=true).
 */
export async function provisionLegalTemplateLibraryForCompany(
  client: Queryable,
  args: { operatingCompanyId: string; actorUserId: string }
) {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [args.operatingCompanyId]);
  return ensureLegalTemplateLibrary(client, {
    operatingCompanyId: args.operatingCompanyId,
    actorUserId: args.actorUserId,
  });
}

/**
 * Deploy/boot-time backfill: provision the library for EVERY active entity. Each entity is
 * handled in its own short transaction so one entity's failure can never roll back another's, and
 * provisioning is fully entity-isolated (no cross-entity bleed). Inactive entities (USMCA pre-July
 * 2026, is_active=false) are intentionally excluded — they are auto-provisioned at activation via
 * the carrier-bootstrap hook.
 *
 * CONFIRM (TRK): provisions every active entity including the asset-holder TRK. If TRK should be
 * excluded, add `AND company_type = 'operating_carrier'` to the entity query below (one line).
 */
export async function backfillLegalTemplateLibraries(deps?: {
  logInfo?: (obj: Record<string, unknown>, msg: string) => void;
  logError?: (obj: Record<string, unknown>, msg: string) => void;
}): Promise<LegalLibraryBackfillResult> {
  const companies = await withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string; code: string }>(
      `
        SELECT id::text AS id, code
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
        ORDER BY code
      `
    );
    return res.rows;
  });

  const result: LegalLibraryBackfillResult = {
    companies_seen: companies.length,
    companies_seeded: 0,
    companies_skipped: 0,
    total_inserted: 0,
    per_company: [],
  };

  for (const company of companies) {
    try {
      await withLuciaBypass(async (client) => {
        const actorId = await resolveAccountableActor(client, company.id);
        if (!actorId) {
          result.companies_skipped += 1;
          result.per_company.push({
            operating_company_id: company.id,
            code: company.code,
            inserted: 0,
            already_present: 0,
            skipped_reason: "no_accountable_user",
          });
          deps?.logInfo?.(
            { company: company.code },
            "[STARTUP] legal-template-library backfill skipped — no accountable user for entity"
          );
          return;
        }
        const seed = await provisionLegalTemplateLibraryForCompany(client, {
          operatingCompanyId: company.id,
          actorUserId: actorId,
        });
        result.companies_seeded += 1;
        result.total_inserted += seed.inserted;
        result.per_company.push({
          operating_company_id: company.id,
          code: company.code,
          inserted: seed.inserted,
          already_present: seed.already_present,
        });
      });
    } catch (err) {
      result.companies_skipped += 1;
      result.per_company.push({
        operating_company_id: company.id,
        code: company.code,
        inserted: 0,
        already_present: 0,
        skipped_reason: `error:${String((err as Error)?.message ?? err)}`,
      });
      deps?.logError?.(
        { err, company: company.code },
        "[STARTUP] legal-template-library backfill failed for entity"
      );
    }
  }

  return result;
}
