#!/usr/bin/env node
/**
 * CLS-DISPLAYID-UNSCOPED — a query that filters on display_id must scope by operating_company_id.
 *
 * THE FACT, hit live on 2026-08-05: display_id is NOT unique across entities. `INV-2026-00004` exists
 * TWICE on prod —
 *     f280b52a  USMCA   TIO PERFUMES  $0.00      (a test artifact)
 *     769f3062  TRANSP  LONGSHIP      $3,800.00  status PAID
 * Voiding "INV-2026-00004" by display_id would have voided a REAL PAID CUSTOMER INVOICE. The void was
 * done by UUID and the LONGSHIP row is intact — but nothing in CI stopped that lookup from being
 * written unscoped in the first place. Cascade's card confirms 4 colliding numbers today and marks
 * every CURRENT site safe; "safe today" is not a control, because the class is about the site someone
 * adds tomorrow.
 *
 * WHY UNIQUE-PER-ENTITY IS NOT ENOUGH: the schema's UNIQUE is (operating_company_id, display_id), so
 * the DATABASE is correct. The hazard is entirely in the READ: `WHERE display_id = $1` with no company
 * predicate silently crosses entities and, under RLS bypass or a lucia/admin path, returns another
 * entity's row. It does not error. It returns the wrong money.
 *
 * WHAT THIS ASSERTS: in any SQL block that filters on display_id, the same block must also constrain
 * operating_company_id. Ratchet with an explicit allowlist — the list may only shrink.
 *
 * NOT CLAIMED: this is a static scan of SQL text. It cannot prove the company value passed is the
 * CALLER's entity (that is what withCompanyScope / RLS enforce at runtime). It proves the predicate is
 * present, which is exactly what was missing from the shape that nearly cost a real invoice.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-display-id-lookups-entity-scoped";
const SRC = "apps/backend/src";
const BASELINE_PATH = "scripts/display-id-scoping-baseline.json";

/** A SQL template literal that filters on display_id. */
const SQL_BLOCK = /`([^`]*\bdisplay_id\b[^`]*)`/g;
const FILTERS_DISPLAY_ID = /\bdisplay_id\s*(?:=|IN|ILIKE|LIKE)/i;
const SCOPED = /operating_company_id/i;

export function auditSql(src, file = "<mem>") {
  const problems = [];
  for (const m of src.matchAll(SQL_BLOCK)) {
    const block = m[1];
    if (!FILTERS_DISPLAY_ID.test(block)) continue; // merely SELECTing display_id is fine
    if (SCOPED.test(block)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    const snippet = block.replace(/\s+/g, " ").trim().slice(0, 90);
    problems.push(
      `${file}:${line}: filters on display_id WITHOUT operating_company_id — "${snippet}". ` +
        `display_id is unique per ENTITY, not globally (INV-2026-00004 exists on both USMCA and TRANSP, ` +
        `the TRANSP one a PAID $3,800 invoice). An unscoped lookup returns another entity's row without ` +
        `erroring. Add the company predicate, or allowlist with a stated reason.`
    );
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.includes(".test.")) out.push(rel);
}

function collect() {
  const files = [];
  walk(SRC, files);
  const keys = [];
  for (const rel of files) {
    for (const p of auditSql(readFileSync(join(ROOT, rel), "utf8"), rel)) keys.push(p.split(":").slice(0, 1)[0] + "|" + p.split('"')[1]?.slice(0, 40));
  }
  return { keys: [...new Set(keys)], fileCount: files.length };
}

function auditTree() {
  const { keys, fileCount } = collect();
  if (fileCount === 0) return [`${LABEL}: no backend sources found — scope is wrong, refusing to pass vacuously.`];
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Regenerate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const added = keys.filter((k) => !baseline.has(k));
  const problems = [];
  if (added.length) {
    problems.push(
      `${added.length} NEW unscoped display_id lookup(s) — this is the shape that nearly voided a real ` +
        `PAID invoice:\n  ` +
        added.slice(0, 10).join("\n  ")
    );
  }
  if (keys.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${keys.length}. The baseline may only shrink.`);
  }
  return problems;
}

function selftest() {
  const failures = [];

  // The dangerous shape.
  const bad = 'const q = `SELECT id FROM accounting.invoices WHERE display_id = $1 LIMIT 1`;';
  if (auditSql(bad).length === 0) failures.push("case1 FAIL — an unscoped display_id lookup was NOT caught");

  // Scoped in the same statement — safe.
  const good = 'const q = `SELECT id FROM accounting.invoices WHERE operating_company_id = $1 AND display_id = $2`;';
  if (auditSql(good).length !== 0) failures.push("case2 FAIL — a properly scoped lookup was flagged");

  // Selecting display_id without filtering on it is not this defect.
  const select = 'const q = `SELECT id, display_id FROM accounting.invoices WHERE id = $1`;';
  if (auditSql(select).length !== 0) failures.push("case3 FAIL — merely selecting display_id was flagged");

  // IN / ILIKE forms are the same hazard.
  const inForm = 'const q = `SELECT id FROM accounting.bills WHERE display_id IN (SELECT x FROM y)`;';
  if (auditSql(inForm).length === 0) failures.push("case4 FAIL — an IN-form unscoped lookup was NOT caught");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — unscoped =/IN forms caught, scoped + select-only clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { keys } = collect();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify({ note: "CLS-DISPLAYID-UNSCOPED ratchet — may only SHRINK.", offenders: keys.sort() }, null, 2) + "\n"
    );
    console.log(`${LABEL}: baseline written with ${keys.length} offender(s)`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every display_id lookup is entity-scoped`);
}

main();
