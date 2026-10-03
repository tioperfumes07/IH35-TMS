#!/usr/bin/env node
/**
 * ONE ENTITY COLUMN (Lead ROUND 342 phase 5 — CC-1, migration 202615330400).
 * Owner ruling: operating_company_id is canonical; tenant_id is retired. Both were a uuid FK to org.companies — one
 * column built twice — and the patch taping them together (4 CHECKs + a sync trigger) is what this program removes.
 *
 * LIVE (fails closed without a database):
 *   1. No relation carries a column named tenant_id, outside the named DEBT below.
 *   2. No RLS policy expression reads tenant_id, outside DEBT tables.
 *   3. No CHECK equates two company columns, outside DEBT tables.
 *   4. insurance.type_catalog keeps its policy USING (true) — see SHARED_BY_DESIGN.
 * STATIC:
 *   5. The last migration touching it (re)creates the event trigger trg_refuse_tenant_id_column on ddl_command_end.
 *   6. audit.tg_audit_row (203 triggers, ONE body) writes audit.row_changes.operating_company_id.
 *
 * DEBT — ceiling = the list's length, shrink-only (a name may be removed, never added; a new tenant_id anywhere else
 * fails). Two kinds, each named with its phase:
 *   PHASE_1 (CC-1): the 17 tenant-only tables 202615330400 renames. Exempt ONLY while that migration is unapplied on
 *     the database being read (ih35_migrations.applied_migrations) — so the guard passes before the deploy and
 *     requires them gone after it, with no list edit needed in between.
 *   PHASE_2 (CC-2): the 17 double-scoped tables still carrying both columns until CC-2's phase 2 drops tenant_id.
 *     A PHASE_2 entry that has lost the column is reported as removable (shrink the list in the next PR); it does not
 *     fail the push, because CC-2's PR runs this gate BEFORE its own migration reaches the database — refusing on
 *     green there would deadlock the very PR that removes it.
 * The ceiling reaches 0 when CC-2's phase 2 lands.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "tenant_id columns / policies / CHECKs are live schema facts — must fail closed, never skip";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-one-entity-column";
export const PHASE_1_MIGRATION = "202615330400_r342_one_entity_column_rename.sql";
/** CC-2 step 2c drops tenant_id from the PHASE_2 tables; once it is applied, PHASE_2 allows nothing (ceiling 0). */
export const PHASE_2_MIGRATION = "202615330800_r342_step2c_drop_tenant_id.sql";

export const PHASE_1 = [
  "accounting.bill_unit_allocation", "accounting.coa_account", "accounting.ps_category", "accounting.ps_item",
  "accounting.pse_posting_policy", "accounting.vendor_subtype_pse_map", "audit.row_changes",
  "factoring.canonical_factor_agreements", "factoring.v_factor_reserve_balance", "insurance.type_catalog",
  "integrity.anomalies", "integrity.anomaly", "integrity.driver_metric", "integrity.metric", "maint.part",
  "maint.pm_schedule", "mdata.asset_status_history", "mdata.assets",
];
export const PHASE_2 = [
  "factoring.bank_match_suggestion", "factoring.batch", "factoring.customer_factor_assignment", "factoring.factor",
  "factoring.letter_of_release", "factoring.reserve_movement", "insurance.claim", "insurance.coi_request",
  "insurance.lawsuit", "insurance.payment_schedule", "insurance.policy", "insurance.policy_unit",
  "insurance.refund_obligation", "maintenance.internal_labor_log", "master_data.customer_terms_history",
  "mdata.mx_permits", "mdata.mx_tolls_ledger",
];
const CEILING = PHASE_1.length + PHASE_2.length; // 35 — shrink-only

/**
 * insurance.type_catalog: its policy is USING (true) / WITH CHECK (true) ON PURPOSE. It is ONE insurance-type catalog
 * shared by all three carriers (TRANSP, TRK, USMCA) — a policy type is a policy type in every carrier. The column was
 * renamed (harmless: the policy never reads it), but a later "scope everything" sweep must NOT add a company predicate
 * to it, or two carriers lose every insurance type the third created. Changing this needs an owner ruling.
 */
export const SHARED_BY_DESIGN = { "insurance.type_catalog": "insurance_type_catalog_shared_rw" };

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function staticFailures({ files, read }) {
  const failures = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  const last = (re) => { let hit = null; for (const f of sorted) { const s = stripSql(read(f)); if (re.test(s)) hit = { file: f, sql: s }; } return hit; };
  const ev = last(/trg_refuse_tenant_id_column/i);
  if (!ev || !/CREATE\s+EVENT\s+TRIGGER\s+trg_refuse_tenant_id_column\s+ON\s+ddl_command_end/i.test(ev.sql)) {
    failures.push(`RULE 5: ${ev?.file ?? "no migration"} — the event trigger trg_refuse_tenant_id_column ON ddl_command_end must be (re)created by the last migration touching it; it is what keeps the column from coming back.`);
  }
  // The function's DEFINITION — not a trigger that merely calls it (`EXECUTE FUNCTION audit.tg_audit_row()` in a later
  // CREATE TRIGGER is a use, and must not be read as the latest body).
  const au = last(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+audit\.tg_audit_row\s*\(/i);
  if (!au || !/INSERT\s+INTO\s+audit\.row_changes\s*\(\s*operating_company_id/i.test(au.sql)) {
    failures.push(`RULE 6: ${au?.file ?? "no migration"} — audit.tg_audit_row (behind 203 audit triggers) must write audit.row_changes.operating_company_id.`);
  }
  return failures;
}

export function liveFailures({ tenantRelations, tenantPolicies, equatingChecks, sharedPolicies, phase1Applied, phase2Applied = false }) {
  const failures = [];
  const notes = [];
  const allowed = new Set([...(phase2Applied ? [] : PHASE_2), ...(phase1Applied ? [] : PHASE_1)]);
  for (const rel of tenantRelations) {
    if (!allowed.has(rel)) {
      failures.push(`RULE 1: ${rel} carries a column named tenant_id${PHASE_1.includes(rel) ? ` although ${PHASE_1_MIGRATION} is applied` : PHASE_2.includes(rel) ? ` although ${PHASE_2_MIGRATION} is applied` : ""}. operating_company_id is the one entity column.`);
    }
  }
  for (const p of tenantPolicies) {
    if (!allowed.has(p.rel)) failures.push(`RULE 2: policy ${p.name} on ${p.rel} reads tenant_id. Scope on operating_company_id.`);
  }
  for (const c of equatingChecks) {
    if (!allowed.has(c.rel)) failures.push(`RULE 3: CHECK ${c.name} on ${c.rel} equates two company columns (${c.def}) — the patch this program removes. Do not add one.`);
  }
  for (const [rel, pol] of Object.entries(SHARED_BY_DESIGN)) {
    const s = sharedPolicies.find((x) => x.rel === rel && x.name === pol);
    if (s && (s.qual !== "true" || (s.check !== null && s.check !== "true"))) {
      failures.push(`RULE 4: ${rel} policy ${pol} is no longer USING (true): it is a catalog shared by all three carriers on purpose — never scope it without an owner ruling.`);
    }
  }
  if (!phase2Applied) for (const rel of PHASE_2) if (!tenantRelations.includes(rel)) notes.push(`PHASE_2 entry ${rel} no longer carries tenant_id — remove it from PHASE_2 (ceiling drops).`);
  return { failures, notes };
}

export function run() {
  return staticFailures({ files: readdirSync(MIG), read: (f) => readFileSync(resolve(MIG, f), "utf8") });
}

async function measure(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const rel = await client.query(`
    SELECT format('%s.%s', n.nspname, c.relname) AS rel
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE a.attname = 'tenant_id' AND NOT a.attisdropped AND a.attnum > 0 AND c.relkind IN ('r','p','v','m','f')
       AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1`);
  const pol = await client.query(`
    SELECT polname AS name, polrelid::regclass::text AS rel
      FROM pg_policy
     WHERE (COALESCE(pg_get_expr(polqual, polrelid), '') || ' ' || COALESCE(pg_get_expr(polwithcheck, polrelid), '')) ~ '\\mtenant_id\\M'`);
  const chk = await client.query(`
    SELECT conname AS name, conrelid::regclass::text AS rel, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE contype = 'c' AND pg_get_constraintdef(oid) ~ '\\m(operating_company_id|tenant_id|company_id)\\M\\s*=\\s*\\m(operating_company_id|tenant_id|company_id)\\M'`);
  const shared = await client.query(`
    SELECT polrelid::regclass::text AS rel, polname AS name, pg_get_expr(polqual, polrelid) AS qual, pg_get_expr(polwithcheck, polrelid) AS check
      FROM pg_policy WHERE polrelid = to_regclass('insurance.type_catalog')`);
  const applied = await client.query(
    `SELECT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations WHERE name = $1) AS ok`, [PHASE_1_MIGRATION]);
  const applied2 = await client.query(
    `SELECT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations WHERE name = $1) AS ok`, [PHASE_2_MIGRATION]);
  await client.query("ROLLBACK");
  return {
    tenantRelations: rel.rows.map((r) => r.rel),
    tenantPolicies: pol.rows,
    equatingChecks: chk.rows,
    sharedPolicies: shared.rows,
    phase1Applied: applied.rows[0].ok,
    phase2Applied: applied2.rows[0].ok,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const base = { tenantRelations: [...PHASE_2], tenantPolicies: [], equatingChecks: [{ name: "mx_permits_check", rel: "mdata.mx_permits", def: "CHECK ((operating_company_id = tenant_id))" }], sharedPolicies: [{ rel: "insurance.type_catalog", name: "insurance_type_catalog_shared_rw", qual: "true", check: "true" }], phase1Applied: true };
    const cases = [
      ["post-rename state passes", liveFailures(base).failures.length === 0],
      ["new tenant_id column fails", liveFailures({ ...base, tenantRelations: [...PHASE_2, "accounting.new_table"] }).failures.some((f) => f.startsWith("RULE 1"))],
      ["phase-1 table still carrying it after apply fails", liveFailures({ ...base, tenantRelations: [...PHASE_2, "mdata.assets"] }).failures.some((f) => f.startsWith("RULE 1"))],
      ["phase-2 table still carrying it after 2c applies fails", liveFailures({ ...base, phase2Applied: true }).failures.some((f) => f.startsWith("RULE 1") && f.includes(PHASE_2_MIGRATION))],
      ["phase-2 equating CHECK after 2c applies fails", liveFailures({ ...base, tenantRelations: [], phase2Applied: true }).failures.some((f) => f.startsWith("RULE 3"))],
      ["2c applied and clean passes with no notes", (() => { const r = liveFailures({ ...base, tenantRelations: [], equatingChecks: [], phase2Applied: true }); return r.failures.length === 0 && r.notes.length === 0; })()],
      ["phase-1 table before apply passes", liveFailures({ ...base, tenantRelations: [...PHASE_2, ...PHASE_1], phase1Applied: false }).failures.length === 0],
      ["tenant policy outside debt fails", liveFailures({ ...base, tenantPolicies: [{ name: "p", rel: "maint.part" }] }).failures.some((f) => f.startsWith("RULE 2"))],
      ["equating CHECK outside debt fails", liveFailures({ ...base, equatingChecks: [{ name: "c", rel: "maint.part", def: "CHECK ((operating_company_id = tenant_id))" }] }).failures.some((f) => f.startsWith("RULE 3"))],
      ["scoping the shared catalog fails", liveFailures({ ...base, sharedPolicies: [{ rel: "insurance.type_catalog", name: "insurance_type_catalog_shared_rw", qual: "(operating_company_id = x)", check: "true" }] }).failures.some((f) => f.startsWith("RULE 4"))],
      ["phase-2 table gone is a note, not a failure", (() => { const r = liveFailures({ ...base, tenantRelations: PHASE_2.slice(1) }); return r.failures.length === 0 && r.notes.length === 1; })()],
      ["ceiling is the debt list", CEILING === 35],
      ...(() => {
        const def = "CREATE OR REPLACE FUNCTION audit.tg_audit_row() RETURNS trigger AS $f$ BEGIN INSERT INTO audit.row_changes (operating_company_id, op) VALUES (NULL, TG_OP); RETURN NULL; END $f$ LANGUAGE plpgsql; CREATE EVENT TRIGGER trg_refuse_tenant_id_column ON ddl_command_end EXECUTE FUNCTION x();";
        const use = "CREATE TRIGGER trg_audit_t AFTER INSERT ON s.t FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();";
        const bad = "CREATE OR REPLACE FUNCTION audit.tg_audit_row() RETURNS trigger AS $f$ BEGIN INSERT INTO audit.row_changes (tenant_id, op) VALUES (NULL, TG_OP); RETURN NULL; END $f$ LANGUAGE plpgsql;";
        const mk = (m) => ({ files: Object.keys(m), read: (f) => m[f] });
        return [
          ["RULE 6: a later trigger that only CALLS tg_audit_row is not its definition", !staticFailures(mk({ "202601010000_a.sql": def, "202601020000_b.sql": use })).some((f) => f.startsWith("RULE 6"))],
          ["RULE 6: a later REDEFINITION without operating_company_id fails", staticFailures(mk({ "202601010000_a.sql": def, "202601020000_b.sql": bad })).some((f) => f.startsWith("RULE 6"))],
        ];
      })(),
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client);
    const { failures, notes } = liveFailures(m);
    const all = [...sf, ...failures];
    for (const n of notes) console.log(`${LABEL}: NOTE — ${n}`);
    if (all.length) {
      console.error(`${LABEL}: FAIL\n`);
      for (const f of all) console.error(`  ${f}\n`);
      process.exitCode = 1;
    } else {
      const debt = m.tenantRelations.length;
      console.log(`${LABEL}: OK — tenant_id relations ${debt} (debt ceiling ${CEILING}: PHASE_1 ${m.phase1Applied ? "applied, 0 allowed" : "pending apply"}, PHASE_2 ${m.phase2Applied ? "applied, 0 allowed" : `${PHASE_2.length} pending ${PHASE_2_MIGRATION}`}), tenant policies outside debt 0, equating CHECKs outside debt 0, type_catalog shared by design.`);
    }
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
