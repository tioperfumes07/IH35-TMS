#!/usr/bin/env node
/**
 * GUARD — mdata.units has NO display_id. Any query selecting it throws 42703 at runtime.
 *
 * THE DEFECT (live prod, ALL entities, 2026-08-03): every work-order create returned HTTP 500
 *   {"code":"42703","message":"column \"display_id\" does not exist"}
 * from two-section-service.ts::deriveClassHint —
 *   SELECT unit_number, display_id FROM mdata.units WHERE id = $1
 * Verified on prod: information_schema reports mdata.units.display_id = FALSE; the table carries
 * unit_number. Standards §4 / Doc 03 §7 list this column as a known phantom.
 *
 * WHY THIS GUARD EXISTS RATHER THAN JUST THE FIX: the defect was first attributed to
 * maintenance.next_wo_display_id() having a stale RETURNS shape, with DROP FUNCTION + recreate
 * proposed and approved. Prod disagreed — the function already returns TABLE(display_id text,
 * sequence integer). Executing that plan would have DROPPED A WORKING FUNCTION on production and left
 * WO-create dead, because the throw comes from this plain SELECT, which runs AFTER the function call
 * succeeds. A phantom column is easy to mistake for a signature problem precisely because the word
 * `display_id` appears legitimately in the function's own return shape.
 *
 * WHAT IT ENFORCES: no source file selects display_id from mdata.units. Scoped to that table — the
 * column is real and correct on maintenance.work_orders, mdata.loads and others, so a blanket
 * "display_id" ban would be wrong and would be allowlisted into uselessness.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:no-units-display-id";
const ROOT = "apps/backend/src";

/**
 * A BARE `display_id` token in the select list of a query whose FROM is mdata.units.
 *
 * Deliberately narrow, and this precision is the point. A looser "display_id appears before
 * FROM mdata.units" rule produced TWO FALSE POSITIVES on the first run:
 *   book-load.service.ts   COALESCE(unit_number, id::text) AS display_id   <- aliasing an OUTPUT
 *   quick-assign.service.ts COALESCE(u.unit_number, v.display_id, ...)     <- v = the VIEW, which HAS it
 * Both are correct code. Flagging them would have taught everyone to allowlist this guard, and a
 * guard people route around protects nothing. The real defect was a bare column read —
 * `SELECT unit_number, display_id FROM mdata.units` — so that is exactly what is matched: the token
 * preceded by a comma or SELECT, never by `AS`, never qualified by another table's alias.
 */
// NOTE the LOOKAHEAD on the terminator. An earlier version consumed it with (?:,|\s+FROM), so on the
// real defect — `SELECT unit_number, display_id FROM mdata.units` — the alternation ate the FROM and
// the trailing `FROM\s+mdata\.units` could no longer match: the guard went green on the exact bug it
// exists to catch. Its own selftest caught that before it shipped.
const UNITS_DISPLAY_ID =
  /(?:SELECT|,)\s*display_id\s*(?=,|\s|$)[\s\S]{0,200}?FROM\s+mdata\.units\b/i;

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

export function analyse(files) {
  const problems = [];
  for (const [file, raw] of Object.entries(files)) {
    if (raw == null) continue;
    const src = stripComments(raw);
    if (UNITS_DISPLAY_ID.test(src)) {
      problems.push(
        `${file}: selects display_id from mdata.units. That column DOES NOT EXIST — Postgres throws ` +
          `42703 at runtime and the endpoint 500s. Use unit_number.`
      );
    }
  }
  return problems;
}

function readAll() {
  const out = {};
  for (const f of walk(ROOT)) out[f] = readFileSync(f, "utf8");
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("unit_number only passes",
    analyse({ "a.ts": "`SELECT unit_number FROM mdata.units WHERE id = $1`" }).length === 0);
  // The REAL defect, verbatim.
  t("the real pre-fix SELECT FAILS",
    analyse({ "a.ts": "`SELECT unit_number, display_id FROM mdata.units WHERE id = $1 LIMIT 1`" }).length === 1);
  // The two REAL false positives the first version produced — both must stay clean.
  t("COALESCE(...) AS display_id is ignored (book-load.service.ts)",
    analyse({ "a.ts": "`SELECT COALESCE(unit_number, id::text) AS display_id, is_oos FROM mdata.units`" }).length === 0);
  t("another table's aliased v.display_id is ignored (quick-assign.service.ts)",
    analyse({ "a.ts": "`SELECT u.id, COALESCE(u.unit_number, v.display_id, u.id::text) AS display_id FROM mdata.units u LEFT JOIN views.x v ON v.id=u.id`" }).length === 0);
  // display_id is REAL on other tables — must not be flagged.
  t("display_id on work_orders is ignored",
    analyse({ "a.ts": "`SELECT display_id FROM maintenance.work_orders`" }).length === 0);
  t("display_id on mdata.loads is ignored",
    analyse({ "a.ts": "`SELECT display_id FROM mdata.loads`" }).length === 0);
  // The function's own RETURNS shape legitimately names display_id.
  t("next_wo_display_id() select is ignored",
    analyse({ "a.ts": "`SELECT display_id, sequence FROM maintenance.next_wo_display_id($1,$2,$3,$4)`" }).length === 0);
  t("a comment quoting the old query does not trip it",
    analyse({ "a.ts": "// was SELECT unit_number, display_id FROM mdata.units\nconst x=1;" }).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 8 cases (7 pass-shapes incl. both real false-positives, 1 fail-shape)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — no query selects the phantom mdata.units.display_id`);
