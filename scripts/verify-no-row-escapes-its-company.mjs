#!/usr/bin/env node
/**
 * NO ROW ESCAPES ITS COMPANY (Lead 10-03 "THE ORPHANS ARE NOT FIXED, THEY ARE INVISIBLE" — CC-1, migration 202615350100).
 *
 * A row with a NULL operating_company_id is invisible to every company-scoped query, guard, trial balance and to the
 * purge, and it disarms every MATCH SIMPLE composite same-entity FK on that row. A company-scoped guard cannot see the
 * rows that escaped a company — so THIS guard runs with NO company filter, by construction (standing rule from the
 * same order: every defect-counting guard runs unscoped or says in writing why a company filter is sound).
 *
 * LIVE (fails closed without a database), every base table that has an operating_company_id column:
 *   1. zero rows with operating_company_id NULL — except SHARED_BY_DESIGN (a NULL company there MEANS "every company",
 *      each reasoned below) and the named DEBT.
 *   2. zero accounting.expense_lines with expense_id NULL (a line with no parent) beyond the named DEBT.
 * STATIC:
 *   3. the last migration touching each (re)declares the closures: expense_lines_parent_required,
 *      bill_lines_company_required, bill_lines_bill_id_fkey, load_charge_lines_company_required,
 *      load_charge_lines_load_id_fkey.
 *
 * DEBT — committed here, shrink-only: a count that GROWS fails; an entry that reaches 0 FAILS until removed (a debt list
 * that cannot shrink is not a ratchet). All three are purge population: their parents were deleted (the 2026-09-30
 * owner purge and earlier imports), so they can be neither attached nor stamped — setting a company on them arms the
 * composite FK to a parent that no longer exists. They leave through the governed purge under an owner AUTH. Ceiling 0
 * once they do.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a NULL company is a live data fact — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-no-row-escapes-its-company";

/** NULL operating_company_id means "shared by every company" — by design, never a defect. */
export const SHARED_BY_DESIGN = {
  "audit.row_changes": "the audit writer records the company when the audited row has one; rows of company-less tables (catalogs, identity, flags) are audited with none",
  "audit.scenario_status": "global scenario-test status rows, not company data",
  "audit.record_deletions": "the purge route records the company of each deleted row; a deleted shared row has none",
  "catalogs.detail_types": "the QuickBooks detail-type catalog shared by all three companies (company rows are the exceptions)",
  "identity.role_permissions": "the role -> permission map is global",
  "identity.user_permissions": "a NULL company grant is a grant in every company",
  "lib.feature_flag_overrides": "a NULL company override applies to every company",
  "outbox.queue": "system outbox jobs, some not company-scoped",
  "public.audit_log": "legacy system audit log",
  "archive.round258_purge_event_costs": "frozen archive of a closed round",
  "archive.round258_purge_lost_opportunity": "frozen archive of a closed round",
  "archive.round266_purge_event_costs": "frozen archive of a closed round",
};

/** table -> { max: allowed count, reason } */
export const DEBT = {
  // Emptied 2026-10-04: the AUTH-400 purge removed every company-less expense / bill / load-charge line (was 506 / 28 / 136).
};
export const PARENTLESS_EXPENSE_LINES_DEBT = { max: 0, reason: "AUTH-400 purge (2026-10-04) removed the 506 parentless expense lines; none may return" };

// The selftest's own fixture debts (the pre-purge shape), so the real lists can shrink to empty without breaking it.
const FIXTURE_DEBT = {
  "accounting.expense_lines": { max: 506, reason: "fixture" },
  "accounting.bill_lines": { max: 28, reason: "fixture" },
  "dispatch.load_charge_lines": { max: 136, reason: "fixture" },
};
const FIXTURE_PARENTLESS = { max: 506, reason: "fixture" };

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const CLOSURES = [
  ["expense_lines_parent_required", /ADD\s+CONSTRAINT\s+expense_lines_parent_required\s+CHECK\s*\(\s*expense_id\s+IS\s+NOT\s+NULL\s*\)/i],
  ["bill_lines_company_required", /ADD\s+CONSTRAINT\s+bill_lines_company_required\s+CHECK\s*\(\s*operating_company_id\s+IS\s+NOT\s+NULL\s*\)/i],
  ["bill_lines_bill_id_fkey", /ADD\s+CONSTRAINT\s+bill_lines_bill_id_fkey\s+FOREIGN\s+KEY\s*\(\s*bill_id\s*\)\s+REFERENCES\s+accounting\.bills/i],
  ["load_charge_lines_company_required", /ADD\s+CONSTRAINT\s+load_charge_lines_company_required\s+CHECK\s*\(\s*operating_company_id\s+IS\s+NOT\s+NULL\s*\)/i],
  ["load_charge_lines_load_id_fkey", /ADD\s+CONSTRAINT\s+load_charge_lines_load_id_fkey\s+FOREIGN\s+KEY\s*\(\s*load_id\s*\)\s+REFERENCES\s+mdata\.loads/i],
];

export function staticFailures({ files, read }) {
  const out = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  for (const [name, shape] of CLOSURES) {
    let hit = null;
    for (const f of sorted) { const s = stripSql(read(f)); if (new RegExp(name, "i").test(s)) hit = { f, s }; }
    if (!hit || !shape.test(hit.s)) out.push(`RULE 3: ${hit?.f ?? "no migration"} — ${name} must be declared with its full shape by the last migration touching it.`);
  }
  return out;
}

/** nullCounts: { "schema.table": n } (only tables with n > 0); parentless: n */
export function liveFailures(nullCounts, parentless, debt = DEBT, parentDebt = PARENTLESS_EXPENSE_LINES_DEBT) {
  const out = [];
  const notes = [];
  for (const [t, n] of Object.entries(nullCounts)) {
    if (SHARED_BY_DESIGN[t]) continue;
    const d = debt[t];
    if (!d) out.push(`RULE 1: ${t} has ${n} row(s) with NO company — invisible to every company-scoped query, guard and the purge.`);
    else if (n > d.max) out.push(`RULE 1: ${t} has ${n} company-less row(s), above its named debt of ${d.max} — a new row escaped.`);
  }
  for (const [t, d] of Object.entries(debt)) {
    const n = nullCounts[t] ?? 0;
    if (n === 0) out.push(`DEBT RATCHET: ${t} carries no company-less row any more — remove it from DEBT (ceiling drops).`);
    else if (n < d.max) notes.push(`${t} debt shrank ${d.max} -> ${n}: lower DEBT.max in the next PR.`);
  }
  if (parentless > parentDebt.max) out.push(`RULE 2: ${parentless} expense line(s) with no parent, above the named debt of ${parentDebt.max}.`);
  if (parentless === 0 && parentDebt.max > 0) out.push("DEBT RATCHET: no parentless expense line remains — set PARENTLESS_EXPENSE_LINES_DEBT.max to 0.");
  return { out, notes };
}

export function run() {
  return staticFailures({ files: readdirSync(MIG), read: (f) => readFileSync(resolve(MIG, f), "utf8") });
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  // Behind pgbouncer the app pool's session-level SET ROLE ih35_app (auth/db.ts connect handler) survives on the server
  // backend, so a borrowed connection can arrive as ih35_app — where load_charge_lines' policy hides every company-less
  // row even under the bypass (measured: pooled 0 rows, direct 284 / 136 company-less). Unscoped by construction means
  // the login role: pin it for this transaction.
  await client.query("SET LOCAL ROLE NONE");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const { rows: tables } = await client.query(`
    SELECT c.table_schema AS s, c.table_name AS t
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
     WHERE c.column_name = 'operating_company_id' AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND c.is_nullable = 'YES'
     ORDER BY 1, 2`);
  const nullCounts = {};
  for (const { s, t } of tables) {
    // NO company filter — that is the whole point of this guard.
    const r = await client.query(`SELECT count(*)::bigint AS n FROM "${s}"."${t}" WHERE operating_company_id IS NULL`);
    const n = Number(r.rows[0].n);
    if (n > 0) nullCounts[`${s}.${t}`] = n;
  }
  const p = await client.query(`SELECT count(*)::bigint AS n FROM accounting.expense_lines WHERE expense_id IS NULL`);
  await client.query("ROLLBACK");
  return { nullCounts, parentless: Number(p.rows[0].n), scanned: tables.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const base = { "accounting.expense_lines": 506, "accounting.bill_lines": 28, "dispatch.load_charge_lines": 136, "audit.row_changes": 160000 };
    const cases = [
      ["named debt + shared passes", liveFailures(base, 506, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.length === 0],
      ["a new company-less table fails", liveFailures({ ...base, "driver_finance.settlement_lines": 1 }, 506, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.length === 1],
      ["debt growing fails", liveFailures({ ...base, "accounting.bill_lines": 29 }, 506, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.length === 1],
      ["debt at zero fails until removed", liveFailures({ "accounting.expense_lines": 506, "dispatch.load_charge_lines": 136 }, 506, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.some((f) => f.startsWith("DEBT RATCHET"))],
      ["parentless growing fails", liveFailures(base, 507, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.length === 1],
      ["empty real lists: nothing company-less passes", liveFailures({ "audit.row_changes": 160000 }, 0).out.length === 0],
      ["empty real lists: one company-less expense line fails", liveFailures({ "accounting.expense_lines": 1 }, 0).out.length === 1],
      ["shared-by-design is never a defect", liveFailures({ ...base, "catalogs.detail_types": 144 }, 506, FIXTURE_DEBT, FIXTURE_PARENTLESS).out.length === 0],
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
    const { out, notes } = liveFailures(m.nullCounts, m.parentless);
    for (const n of notes) console.log(`${LABEL}: NOTE — ${n}`);
    const all = [...sf, ...out];
    if (all.length) {
      console.error(`${LABEL}: FAIL (unscoped, ${m.scanned} nullable-company tables scanned)\n  ${all.join("\n  ")}`);
      process.exitCode = 1;
    } else {
      const debt = Object.keys(DEBT).map((t) => `${t} ${m.nullCounts[t] ?? 0}`).join(", ");
      console.log(`${LABEL}: OK — unscoped; ${m.scanned} nullable-company tables scanned; company-less rows only in shared-by-design tables and the named debt (${debt}); parentless expense lines ${m.parentless} (debt ${PARENTLESS_EXPENSE_LINES_DEBT.max}).`);
    }
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
