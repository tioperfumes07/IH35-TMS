/**
 * CAT-RLS-BYPASS-01 — DB-STATE guard (pg_policy is ground truth, not migration SQL text).
 *
 * INVARIANT: every opco-scoped, RLS-enabled `catalogs.*` table must have at least one PERMISSIVE
 * policy whose USING grants the lucia bypass.
 *
 * WHY THIS IS A DB TEST AND NOT A STATIC ONE: the invariant is a property of the FINAL policy set
 * after all migrations run, and it is satisfied at TABLE level — permissive policies OR together,
 * so a table can satisfy it via a separate dedicated `*_lucia_bypass` policy rather than inside its
 * company_scope policy. A text scan of migrations cannot see that (it also cannot tell that a
 * FOR INSERT policy legitimately has no USING clause, nor that a later migration replaced an
 * earlier policy). A first attempt at a static guard produced ~120 findings, nearly all false.
 *
 * WHAT IT PREVENTS: when a table's USING checks only app.operating_company_id, the documented
 * `SET app.bypass_rls='lucia'` technique is INERT there and every audit of that table reads a
 * FALSE 0. That is how the WAVE-H1 audit recorded four populated catalogs as "Row count 0"
 * (driver_deduction_types 21, expense_categories 9, chart_of_accounts_seeds 9, escrow_types 3) and
 * specced a seed migration that would have duplicated live catalog data.
 *
 * EXCLUSIONS are by opco VALUES + policy text, never by column presence: tables with no
 * operating_company_id column (us_states, mexico_states, journal_entry_types) are already
 * `USING (true)` and read fine for everyone, so a bypass branch there would be redundant.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/**
 * Schemas whose false-zero has been remediated. This list RATCHETS: each wave of
 * RLS-BYPASS-SCHEMA-WIDE adds its schema here, and the invariant is asserted at ZERO violations for
 * every schema in it. It deliberately does NOT assert over all schemas at once — ~53 tables across
 * 19 other schemas are still outstanding, and a guard that is red on day one is a guard people
 * learn to skip (see FLT-02-SEED-DRIFT in docs/trackers/TRACKED-FINDINGS-2026-08-01.md for what
 * that costs). Remaining schemas are REPORTED, not failed, so progress stays visible.
 */
const REMEDIATED_SCHEMAS = [
  "catalogs", "qbo_archive", "accounting",
  "alerts", "analytics", "bank", "brokerupdate", "customer", "driver_finance", "driveralert",
  "forecast", "geofence", "maint", "maintenance", "mdata", "qbo", "safetydoc", "tasks", "utilization",
] as const;

/**
 * Tables in a schema that are RLS-enabled AND carry an operating_company_id column, but have NO
 * permissive policy whose USING grants the bypass. Parameterised by schema so the negative
 * direction can be proven against a purpose-built fixture table.
 */
const violationSqlFor = (schema: string) => `
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = '${schema}'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = '${schema}'
        AND col.table_name = c.relname
        AND col.column_name = 'operating_company_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid
        AND p.polpermissive
        AND p.polqual IS NOT NULL
        AND (
          pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_lucia_bypass%'
          OR pg_get_expr(p.polqual, p.polrelid) ILIKE '%bypass_rls%'
        )
    )
  ORDER BY c.relname
`;

run("catalogs.* RLS — every opco-scoped table grants the lucia bypass in USING", () => {
  let db: pg.Client;
  const fixture = `zz_rls_bypass_probe_${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    // buildPgClientConfig REQUIRES the connection string — calling it bare infers SSL from
    // `undefined` and the local ephemeral cluster rejects it ("server does not support SSL").
    db = new pg.Client(
      buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!)
    );
    await db.connect();
  });

  afterAll(async () => {
    await db.query(`DROP TABLE IF EXISTS catalogs.${fixture}`).catch(() => undefined);
    await db.end();
  });

  it.each(REMEDIATED_SCHEMAS)(
    "%s has ZERO tables whose bypass is inert (the real invariant)",
    async (schema) => {
      const res = await db.query<{ relname: string }>(violationSqlFor(schema));
      const offenders = res.rows.map((r) => r.relname);
      expect(
        offenders,
        `These ${schema} tables read a FALSE 0 under SET app.bypass_rls='lucia' — their USING has no ` +
          `bypass branch, so every audit of them is silently wrong:\n  ${offenders.join("\n  ")}`
      ).toEqual([]);
    }
  );

  it("reports how much of the schema-wide class is still outstanding (visibility, not a gate)", async () => {
    const res = await db.query<{ sch: string; n: string }>(`
      SELECT n.nspname AS sch, count(*)::text AS n
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relrowsecurity
        AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = n.nspname AND col.table_name = c.relname
            AND col.column_name = 'operating_company_id')
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND p.polpermissive AND p.polqual IS NOT NULL
            AND (pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_lucia_bypass%'
              OR pg_get_expr(p.polqual, p.polrelid) ILIKE '%bypass_rls%'))
      GROUP BY 1 ORDER BY count(*) DESC, 1
    `);
    // settlement.* is a RETIRE schema (canonical = driver_finance.*), so it is excluded from the
    // invariant rather than remediated — see 202611070000.
    const RETIRED = new Set(["settlement", "payroll"]);
    const remaining = res.rows.filter(
      (r) => !REMEDIATED_SCHEMAS.includes(r.sch as never) && !RETIRED.has(r.sch)
    );
    // Intentionally not an assertion on the count — this prints the remaining work so it cannot be
    // quietly forgotten, while the ratchet above holds the ground already taken.
    // eslint-disable-next-line no-console
    console.log(
      `[RLS-BYPASS-SCHEMA-WIDE] remediated=[${REMEDIATED_SCHEMAS.join(", ")}]; still outstanding: ` +
        (remaining.length === 0
          ? "none — the class is drained, promote this to a global assertion"
          : remaining.map((r) => `${r.sch}=${r.n}`).join(", "))
    );
    for (const s of REMEDIATED_SCHEMAS) {
      expect(res.rows.some((r) => r.sch === s)).toBe(false);
    }
  });

  it("DETECTS a table whose USING lacks the bypass branch (guard can actually fail)", async () => {
    // Negative direction: build the exact pre-fix shape and prove the query finds it.
    await db.query(`
      CREATE TABLE catalogs.${fixture} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL
      )
    `);
    await db.query(`ALTER TABLE catalogs.${fixture} ENABLE ROW LEVEL SECURITY`);
    await db.query(`
      CREATE POLICY company_scope ON catalogs.${fixture}
        FOR ALL TO ih35_app
        USING ((operating_company_id)::text = current_setting('app.operating_company_id', true))
    `);

    const withDefect = await db.query<{ relname: string }>(violationSqlFor("catalogs"));
    expect(withDefect.rows.map((r) => r.relname)).toContain(fixture);

    // And once the branch is added, it must NOT be flagged — no false positive on the fixed shape.
    await db.query(`DROP POLICY company_scope ON catalogs.${fixture}`);
    await db.query(`
      CREATE POLICY company_scope ON catalogs.${fixture}
        FOR ALL TO ih35_app
        USING (
          identity.is_lucia_bypass()
          OR ((operating_company_id)::text = current_setting('app.operating_company_id', true))
        )
    `);

    const afterFix = await db.query<{ relname: string }>(violationSqlFor("catalogs"));
    expect(afterFix.rows.map((r) => r.relname)).not.toContain(fixture);
  });

  it("satisfies the invariant via a SEPARATE bypass policy too (permissive policies OR together)", async () => {
    // A table can carry the bypass in a dedicated policy rather than inside company_scope. The
    // guard must accept that shape, or it would flag correct tables like catalogs.equipment_types.
    await db.query(`DROP POLICY IF EXISTS company_scope ON catalogs.${fixture}`);
    await db.query(`
      CREATE POLICY company_scope ON catalogs.${fixture}
        FOR ALL TO ih35_app
        USING ((operating_company_id)::text = current_setting('app.operating_company_id', true))
    `);
    await db.query(`
      CREATE POLICY ${fixture}_lucia_bypass ON catalogs.${fixture}
        FOR SELECT TO ih35_app
        USING (identity.is_lucia_bypass())
    `);

    const res = await db.query<{ relname: string }>(violationSqlFor("catalogs"));
    expect(res.rows.map((r) => r.relname)).not.toContain(fixture);
  });
});
