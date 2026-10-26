#!/usr/bin/env node
/**
 * ENG-42 (443.328): shrink-only guard on active duplicate settlement-line groups.
 *
 * A duplicate is the SAME charge twice: same settlement, load, line_type, amount, description and
 * source key (source_reference_id / source_id / source_driver_bill_id). Measured 2026-10-25 under the
 * real bypass: 0 such groups on USMCA.
 *
 * The earlier key — the (settlement_id, load_id, line_type) triple alone — counted 40 groups on
 * 2026-10-25, every one a LEGITIMATE separate charge on a closed, signed settlement (e.g. P-0006:
 * a $5.25 scale and a $15.25 wash at the same Love's; extra_pay groups each carry a distinct source).
 * A guard that flags correct, signed settlements as duplicates cannot be driven to zero honestly
 * (voiding them would corrupt tied settlements), so it measured nothing. The exact-duplicate key
 * plus a ZERO ceiling is the stricter contract: one real duplicate now fails.
 *
 * It is a SHRINK-ONLY guard: the ceiling may only decrease (or be removed) once
 * a clean-up script voids the remaining groups; it must never be raised.
 *
 * Live run requires DATABASE_URL with the neondb_owner role (bypasses RLS) so
 * the query is unscoped. Selftest exercises the threshold logic without a DB.
 */
import { execSync } from "node:child_process";

// Live-only guard: no DATABASE_URL → skip is intentional (requires Neon neondb_owner role).
export const ALLOW_OFFLINE_SKIP = "shrink-only ceiling on USMCA duplicate settlement lines; live Neon required";

const LABEL = "verify-no-duplicate-settlement-lines";

// shrink-only ceiling — lower this after a clean-up script voids the remaining groups
const DUPLICATE_CEILING = 0;

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** The live query, as a constant the selftest can mutate (a copy — never the tracked file). */
export const DUPES_SQL = `
    SELECT COUNT(*)::int AS dupe_groups
    FROM (
      SELECT sl.settlement_id, sl.load_id, sl.line_type, sl.amount, sl.description,
             COALESCE(sl.source_reference_id::text, sl.source_id::text, sl.source_driver_bill_id::text) AS source_key
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      WHERE ds.operating_company_id = '${USMCA_COMPANY_ID}'::uuid
        AND sl.is_active = true
        AND sl.voided_at IS NULL
      GROUP BY sl.settlement_id, sl.load_id, sl.line_type, sl.amount, sl.description, source_key
      HAVING COUNT(*) > 1
    ) g
  `.trim();

/** The query must count exactly the defect: live (active, unvoided) duplicate triples, USMCA-scoped. */
export function sqlFailures(sql) {
  const f = [];
  if (!/sl\.is_active = true/.test(sql)) f.push("query no longer restricts to active lines");
  if (!/sl\.voided_at IS NULL/.test(sql)) f.push("query no longer excludes voided lines");
  if (!/GROUP BY sl\.settlement_id, sl\.load_id, sl\.line_type, sl\.amount, sl\.description, source_key/.test(sql)) f.push("query no longer groups by the exact-duplicate key (settlement, load, line_type, amount, description, source)");
  if (!/COALESCE\(sl\.source_reference_id::text, sl\.source_id::text, sl\.source_driver_bill_id::text\) AS source_key/.test(sql)) f.push("query no longer derives the source key from all three source columns");
  if (!/HAVING COUNT\(\*\) > 1/.test(sql)) f.push("query no longer counts only duplicate groups");
  if (!/ds\.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid/.test(sql)) f.push("query is no longer USMCA-scoped");
  return f;
}

/** The one verdict the live run uses: a count above the shrink-only ceiling fails. */
export function verdict(count, ceiling) {
  if (!Number.isInteger(count) || count < 0) return { ok: false, msg: `could not read a count (${count})` };
  if (count > ceiling) return { ok: false, msg: `${count} active duplicate settlement-line groups (ceiling=${ceiling})` };
  return { ok: true, msg: `${count} duplicate groups (ceiling=${ceiling})` };
}

function selftest() {
  const cases = [];
  // The REAL verdict function the live run calls (was: a re-typed `count > ceiling` that could never disagree with itself).
  for (const [count, ceiling, expectOk] of [[0, 15, true], [15, 15, true], [16, 15, false], [89, 15, false], [1, 0, false], [NaN, 15, false]]) {
    cases.push([`verdict(${count}, ${ceiling}) ${expectOk ? "passes" : "fails"}`, verdict(count, ceiling).ok === expectOk]);
  }
  cases.push(["the guard's real ceiling rejects one more than itself", verdict(DUPLICATE_CEILING + 1, DUPLICATE_CEILING).ok === false]);
  cases.push(["the ceiling is zero — one real duplicate fails", DUPLICATE_CEILING === 0 && verdict(1, DUPLICATE_CEILING).ok === false]);
  // The REAL query: passes as shipped; each planted weakening is caught.
  cases.push(["real query passes its contract", sqlFailures(DUPES_SQL).length === 0]);
  for (const [name, from, to] of [
    ["voided lines counted", "AND sl.voided_at IS NULL", ""],
    ["inactive lines counted", "AND sl.is_active = true", ""],
    ["every group counted, not only duplicates", "HAVING COUNT(*) > 1", "HAVING COUNT(*) > 0"],
    ["amount dropped from the key", "sl.line_type, sl.amount, sl.description, source_key\n", "sl.line_type, sl.description, source_key\n"],
    ["a source column dropped from the key", "sl.source_id::text, sl.source_driver_bill_id::text", "sl.source_id::text"],
    ["entity scope dropped", "WHERE ds.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid\n        AND", "WHERE"],
  ]) {
    const mutated = DUPES_SQL.split(from).join(to);
    cases.push([`planted "${name}" caught`, mutated !== DUPES_SQL && sqlFailures(mutated).length > 0]);
  }
  let ok = 0;
  for (const [name, pass] of cases) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (pass) ok += 1; }
  console.log(`${LABEL} SELFTEST ${ok === cases.length ? "OK" : "FAIL"} (${ok}/${cases.length} cases)`);
  process.exit(ok === cases.length ? 0 : 1);
}

async function liveRun() {
  const db = process.env.DATABASE_URL;
  if (!db) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (offline; CI runs this with Neon neondb_owner)`);
    process.exit(0);
  }

  // SET LOCAL in the same implicit transaction: the count is never masked by RLS whatever role connects.
  const sql = `SET LOCAL app.bypass_rls = 'lucia'; ${DUPES_SQL}`;

  let count;
  try {
    const out = execSync(
      `psql "${db}" -t -A -c "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    count = parseInt(out.split("\n").pop(), 10); // psql echoes the SET tag first
  } catch (e) {
    console.error(`${LABEL} ERROR querying DB: ${e.message}`);
    process.exit(1);
  }

  const v = verdict(count, DUPLICATE_CEILING);
  if (!v.ok) {
    console.error(`${LABEL} FAIL: ${v.msg} on USMCA. ENG-42 fix required — run a void/dedup script and lower DUPLICATE_CEILING.`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ${v.msg}`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await liveRun();
}
