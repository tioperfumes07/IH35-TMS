#!/usr/bin/env node
/**
 * ACCT-F11107 — a REVERSAL posting batch never registers (or is refused as) a fuel receipt posting.
 *
 * Root cause measured 2026-11-10 (prod, USMCA): voiding expense 13586-1 (a DREAMLINE fuel receipt posted under source
 * 'expense') through POST /api/v1/expenses/:id/void returned 500 / 23505 fuel_receipt_already_posted. The void's reversal
 * inserts a posting_batches row for the same source with idempotency key '…:reversal'; trg_register_fuel_receipt_posting
 * (202615850910) treated it as a second posting of the receipt and refused it — so no fuel-receipt expense could be voided
 * by the app's own void engine.
 *
 * Static (no DB): the NEWEST migration that defines fuel.tg_register_fuel_receipt_posting must return early for a reversal
 * batch (idempotency_key LIKE '%:reversal') BEFORE it computes the receipt key / raises fuel_receipt_already_posted, and must
 * still raise fuel_receipt_already_posted for every other batch. --selftest plants each defect.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-receipt-reversal-never-registers";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = path.join(ROOT, "db/migrations");
const FN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+fuel\.tg_register_fuel_receipt_posting\s*\(\s*\)([\s\S]*?)\$fn\$\s*;/i;

/** Pure: the function body text (or null) -> problems. */
export function evaluate(body) {
  if (!body) return ["no migration defines fuel.tg_register_fuel_receipt_posting()"];
  const problems = [];
  const code = body.replace(/--[^\n]*/g, "");
  const skip = code.search(/IF\s+NEW\.idempotency_key\s+IS\s+NOT\s+NULL\s+AND\s+NEW\.idempotency_key\s+LIKE\s+'%:reversal'\s+THEN\s+RETURN\s+NEW\s*;/i);
  const key = code.search(/fuel\.fuel_receipt_key\s*\(/i);
  const raise = code.search(/fuel_receipt_already_posted/);
  if (skip < 0) problems.push("a reversal batch (idempotency_key LIKE '%:reversal') is not skipped — the void engine's reversal is refused as a second posting");
  if (raise < 0) problems.push("the one-live-posting refusal (fuel_receipt_already_posted) is gone — a second posting of a receipt would be allowed");
  if (key < 0) problems.push("the receipt key is no longer computed (fuel.fuel_receipt_key)");
  if (skip >= 0 && key >= 0 && skip > key) problems.push("the reversal skip runs AFTER the receipt key / refusal — it must come first");
  return problems;
}

/** The newest migration's definition of the function. */
export function newestDefinition(files) {
  let found = null;
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const m = FN.exec(f.text);
    if (m) found = { name: f.name, body: m[1] };
  }
  return found;
}

function selftest() {
  const good = `CREATE OR REPLACE FUNCTION fuel.tg_register_fuel_receipt_posting()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE '%:reversal' THEN
    RETURN NEW;
  END IF;
  v_key := fuel.fuel_receipt_key(NEW.operating_company_id, NEW.source_transaction_type::text, NEW.source_transaction_id::text);
  RAISE EXCEPTION 'fuel_receipt_already_posted: %', v_key;
END
$fn$;`;
  const old = good.replace(/  IF NEW\.idempotency_key[\s\S]*?END IF;\n/, "");
  const late = old.replace("  RAISE EXCEPTION", "  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE '%:reversal' THEN RETURN NEW; END IF;\n  RAISE EXCEPTION");
  const noRaise = good.replace(/RAISE EXCEPTION 'fuel_receipt_already_posted: %', v_key;/, "NULL;");
  const commented = good.replace("  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE '%:reversal' THEN", "  -- IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE '%:reversal' THEN\n  IF false THEN");
  const cases = [
    ["fixed definition passes", [{ name: "2.sql", text: good }], 0],
    ["old (202615850910) definition fails", [{ name: "1.sql", text: old }], 1],
    ["newest definition wins: fixed then reverted fails", [{ name: "1.sql", text: good }, { name: "2.sql", text: old }], 1],
    ["newest definition wins: old then fixed passes", [{ name: "1.sql", text: old }, { name: "2.sql", text: good }], 0],
    ["skip after the key/refusal fails", [{ name: "2.sql", text: late }], 1],
    ["refusal removed fails", [{ name: "2.sql", text: noRaise }], 1],
    ["commented-out skip fails", [{ name: "2.sql", text: commented }], 1],
    ["no definition fails", [{ name: "2.sql", text: "SELECT 1;" }], 1],
  ];
  let failed = 0;
  for (const [name, files, wantFail] of cases) {
    const def = newestDefinition(files);
    const got = evaluate(def?.body ?? null).length > 0 ? 1 : 0;
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
  console.log(`${LABEL}: PASS — newest definition ${def.name} skips reversal batches before the one-live-posting check`);
}
