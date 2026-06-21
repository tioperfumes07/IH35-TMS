import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

// COA-ENTITY-PROBE — read-only Path-B diagnostic (the Samsara-probe pattern, for accounting).
// GUARD ground-truth on Path-B applied-state that GET /catalogs/accounts hides (it does not project
// operating_company_id). READ-ONLY: SELECT/count/EXISTS/to_regclass only — NO writes, NO flags, NO posting.
// Owner/Administrator only. Reusable verification gate for every remaining Path-B stage.

type QClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

function canReadProbe(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

export async function registerCoaEntityProbeRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/coa-entity-probe", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReadProbe(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // Entity-account state under company scope (catalogs.accounts RLS is global, so counts cover all
    // entities; org.companies code resolves within the caller's accessible scope, null otherwise).
    const accounts = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (clientRaw) => {
      const client = clientRaw as QClient;

      const accounts_total = Number(
        (await client.query(`SELECT count(*)::int AS n FROM catalogs.accounts`)).rows[0]?.n ?? 0
      );

      const byOc = (
        await client.query(
          `
          SELECT a.operating_company_id::text AS operating_company_id, c.code AS code, count(*)::int AS n
          FROM catalogs.accounts a
          LEFT JOIN org.companies c ON c.id = a.operating_company_id
          GROUP BY a.operating_company_id, c.code
          ORDER BY n DESC
        `
        )
      ).rows;
      const by_operating_company = byOc.map((r: Record<string, unknown>) => ({
        operating_company_id: (r.operating_company_id as string | null) ?? null,
        code: (r.code as string | null) ?? null,
        n: Number(r.n),
      }));

      const null_operating_company = Number(
        (await client.query(`SELECT count(*)::int AS n FROM catalogs.accounts WHERE operating_company_id IS NULL`)).rows[0]?.n ?? 0
      );

      const bySp = (
        await client.query(
          `
          SELECT system_purpose, count(*)::int AS n
          FROM catalogs.accounts
          WHERE system_purpose IS NOT NULL
          GROUP BY system_purpose
          ORDER BY n DESC
        `
        )
      ).rows;
      const by_system_purpose = bySp.map((r: Record<string, unknown>) => ({
        system_purpose: r.system_purpose as string,
        n: Number(r.n),
      }));
      const system_purpose_set_count = by_system_purpose.reduce((sum: number, r: { n: number }) => sum + r.n, 0);

      // STAGE-4 converge-then-constrain gate: rows that would make the partial unique index
      // (operating_company_id, system_purpose) WHERE system_purpose IS NOT NULL AND deactivated_at IS NULL FAIL.
      // Empty => converged => Stage 4 safe to build. Non-empty => decommingle/dedup first.
      const dupRows = (
        await client.query(
          `
          SELECT a.operating_company_id::text AS operating_company_id, a.system_purpose, count(*)::int AS n
          FROM catalogs.accounts a
          WHERE a.system_purpose IS NOT NULL AND a.deactivated_at IS NULL
          GROUP BY a.operating_company_id, a.system_purpose
          HAVING count(*) > 1
          ORDER BY n DESC
        `
        )
      ).rows;
      const system_purpose_duplicates_active = dupRows.map((r: Record<string, unknown>) => ({
        operating_company_id: (r.operating_company_id as string | null) ?? null,
        system_purpose: r.system_purpose as string,
        n: Number(r.n),
      }));

      const stage4_index_exists = Boolean(
        (await client.query(`SELECT to_regclass('catalogs.uq_accounts_one_active_per_entity_purpose') IS NOT NULL AS ok`)).rows[0]?.ok
      );

      return {
        accounts_total,
        by_operating_company,
        null_operating_company,
        by_system_purpose,
        system_purpose_set_count,
        system_purpose_duplicates_active,
        stage4_safe_to_constrain: system_purpose_duplicates_active.length === 0,
        stage4_index_exists,
      };
    });

    // Applied-migration ledger lives in _system._schema_migrations, which ih35_app cannot read under RLS;
    // read it via lucia bypass exactly like the /healthz migration-ledger check (read-only system metadata).
    const stage_migrations_applied = await withLuciaBypass(async (clientRaw) => {
      const client = clientRaw as QClient;
      const migApplied = async (like: string): Promise<boolean> => {
        const rows = (
          await client.query(`SELECT EXISTS(SELECT 1 FROM _system._schema_migrations WHERE filename LIKE $1) AS ok`, [like])
        ).rows;
        return Boolean(rows[0]?.ok);
      };
      return {
        stage1_entity_columns: await migApplied("%entity_columns_stage1%"),
        stage2_backfill_transp: await migApplied("%backfill_transp_stage2%"),
        stage3_decommingle_trk: await migApplied("%decommingle_trk_stage3%"),
        stage4_unique_index: await migApplied("%stage4%"),
        stage5_usmca_seed: await migApplied("%stage5%"),
      };
    });

    return { ...accounts, stage_migrations_applied };
  });
}
