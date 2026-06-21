import type { FastifyInstance } from "fastify";
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

    return withCompanyScope(user.uuid, parsed.data.operating_company_id, async (clientRaw) => {
      const client = clientRaw as QClient;

      const totalRows = (await client.query(`SELECT count(*)::int AS n FROM catalogs.accounts`)).rows;
      const accounts_total = Number(totalRows[0]?.n ?? 0);

      // catalogs.accounts RLS is global, so this returns every entity's count. code resolved via LEFT JOIN
      // (null if the company is outside the caller's accessible scope — the uuid + count are still authoritative).
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

      const nullRows = (
        await client.query(`SELECT count(*)::int AS n FROM catalogs.accounts WHERE operating_company_id IS NULL`)
      ).rows;
      const null_operating_company = Number(nullRows[0]?.n ?? 0);

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

      const migApplied = async (like: string): Promise<boolean> => {
        const rows = (
          await client.query(`SELECT EXISTS(SELECT 1 FROM _system._schema_migrations WHERE filename LIKE $1) AS ok`, [like])
        ).rows;
        return Boolean(rows[0]?.ok);
      };
      const stage_migrations_applied = {
        stage1_entity_columns: await migApplied("%entity_columns_stage1%"),
        stage2_backfill_transp: await migApplied("%backfill_transp_stage2%"),
        stage3_decommingle_trk: await migApplied("%decommingle_trk_stage3%"),
        stage4_unique_index: await migApplied("%stage4%"),
        stage5_usmca_seed: await migApplied("%stage5%"),
      };

      const idxRows = (
        await client.query(
          `SELECT to_regclass('catalogs.uq_accounts_one_active_per_entity_purpose') IS NOT NULL AS ok`
        )
      ).rows;
      const stage4_index_exists = Boolean(idxRows[0]?.ok);

      return {
        accounts_total,
        by_operating_company,
        null_operating_company,
        by_system_purpose,
        system_purpose_set_count,
        stage_migrations_applied,
        stage4_index_exists,
      };
    });
  });
}
