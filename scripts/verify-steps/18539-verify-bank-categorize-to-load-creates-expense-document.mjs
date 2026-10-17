#!/usr/bin/env node
/**
 * LEAD ROUND 443.183 G6 — a bank line with NO document still lands on its load.
 *
 *   C1 categorize: the categorize route posts through postBankCategorizationOnClient, which turns a money-out expense
 *      categorization into an EXPENSE DOCUMENT (postBankLineAsExpenseOnClient → createAndPostBankLineExpenseOnClient,
 *      the one bank-line expense writer) carrying the tagged load.
 *   C2 the writer, for a load: load-spine number (generateExpenseNumber, never EXP- for a load), expense_load_links row,
 *      unit / driver / trailer FROM THE LOAD through the same resolver + mismatch rule as Record Expense
 *      (readLoadAttribution + reconcileExpenseWithLoad), a contradiction or another company's load refused before writing,
 *      and the resolved dimensions on header AND line.
 *   C3 postings: the expense poster's postings read load_id from the expense line (accounting.posting_source_load_id
 *      'expense' branch), so the journal lines carry the load.
 *   C4 fuel at bank match: the canonical card fill gets its expense document (createExpenseFromFuelTransaction) and the
 *      Relay fill adopts one (adoptRelayFillExpenseDocument) — same JE, never a bare posting.
 *   C5 the top-level guard verify-bank-categorized-cost-is-expense-document passes (S1–S12).
 *
 * --selftest: plants each regression and asserts the guard fails.   --against-main: checks origin/main's copies (RED).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  route: "apps/backend/src/banking/categorization.routes.ts",
  feedGl: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  writer: "apps/backend/src/accounting/bank-line-expense.service.ts",
  // 443.182 C step 2 — the deep expense engine numbers + links the writer's document.
  engine: "apps/backend/src/accounting/expense-writer.service.ts",
  fuelPost: "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts",
};
const TOP = "scripts/verify-bank-categorized-cost-is-expense-document.mjs";

const fnBody = (src, name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return "";
  const next = src.indexOf("\nexport ", i + 10);
  const next2 = src.indexOf("\nasync function ", i + 10);
  const ends = [next, next2].filter((n) => n > 0);
  return src.slice(i, ends.length ? Math.min(...ends) : undefined);
};

export function check(src, migrations) {
  const out = [];
  // C1
  if (!/postBankCategorizationOnClient\(client,/.test(src.route)) out.push(`${F.route}: categorize does not post through postBankCategorizationOnClient (C1)`);
  if (!/return postBankLineAsExpenseOnClient\(client, input, decision\)/.test(src.feedGl)) out.push(`${F.feedGl}: a money-out expense categorization does not become an expense document (C1)`);
  const asExpense = fnBody(src.feedGl, "postBankLineAsExpenseOnClient");
  if (!/createAndPostBankLineExpenseOnClient\(/.test(asExpense) || !/loadId: line\.load_id/.test(asExpense)) out.push(`${F.feedGl}: the expense document is not written by the bank-line writer with the tagged load (C1)`);
  // C2
  const w = fnBody(src.writer, "createAndPostBankLineExpenseOnClient");
  const reserve = fnBody(src.engine, "reserveExpenseNumber");
  if (!/reserveExpenseNumber\(client, input\.operatingCompanyId, \{\s*loadId: input\.loadId/.test(w) || !/if \(spec\.loadId\) \{\s*const n = await generateExpenseNumber\(/.test(reserve)) out.push(`${F.writer}: a load-tagged bank expense is not numbered on the load spine (C2)`);
  if (!/loadLink: input\.loadId\s*\?/.test(w) || !/insertExpenseLoadLink\(/.test(src.engine)) out.push(`${F.writer}: no expense_load_links row for a load-tagged bank expense (C2)`);
  if (!/await readLoadAttribution\(client, input\.operatingCompanyId, input\.loadId\)/.test(w) || !/reconcileExpenseWithLoad\(input, load\)/.test(w)) out.push(`${F.writer}: unit / driver / trailer are not taken from the load (C2)`);
  if (!/BankLineExpenseError\("load_not_in_company"/.test(w) || !/BankLineExpenseError\("load_attribution_mismatch"/.test(w)) out.push(`${F.writer}: another company's load or a contradicting tag is not refused (C2)`);
  for (const d of ["unitId", "driverId", "trailerId"]) {
    if (w.split(`dimensions.${d},`).length - 1 !== 2) out.push(`${F.writer}: the load's ${d} does not reach both the expense header and its line (C2)`);
  }
  // C3
  if (!/WHEN p_source_type = 'expense' THEN COALESCE\(\s*\(SELECT l\.load_id FROM accounting\.expense_lines l/.test(migrations)) out.push("db/migrations: posting_source_load_id has no 'expense' branch reading the line's load (C3)");
  // C4
  if (!/createExpenseFromFuelTransaction\(/.test(src.fuelPost)) out.push(`${F.fuelPost}: the card fill at bank match does not create its fuel expense document (C4)`);
  if (!/adoptRelayFillExpenseDocument\(/.test(src.fuelPost)) out.push(`${F.fuelPost}: the Relay fill at bank match does not adopt its fuel expense document (C4)`);
  return out;
}

function load(fromMain) {
  const read = (rel) => {
    if (fromMain) {
      const r = spawnSync("git", ["show", `origin/main:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      return r.status === 0 ? r.stdout : "";
    }
    return existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), "utf8") : "";
  };
  const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const dir = resolve(ROOT, "db/migrations");
  const migrations = readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .filter((t) => t.includes("posting_source_load_id"))
    .join("\n");
  return { src, migrations };
}

if (process.argv.includes("--selftest")) {
  const { src, migrations } = load(false);
  const base = check(src, migrations);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base);
    process.exit(1);
  }
  const plant = (k, from, to) => ({ ...src, [k]: src[k].replace(from, to) });
  const plants = [
    ["C1 tag-only categorize", plant("feedGl", "return postBankLineAsExpenseOnClient(client, input, decision)", "return { posted: false }")],
    ["C1 no load on the document", plant("feedGl", "loadId: line.load_id", "loadId: null")],
    ["C2 EXP- for a load", plant("engine", "const n = await generateExpenseNumber(", "const n = await nextNumber(")],
    ["C2 no load link", { ...src, engine: src.engine.replaceAll("insertExpenseLoadLink(", "noLink(") }],
    ["C2 tags trusted over the load", plant("writer", "reconcileExpenseWithLoad(input, load)", "input")],
    ["C2 line keeps the raw tag", plant("writer", "dimensions.driverId,", "input.driverId ?? null,")],
    ["C4 card fill without a document", { ...src, fuelPost: src.fuelPost.replaceAll("createExpenseFromFuelTransaction(", "skip(") }],
  ];
  for (const [name, planted] of plants) {
    if (check(planted, migrations).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  if (check(src, migrations.replaceAll("WHEN p_source_type = 'expense'", "WHEN p_source_type = 'expense_x'")).length === 0) {
    console.error('SELFTEST FAIL: plant "C3 postings without the load" not caught');
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${plants.length + 1} plants caught`);
  process.exit(0);
}

const againstMain = process.argv.includes("--against-main");
const { src, migrations } = load(againstMain);
const findings = check(src, migrations);
if (!againstMain) {
  const top = spawnSync(process.execPath, [resolve(ROOT, TOP)], { cwd: ROOT, encoding: "utf8" });
  if (top.status !== 0) findings.push(`${TOP}: ${(top.stderr || top.stdout).trim().split("\n").slice(-2).join(" | ")} (C5)`);
}
if (findings.length) {
  console.error(`verify-bank-categorize-to-load-creates-expense-document FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-bank-categorize-to-load-creates-expense-document PASS — categorize-to-load and the fuel fill at bank match create expense documents on the load (spine number, load link, unit/driver/trailer from the load, postings carry load_id)");
