#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — static invariant guard for register rows 127-130; no surface wiring leaf to register. */
// ACCT-F11070 — register rows 127 (ENG-48) · 128 (ENG-49) · 129 (ENG-50) · 130 (ENG-51). Static, no database. Each rule names the
// root cause it locks; --selftest plants each violation on an in-memory copy of the real file and proves the rule reds.
//
//   R127-a  statement-card-credit-repair reads NO account by number: both asserted accounts resolve by role
//           (company_fuel_advance_expense, fuel_card_payable_dreamline); no number-keyed helper, no '5000' / '2510' literal.
//   R127-b  verify-fuel-expense-one-to-one grains to the PURCHASE (Relay fill) and reads each document along its posting chain
//           (never "own entry minus line-reversed lines", which read every reclassified document as 0¢ — 13563-1).
//   R127-c  verify-diesel-expense-fuel-dedupe baseline: duplicate_fill_pairs <= 4 (measured 11-03) and diesel_expenses_off_fuel_source = 0
//           (ACCT-F11107 2026-11-10: replaces the retired live_diesel_expenses <= 314 count, which grew with every ingest).
//   R128    every per-load / per-settlement expense cost read model signs a CREDIT document negative (signedExpenseCentsSql /
//           expenseSignSql) and buckets a statement adjustment with its receipt (expenseEffectiveFuelRowIdSql); no bare
//           SUM(e.total_amount_cents). The AlwaysTrack parity guard uses the same rule.
//   R129    accounting.invoices.amount_paid_cents has ONE writer — the trigger accounting.recompute_invoice_paid() on
//           payment_applications. No backend source assigns the column; the two posters record relief as an application.
//   R130    Book Load records the source of every miles field it writes (record_booked_sources → recordBookedMilesSources).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-rows-127-130";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  repair: "apps/backend/src/fuel/statement-card-credit-repair.service.ts",
  oneToOne: "scripts/verify-fuel-expense-one-to-one.mjs",
  dedupeBaseline: "scripts/verify-diesel-expense-fuel-dedupe.baseline.json",
  signed: "apps/backend/src/accounting/expense-signed-cents.sql.ts",
  rollup: "apps/backend/src/accounting/load-cost-rollup.sql.ts",
  costDocs: "apps/backend/src/accounting/load-costs-live-documents.sql.ts",
  profitability: "apps/backend/src/dispatch/load-profitability.service.ts",
  unitSplit: "apps/backend/src/accounting/load-unit-cost-split.routes.ts",
  parity: "scripts/verify-alwaystrack-parity.mjs",
  relief: "apps/backend/src/accounting/invoice-relief-application.service.ts",
  factoringPoster: "apps/backend/src/accounting/factoring-posting/poster.service.ts",
  faroReserve: "apps/backend/src/factoring/faro-reserve-entries.service.ts",
  bookLoad: "apps/backend/src/dispatch/book-load.service.ts",
  relearn: "apps/backend/src/outbox/handlers/dispatch-relearn-load-miles.handler.ts",
  miles: "apps/backend/src/dispatch/mileage/miles-recommendations.service.ts",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Every non-test backend .ts file (for the one-writer rule). */
function backendSources() {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(rel); }
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && !e.name.endsWith(".d.ts")) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8");
    }
  };
  walk("apps/backend/src");
  return out;
}

// A write of the invoice paid column: `amount_paid_cents = <value>` inside SQL (SET list / ON CONFLICT), not a comparison in JS.
const PAID_ASSIGN = /\bamount_paid_cents\s*=\s*(\$\d|COALESCE|EXCLUDED|\d|v_|\(|[a-z_]+\s*\+)/i;
const BARE_SUM = /\bSUM\(\s*e\.total_amount_cents\s*\)/i;

export function problems(g, sources) {
  const p = [];
  // R127-a
  if (/account_number\s*=\s*'(5000|2510)'|acctNet\(c,\s*companyId,\s*"\d+"\)|"2510"\)|"5000"\)/.test(g.repair)) p.push("R127-a statement-card-credit-repair reads an account by number");
  if (!/acctNetByRole\(c, companyId, CARD_CREDIT_REPAIR_ROLES\.cardPayable\)/.test(g.repair) || !/cardPayable: "fuel_card_payable_dreamline"/.test(g.repair)) p.push("R127-a the card payable does not resolve by its role (fuel_card_payable_dreamline)");
  // R127-b
  if (!/export function purchaseKey\(/.test(g.oneToOne) || !/relay_fuel_transaction_id \? `relay:/.test(g.oneToOne)) p.push("R127-b the one-to-one guard is not grained to the purchase (Relay fill)");
  const chainSql = /export const CHAIN_SQL = `([\s\S]*?)`;/.exec(g.oneToOne)?.[1] ?? "";
  if (!/p\.source_transaction_type = s\.st AND p\.source_transaction_id = s\.sid/.test(chainSql) || /reversed_by_line_id IS NULL/.test(chainSql)) p.push("R127-b the one-to-one guard does not read documents along their posting chain");
  // R127-c
  try {
    const b = JSON.parse(g.dedupeBaseline);
    if (!(Number(b.duplicate_fill_pairs) <= 4)) p.push(`R127-c dedupe baseline duplicate_fill_pairs ${b.duplicate_fill_pairs} > 4 (measured 11-03)`);
    if (Number(b.diesel_expenses_off_fuel_source) !== 0) p.push(`R127-c dedupe baseline diesel_expenses_off_fuel_source ${b.diesel_expenses_off_fuel_source} is not 0 (measured 0 on 2026-11-10)`);
  } catch { p.push("R127-c dedupe baseline unreadable"); }
  // R128
  if (!/export function signedExpenseCentsSql/.test(g.signed) || !/is_credit IS TRUE THEN -/.test(g.signed)) p.push("R128 the signed-cost rule is missing");
  for (const [k, needs] of [["rollup", /signedExpenseCentsSql\("e"\)[\s\S]*expenseEffectiveFuelRowIdSql\("e"\)/], ["costDocs", /expenseSignSql\("e"\)[\s\S]*signedExpenseCentsSql\("e"\)/], ["profitability", /signedExpenseCentsSql\("e"\)/], ["unitSplit", /signedExpenseCentsSql\("e"\)/]]) {
    if (BARE_SUM.test(g[k])) p.push(`R128 ${F[k]} sums e.total_amount_cents unsigned (a card credit counts as a cost)`);
    if (!needs.test(g[k])) p.push(`R128 ${F[k]} does not use the signed-cost rule`);
  }
  if (!/sum\(\$\{SIGNED_EXPENSE_CENTS\}\)/.test(g.parity) || !/ft\.id = \$\{EFFECTIVE_FUEL_ROW\} AND ft\.fuel_type = 'diesel'/.test(g.parity)) p.push("R128 the AlwaysTrack parity EXPENSES dimension is unsigned or ignores the adjusted receipt");
  // R129
  for (const [rel, src] of Object.entries(sources)) {
    const lines = src.split("\n");
    lines.forEach((line, i) => { if (PAID_ASSIGN.test(line) && !/^\s*(\/\/|\*)/.test(line)) p.push(`R129 ${rel}:${i + 1} assigns amount_paid_cents (the one writer is accounting.recompute_invoice_paid)`); });
  }
  if (!/INSERT INTO accounting\.payment_applications/.test(g.relief)) p.push("R129 the relief writer does not record an application");
  if (!/raiseInvoicePaidTo\(/.test(g.factoringPoster)) p.push("R129 the factoring poster does not record its relief as an application");
  if (!/applyInvoiceRelief\(/.test(g.faroReserve)) p.push("R129 the Faro short-pay path does not record its relief as an application");
  // R130
  if (!/record_booked_sources: true/.test(g.bookLoad) || !/bookedMilesFields\(input\)\.length/.test(g.bookLoad)) p.push("R130 Book Load does not queue the source record for the miles it wrote");
  if (!/payload\.record_booked_sources === true \? await recordBookedMilesSources\(/.test(g.relearn)) p.push("R130 the re-learn handler does not record booked miles sources");
  if (!/export async function recordBookedMilesSources[\s\S]*?source: "manual", manualValue: Number\(cur\.value\)/.test(g.miles)) p.push("R130 booked miles are not recorded as the value as booked ('manual', value unchanged)");
  return p;
}

function load() {
  return Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
}

function selftest() {
  const g = load();
  const s = backendSources();
  const cases = [
    ["real tree clean", problems(g, s).length === 0],
    ["R127-a a number-keyed 2510 read fails", problems({ ...g, repair: g.repair + '\nconst x = await acctNet(c, companyId, "2510");' }, s).some((x) => x.startsWith("R127-a"))],
    ["R127-a an account_number = '5000' literal fails", problems({ ...g, repair: g.repair + "\n// a.account_number = '5000'" }, s).some((x) => x.startsWith("R127-a"))],
    ["R127-b the old reversed-line rule fails", problems({ ...g, oneToOne: g.oneToOne.replace("JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL AND je.status = 'posted'", "JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND p.reversed_by_line_id IS NULL") }, s).some((x) => x.startsWith("R127-b"))],
    ["R127-b a per-row grain fails", problems({ ...g, oneToOne: g.oneToOne.replace("export function purchaseKey(", "export function rowKey(") }, s).some((x) => x.startsWith("R127-b"))],
    ["R127-c a raised off-source ceiling fails", problems({ ...g, dedupeBaseline: g.dedupeBaseline.replace(/"diesel_expenses_off_fuel_source":\s*\d+/, '"diesel_expenses_off_fuel_source": 1') }, s).some((x) => x.startsWith("R127-c"))],
    ["R127-c a raised pair ceiling fails", problems({ ...g, dedupeBaseline: g.dedupeBaseline.replace(/"duplicate_fill_pairs":\s*\d+/, '"duplicate_fill_pairs": 6') }, s).some((x) => x.startsWith("R127-c"))],
    ["R128 an unsigned rollup fails", problems({ ...g, rollup: g.rollup + "\nCOALESCE(SUM(e.total_amount_cents), 0)" }, s).some((x) => x.startsWith("R128"))],
    ["R128 unsigned cost documents fail", problems({ ...g, costDocs: g.costDocs.replaceAll('expenseSignSql("e")', "1") }, s).some((x) => x.startsWith("R128"))],
    ["R128 unsigned parity fails", problems({ ...g, parity: g.parity.replace("sum(${SIGNED_EXPENSE_CENTS})", "sum(e.total_amount_cents)") }, s).some((x) => x.startsWith("R128"))],
    ["R129 a direct SET of the paid column fails", problems(g, { ...s, "apps/backend/src/x.ts": "await q(`UPDATE accounting.invoices SET amount_paid_cents = $2 WHERE id = $1`)" }).some((x) => x.startsWith("R129"))],
    ["R129 an increment of the paid column fails", problems(g, { ...s, "apps/backend/src/y.ts": "  SET amount_paid_cents = COALESCE(amount_paid_cents, 0) + $2::bigint," }).some((x) => x.startsWith("R129"))],
    ["R129 a JS comparison passes", problems(g, { ...s, "apps/backend/src/z.ts": "if (row.amount_paid_cents === 0) return;" }).length === 0],
    ["R129 a poster without the application fails", problems({ ...g, factoringPoster: g.factoringPoster.replaceAll("raiseInvoicePaidTo(", "nope(") }, s).some((x) => x.startsWith("R129"))],
    ["R130 Book Load without the source record fails", problems({ ...g, bookLoad: g.bookLoad.replace("record_booked_sources: true", "x: true") }, s).some((x) => x.startsWith("R130"))],
    ["R130 a 'document' source for booked miles fails", problems({ ...g, miles: g.miles.replace('source: "manual", manualValue: Number(cur.value)', 'source: "document"') }, s).some((x) => x.startsWith("R130"))],
  ];
  const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(load(), backendSources());
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — R127 role-resolved repair accounts, purchase-grained + chain-aware one-to-one, dedupe ceilings 4 pairs / 0 off-source; R128 signed expense cost on every load / settlement read model; R129 one writer of amount_paid_cents; R130 booked miles carry their source`);
}
