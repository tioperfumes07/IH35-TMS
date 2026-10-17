#!/usr/bin/env node
// ============================================================================
// verify-bills-amount-cents-canonical.mjs — STATIC CI GUARD (non-financial)
// ----------------------------------------------------------------------------
// Regression fence for REPAIR G6-4 (docs/specs/repairs/REPAIR-G6-4-BILLS-AMOUNT-CENTS-CANONICAL.md).
//
// The shipped migration 202607051200_g6_4_bills_amount_cents_canonical.sql made
// accounting.bills.amount_cents the single canonical money column and added
//   CHECK (amount_cents IS NOT NULL)  [NOT VALID]  (bills_amount_cents_present)
// so every NEW write must set the canonical integer-cents value. The dollars
// mirror total_amount is deprecated. This is the STATIC half of that fix (the
// DB CHECK is the runtime half); the repair doc §5 explicitly asked for it and
// noted it was not yet built.
//
// WHY A GUARD: a later migration could drop the constraint, or a new
// `INSERT INTO accounting.bills` could omit amount_cents and reintroduce a
// NULL-canonical / dollars-only row — the exact drift G6-4 closed. This guard
// fails CI on either.
//
// This does NOT do the money backfill / VALIDATE / SET NOT NULL — those mutate
// prod money data and are owner-gated (repair doc §3). This is pure tooling.
//
// Assertions (all static, no DB — cannot silently SKIP):
//   A1  the G6-4 migration file exists.
//   A2  it adds constraint bills_amount_cents_present as a presence guard
//       (amount_cents IS NOT NULL).
//   A3  NO migration DROPs constraint bills_amount_cents_present.
//   A4  NO migration makes accounting.bills.amount_cents nullable again
//       (ALTER COLUMN amount_cents DROP NOT NULL).
//   A5  every PRODUCTION `INSERT INTO accounting.bills (...)` column list that
//       is a real bill insert includes amount_cents (tests excluded — they seed
//       fixtures directly and are not the app write-path).
//
// Self-test:  node scripts/verify-bills-amount-cents-canonical.mjs --selftest
// LINKAGE: accounting.bills money-representation integrity (G6-4). Additive only. Read-only.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const G6_4 = "202607051200_g6_4_bills_amount_cents_canonical.sql";
const CONSTRAINT = "bills_amount_cents_present";

const fail = (id, msg, errs) => errs.push(`[${id}] ${msg}`);

/** Strip -- line comments and /* *​/ block comments so we test executable SQL. */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * Does this INSERT-INTO-accounting.bills column list include amount_cents?
 * Only inspects the parenthesized column list immediately after the table name,
 * so a later reference to total_amount in VALUES/ON CONFLICT can't fool it.
 */
export function billsInsertListsAmountCents(sqlText) {
  const results = [];
  const re = /INSERT\s+INTO\s+accounting\.bills\s*\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(sqlText)) !== null) {
    const cols = m[1]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    results.push({ hasAmountCents: cols.includes("amount_cents"), cols });
  }
  return results;
}

/**
 * 443.182 C (b58baf82d0) made insertBillHeaderOnClient (bills.service.ts) THE one INSERT INTO accounting.bills, with a
 * column list built from its callers (`${names.join(", ")}`). A dynamic list cannot be read statically, so for that one
 * writer A5 is asserted in two halves instead: (1) the writer itself refuses a header without amount_cents, and (2) every
 * production caller of insertBillHeaderOnClient / writeBillDocumentOnClient names amount_cents in what it passes.
 */
export const DYNAMIC_LIST_RE = /INSERT\s+INTO\s+accounting\.bills\s*\(\$\{names\.join\(", "\)\}\)/;
export const WRITER_REFUSES_RE = /if \(!names\.includes\("amount_cents"\)\) throw new Error\("bill_insert_amount_cents_required"\)/;
export function callerSitesMissingAmountCents(text) {
  // Call sites (not the import, not the definitions, not the engine forwarding its own doc.header).
  const calls = [...text.matchAll(/\b(?:insertBillHeaderOnClient|writeBillDocumentOnClient)\s*(?:<[^>]*>)?\s*\(\s*client\s*,\s*(?!doc\.header)(?=\S)/g)].length;
  const named = (text.match(/\[\s*"amount_cents"\s*,/g) ?? []).length;
  return Math.max(0, calls - named);
}

function isProductionSource(rel) {
  return (
    rel.startsWith("apps/") &&
    /\.(ts|tsx|js|jsx)$/.test(rel) &&
    !rel.includes("__tests__") &&
    !/\.(test|spec)\./.test(rel) &&
    !rel.includes("/test/") &&
    !rel.includes("/fixtures/")
  );
}

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function run() {
  const errs = [];

  // ---- migration assertions --------------------------------------------------
  const g6Path = path.join(MIGRATIONS_DIR, G6_4);
  if (!fs.existsSync(g6Path)) {
    fail("A1", `G6-4 migration missing: db/migrations/${G6_4}`, errs);
  } else {
    const sql = stripSqlComments(fs.readFileSync(g6Path, "utf8"));
    const addsConstraint =
      new RegExp(`ADD\\s+CONSTRAINT\\s+${CONSTRAINT}`, "i").test(sql) &&
      /CHECK\s*\(\s*amount_cents\s+IS\s+NOT\s+NULL\s*\)/i.test(sql);
    if (!addsConstraint) {
      fail("A2", `${G6_4} must ADD CONSTRAINT ${CONSTRAINT} CHECK (amount_cents IS NOT NULL)`, errs);
    }
  }

  let migrationFiles = [];
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    fail("A0", `cannot read ${MIGRATIONS_DIR}`, errs);
  }
  for (const f of migrationFiles) {
    const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    if (new RegExp(`DROP\\s+CONSTRAINT\\s+(IF\\s+EXISTS\\s+)?${CONSTRAINT}`, "i").test(sql)) {
      fail("A3", `migration ${f} DROPs constraint ${CONSTRAINT} — the G6-4 presence guard must not be removed`, errs);
    }
    if (/ALTER\s+COLUMN\s+amount_cents\s+DROP\s+NOT\s+NULL/i.test(sql) &&
        /accounting\.bills|ALTER\s+TABLE\s+(accounting\.)?bills/i.test(sql)) {
      fail("A4", `migration ${f} makes accounting.bills.amount_cents nullable again (DROP NOT NULL)`, errs);
    }
  }

  // ---- production INSERT-site assertion --------------------------------------
  let prodInsertSites = 0;
  for (const abs of walk(path.join(ROOT, "apps"))) {
    const rel = path.relative(ROOT, abs);
    if (!isProductionSource(rel)) continue;
    let text;
    try { text = fs.readFileSync(abs, "utf8"); } catch { continue; }
    if (!/INSERT\s+INTO\s+accounting\.bills/i.test(text)) continue;
    if (DYNAMIC_LIST_RE.test(text)) {
      prodInsertSites++;
      if (!WRITER_REFUSES_RE.test(text)) {
        fail("A5", `${rel}: the one bill header writer (dynamic column list) must refuse a bill without amount_cents (bill_insert_amount_cents_required)`, errs);
      }
    }
    for (const site of billsInsertListsAmountCents(text.replace(DYNAMIC_LIST_RE, ""))) {
      prodInsertSites++;
      if (!site.hasAmountCents) {
        fail("A5", `${rel}: INSERT INTO accounting.bills omits amount_cents (columns: ${site.cols.join(", ")}) — reintroduces the NULL-canonical drift G6-4 closed`, errs);
      }
    }
  }
  // A5 (callers of the one writer): each call site names amount_cents.
  for (const abs of walk(path.join(ROOT, "apps"))) {
    const rel = path.relative(ROOT, abs);
    if (!isProductionSource(rel)) continue;
    let text;
    try { text = fs.readFileSync(abs, "utf8"); } catch { continue; }
    if (!/insertBillHeaderOnClient|writeBillDocumentOnClient/.test(text)) continue;
    const missing = callerSitesMissingAmountCents(text);
    if (missing) fail("A5", `${rel}: ${missing} call(s) of the one bill writer pass no ["amount_cents", …] column`, errs);
  }
  if (prodInsertSites === 0) {
    // Not a hard fail (the writer could legitimately move), but surface it —
    // silent zero is how a guard rots into asserting nothing.
    console.warn("verify:bills-amount-cents-canonical — WARN: found 0 production INSERT INTO accounting.bills sites (writer moved? update this guard)");
  }

  if (!errs.length) {
    console.log(`verify:bills-amount-cents-canonical — PASS (constraint intact; ${prodInsertSites} prod insert site(s) list amount_cents)`);
  }
  return errs;
}

// ------------------------------------------------------------------ selftest --
if (process.argv.includes("--selftest")) {
  const checks = [
    ["comment stripping removes -- and block comments",
      stripSqlComments("a -- x\n/* y */ b").replace(/\s+/g, " ").trim() === "a b"],
    ["INSERT with amount_cents detected",
      billsInsertListsAmountCents("INSERT INTO accounting.bills (id, amount_cents, total_amount) VALUES (1,2,3)")[0].hasAmountCents === true],
    ["INSERT WITHOUT amount_cents flagged",
      billsInsertListsAmountCents("INSERT INTO accounting.bills (id, total_amount) VALUES (1,2)")[0].hasAmountCents === false],
    ["total_amount in VALUES does not fool the column-list check",
      billsInsertListsAmountCents("INSERT INTO accounting.bills (id, total_amount) VALUES (1, amount_cents)")[0].hasAmountCents === false],
    ["multiple INSERT sites all parsed",
      billsInsertListsAmountCents("INSERT INTO accounting.bills (amount_cents) VALUES (1); INSERT INTO accounting.bills (total_amount) VALUES (2)").length === 2],
    ["case-insensitive table match",
      billsInsertListsAmountCents("insert into accounting.bills (amount_cents) values (1)")[0].hasAmountCents === true],
    ["the one writer's dynamic column list is recognised",
      DYNAMIC_LIST_RE.test('const sql = `INSERT INTO accounting.bills (${names.join(", ")}) VALUES (${exprs.join(", ")})`;')],
    ["the one writer without the amount_cents refusal is caught",
      !WRITER_REFUSES_RE.test("const sql = 1; // refusal removed")],
    ["a caller passing no amount_cents column is caught",
      callerSitesMissingAmountCents('await insertBillHeaderOnClient<{ id: string }>(client, [["source", { value: "manual" }]]);') === 1],
    ["a caller passing amount_cents passes",
      callerSitesMissingAmountCents('await writeBillDocumentOnClient(client, { header: [["amount_cents", { value: 1 }]] });') === 0],
    ["the engine forwarding its own doc.header is not a caller",
      callerSitesMissingAmountCents("await insertBillHeaderOnClient<R>(client, doc.header, {});") === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:bills-amount-cents-canonical --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:bills-amount-cents-canonical --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const failures = run();
  if (failures.length) {
    console.error("verify:bills-amount-cents-canonical FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
}
