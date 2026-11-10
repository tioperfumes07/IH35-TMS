#!/usr/bin/env node
// verify-load-fk-invariant-fuel-refusal — accounting.enforce_load_fk_invariant() must raise its REAL refusal on every table
// it guards (ACCT-F11107, migration 202616460100).
//
// The function is the BEFORE INSERT/UPDATE trigger on accounting.expense_lines, accounting.bill_lines AND
// fuel.fuel_transactions. Its RAISE read NEW.line_category for every table; fuel.fuel_transactions has no such column, so a
// fuel row with no load failed with `record "new" has no field "line_category"` (42703) and E_LOAD_FK_REQUIRED never
// showed (measured on a prod fork 2026-11-10). RULE: in the CURRENT definition (the latest migration that creates the
// function), NEW.line_category is read only inside the accounting branch — never in the RAISE arguments and never outside
// `IF TG_TABLE_SCHEMA = 'accounting' … ELSIF`. Static (no DB); --selftest plants the old shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-load-fk-invariant-fuel-refusal";
const MIG_DIR = path.join(process.cwd(), "db/migrations");
const FN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.enforce_load_fk_invariant\s*\(\s*\)/i;

/** The body of the function as the latest migration defines it: [file, body] or null. */
export function latestDefinition(files) {
  const hits = files.filter(([, sql]) => FN.test(sql)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (!hits.length) return null;
  const [file, sql] = hits[hits.length - 1];
  const at = sql.search(FN);
  const m = /AS\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1/.exec(sql.slice(at));
  return m ? [file, m[2]] : [file, null];
}

/** Pure: problems in a function body. */
export function problems(body) {
  if (body == null) return ["the function body could not be read"];
  const p = [];
  const raises = body.match(/RAISE\s+EXCEPTION[\s\S]*?;/gi) ?? [];
  if (raises.some((r) => /NEW\.line_category/i.test(r))) p.push("a RAISE reads NEW.line_category — fuel.fuel_transactions has no such column, so its refusal would be a 42703 schema error");
  const accStart = body.search(/IF\s+TG_TABLE_SCHEMA\s*=\s*'accounting'/i);
  const accEnd = body.search(/ELSIF\s+TG_TABLE_SCHEMA\s*=\s*'fuel'/i);
  if (accStart < 0 || accEnd < accStart) p.push("no accounting branch followed by a fuel branch (IF TG_TABLE_SCHEMA = 'accounting' … ELSIF TG_TABLE_SCHEMA = 'fuel')");
  else {
    const outside = body.slice(0, accStart) + body.slice(accEnd);
    if (/NEW\.line_category/i.test(outside)) p.push("NEW.line_category is read outside the accounting branch");
  }
  if (!/E_LOAD_FK_REQUIRED/.test(body)) p.push("the E_LOAD_FK_REQUIRED refusal (the prefix the writers match on) is gone");
  return p;
}

function readMigrations() {
  return fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((f) => [f, fs.readFileSync(path.join(MIG_DIR, f), "utf8")]);
}

function selftest() {
  const real = latestDefinition(readMigrations());
  const OLD = `CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_required boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME IN ('expense_lines', 'bill_lines') THEN
    v_required := COALESCE(NEW.load_required, false);
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
  END IF;
  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION 'E_LOAD_FK_REQUIRED: %.% category=% requires load_id', TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(NEW.line_category, 'n/a');
  END IF;
  RETURN NEW;
END;
$function$;`;
  const body = (sql) => latestDefinition([["x.sql", sql]])?.[1];
  const cases = [
    ["the current migration tree passes", real ? problems(real[1]).length : 1, 0],
    ["PLANT: the pre-202616460100 RAISE (NEW.line_category for every table) fails", problems(body(OLD)).length > 0 ? 1 : 0, 1],
    ["PLANT: NEW.line_category read in the fuel branch fails", problems(body(OLD.replace("COALESCE(NEW.line_category, 'n/a')", "TG_TABLE_NAME").replace("v_required := COALESCE(NEW.load_required, true);", "v_required := NEW.line_category IS NULL;"))).length > 0 ? 1 : 0, 1],
    ["PLANT: the refusal prefix removed fails", real ? (problems(real[1].replaceAll("E_LOAD_FK_REQUIRED", "E_X")).length > 0 ? 1 : 0) : 0, 1],
    ["the latest definition wins over an older one", latestDefinition([["0001_a.sql", OLD], ["0002_b.sql", real ? `CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant() RETURNS trigger LANGUAGE plpgsql AS $function$${real[1]}$function$;` : OLD]])?.[0] === "0002_b.sql" ? 1 : 0, 1],
  ];
  let bad = 0;
  for (const [n, got, want] of cases) { console.log(`${got === want ? "ok  " : "FAIL"} ${n} (${got}, want ${want})`); if (got !== want) bad++; }
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  const def = latestDefinition(readMigrations());
  if (!def) { console.error(`${LABEL}: FAIL — no migration defines accounting.enforce_load_fk_invariant()`); process.exit(1); }
  const p = problems(def[1]);
  if (p.length) { for (const x of p) console.error(`  ✗ ${def[0]}: ${x}`); console.error(`${LABEL}: FAIL — ${p.length} problem(s)`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${def[0]} reads NEW.line_category only on the accounting line tables; the fuel refusal is E_LOAD_FK_REQUIRED`);
}
