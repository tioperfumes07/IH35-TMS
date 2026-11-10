#!/usr/bin/env node
/**
 * ACCT-F11107 part 2 — the void block (DEFECT 282.1, accounting.fn_block_void_with_live_postings) judges a posting line's
 * liveness at LINE level as well as entry level: a reversal line (reversal_of_line_id) or a line already reversed
 * (reversed_by_line_id) is not live.
 *
 * Root cause measured 2026-11-10 (prod, USMCA): voiding reclassified expenses 13584-6 / 13584-7 through
 * POST /api/v1/expenses/:id/void returned 500 "BLOCKED (282.1) … 2 live". The void engine reverses every line live at line
 * level (AUTH-400) and links its reversal JE to the ORIGINAL entry only; the reclass entry (a line-level reversal of the
 * old debit + the in-leg) has no entry-level link, so a block that read only entry-level columns counted both its lines
 * as live forever and refused every void of a reclassified document.
 *
 * Static (no DB): the NEWEST migration defining the function keeps the entry-level predicates (status / voided_at /
 * reversed_by_je_id / reverses_je_id), adds both line-level predicates, and still raises BLOCKED (282.1).
 * --selftest plants each defect.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-void-block-counts-line-level-liveness";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = path.join(ROOT, "db/migrations");
const FN = /FUNCTION\s+accounting\.fn_block_void_with_live_postings\s*\(\s*\)[\s\S]*?\$BODY\$([\s\S]*?)\$BODY\$/i;

const REQUIRED = [
  [/je\.status\s*=\s*'posted'/i, "entry-level: je.status = 'posted'"],
  [/je\.voided_at\s+IS\s+NULL/i, "entry-level: je.voided_at IS NULL"],
  [/je\.reversed_by_je_id\s+IS\s+NULL/i, "entry-level: je.reversed_by_je_id IS NULL"],
  [/je\.reverses_je_id\s+IS\s+NULL/i, "entry-level: je.reverses_je_id IS NULL"],
  [/jep\.reversal_of_line_id\s+IS\s+NULL/i, "line-level: jep.reversal_of_line_id IS NULL (a reversal line is not live)"],
  [/jep\.reversed_by_line_id\s+IS\s+NULL/i, "line-level: jep.reversed_by_line_id IS NULL (a reversed line is not live)"],
  [/BLOCKED \(282\.1\)/, "the refusal BLOCKED (282.1) still raises"],
];

/** Pure: function body (or null) -> problems. */
export function evaluate(body) {
  if (!body) return ["no migration defines accounting.fn_block_void_with_live_postings()"];
  const code = body.replace(/--[^\n]*/g, "");
  return REQUIRED.filter(([re]) => !re.test(code)).map(([, why]) => `missing ${why}`);
}

export function newestDefinition(files) {
  let found = null;
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const m = FN.exec(f.text);
    if (m) found = { name: f.name, body: m[1] };
  }
  return found;
}

function selftest() {
  const good = `CREATE OR REPLACE FUNCTION accounting.fn_block_void_with_live_postings() RETURNS trigger LANGUAGE plpgsql AS $BODY$
BEGIN
  SELECT count(*) INTO v FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
   WHERE je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
     AND jep.reversal_of_line_id IS NULL
     AND jep.reversed_by_line_id IS NULL;
  RAISE EXCEPTION 'BLOCKED (282.1): %', v;
END;
$BODY$;`;
  const old = good.replace("\n     AND jep.reversal_of_line_id IS NULL\n     AND jep.reversed_by_line_id IS NULL", "");
  const cases = [
    ["fixed definition passes", [{ name: "2.sql", text: good }], 0],
    ["old 202614610000 definition (entry-level only) fails", [{ name: "1.sql", text: old }], 1],
    ["newest wins: fixed then reverted fails", [{ name: "1.sql", text: good }, { name: "2.sql", text: old }], 1],
    ["newest wins: old then fixed passes", [{ name: "1.sql", text: old }, { name: "2.sql", text: good }], 0],
    ["reversed_by_line_id predicate missing fails", [{ name: "2.sql", text: good.replace("\n     AND jep.reversed_by_line_id IS NULL", "") }], 1],
    ["line predicate only in a comment fails", [{ name: "2.sql", text: good.replace("     AND jep.reversal_of_line_id IS NULL", "     -- AND jep.reversal_of_line_id IS NULL") }], 1],
    ["entry-level reverses_je_id dropped fails", [{ name: "2.sql", text: good.replace(" AND je.reverses_je_id IS NULL", "") }], 1],
    ["refusal removed fails", [{ name: "2.sql", text: good.replace("RAISE EXCEPTION 'BLOCKED (282.1): %', v;", "NULL;") }], 1],
    ["no definition fails", [{ name: "2.sql", text: "SELECT 1;" }], 1],
  ];
  let failed = 0;
  for (const [name, files, wantFail] of cases) {
    const got = evaluate(newestDefinition(files)?.body ?? null).length > 0 ? 1 : 0;
    const ok = got === wantFail;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - failed}/${cases.length}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((name) => ({ name, text: readFileSync(path.join(MIG_DIR, name), "utf8") }));
  const def = newestDefinition(files);
  const problems = evaluate(def?.body ?? null);
  if (problems.length) {
    console.error(`${LABEL}: FAIL (${def?.name ?? "no definition"})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — newest definition ${def.name} judges liveness at entry AND line level`);
}
