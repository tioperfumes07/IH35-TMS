#!/usr/bin/env node
// verify-post-signed-settlement-as-signed — ACCT-F11141 (ROUND 8.7): a signed AlwaysTrack settlement is posted EXACTLY as
// signed, in one engine call, superseding whatever the app held for its number and its loads, and nothing is paid twice.
//
// MEASURED (prod 2026-11-10 03:55Z): 22 open P-trips held live earnings lines for loads a signed settlement pays (the
// Creator refused those loads, or the trip would pay them again); prod #5852..#5856 carried the wrong driver / loads for
// their number. On a prod fork the Creator post then died on six engine defects this PR fixes at the root:
//   - the settlement reverse voided an already-reversed net-pay payment (bill_payment_already_voided, 443.339 R12);
//   - the void cascade wrote company_settlements.status 'cancelled' (chk_company_settlements_status allows 'void');
//   - the born tour shell was UPDATEd to status 'closed' without posted_at (tg_settlement_close_requires_posting, ENG-01);
//   - a historical booking pulled fills bought after the load's signed delivery onto it (repoint at booking);
//   - the close's <load>-S supplement bill number was refused by BILL_DISPLAY_ID_PATTERN;
//   - a voided company settlement kept its number (uq_company_settlements_display_id counted dead rows).
// RULES checked here (static, no DB); --selftest plants each defect back and must see it fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-post-signed-settlement-as-signed";
const ROOT = process.cwd();
const F = {
  engine: "apps/backend/src/driver-finance/settlement-creator-post-as-signed.ts",
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
  service: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
  reverse: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  cascade: "apps/backend/src/driver-finance/driver-settlement-void-cascade.service.ts",
  displayId: "apps/backend/src/accounting/display-id.ts",
  restate: "apps/backend/src/driver-finance/settlement-creator-restate-bill.ts",
  stamps: "apps/backend/src/driver-finance/stop-evidence-from-tracking.ts",
  migration: "db/migrations/202616470100_acct_f11141_company_settlement_display_id_live_only.sql",
};

const idx = (s, re) => { const m = re.exec(s); return m ? m.index : -1; };

/** Pure: every rule over the file texts. Returns the broken rules. */
export function problems(t) {
  const p = [];
  const e = t.engine ?? "";
  // 1. the engine: idempotent check -> supersede -> book -> confirm printed fills -> post -> penny-exact totals.
  const fn = e.slice(Math.max(0, e.indexOf("export async function postSignedSettlementAsSigned")));
  const order = [/findAlreadyAsSigned\(/, /supersedeForSignedSettlement\(/, /ensureDispatchedLoadsForCreator\(/, /confirmSignedFillLoads\(/, /postSettlementCreatorInClientTx\(/, /"not_as_signed"/];
  const at = order.map((re) => idx(fn, re));
  if (at.some((x) => x < 0)) p.push(`engine: postSignedSettlementAsSigned must call, in order, already-as-signed -> supersede -> book -> confirm fills -> post -> refuse not_as_signed (missing step ${at.findIndex((x) => x < 0) + 1})`);
  else if (at.some((x, i) => i > 0 && x < at[i - 1])) p.push("engine: the steps run out of order (already-as-signed -> supersede -> book -> confirm fills -> post -> not_as_signed)");
  for (const k of ["got.net !== signedNet", "got.gross !== signedGross", "got.reimb !==", "got.ded !== signedDeductions"]) {
    if (!fn.includes(k)) p.push(`engine: the penny-exact refusal no longer compares ${k.split(" ")[0]}`);
  }
  // 2. reuse the engines: reversals only through the Creator Edit reverse / the settlement engine; no GL written here.
  if (!/voidPriorCreatorSettlementForEdit\(/.test(e) || !/reverseSettlementForVoid\(/.test(e)) p.push("engine: reversals must go through voidPriorCreatorSettlementForEdit / reverseSettlementForVoid");
  if (/journal_entry_postings|INSERT\s+INTO\s+accounting\.journal_entries|postValidatedPostingLines/i.test(e)) p.push("engine: writes GL itself (no new GL math — the posters and the reverse engine post)");
  if (/DELETE\s+FROM/i.test(e)) p.push("engine: deletes a row (void, never delete)");
  if (!/confirmation !== "proposed"\) continue/.test(e)) p.push("engine: a person-confirmed fill could be moved (only a machine's proposal is confirmed — OWNER RULING 443.288)");
  // 2b. entity scope (LST-F11144): the truck lookup is the lease pair; every loads / settlements hop carries the company.
  if (!/FROM mdata\.units u\s+WHERE u\.unit_number = \$2 AND COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/.test(e)) p.push("engine: the truck lookup is not scoped to this company (COALESCE(currently_leased_to_company_id, owner_company_id) = $1)");
  for (const m of e.matchAll(/JOIN mdata\.loads (l2?) ON \1\.id = sl2?\.load_id([^\n]*)/g)) {
    if (!/operating_company_id/.test(m[2])) p.push(`engine: a settlement-line -> mdata.loads ${m[1]} hop is not scoped to the settlement's company`);
  }
  if (/FROM driver_finance\.driver_settlements s WHERE s\.id = l\.presettlement_link_id AND \(/.test(e)) p.push("engine: the presettlement link lookup is not scoped to the load's company");
  // 3. the route.
  if (!/settlement-creator\/post-as-signed/.test(t.routes ?? "") || !/postSignedSettlementAsSigned\(/.test(t.routes ?? "")) p.push("route: POST /api/v1/driver-finance/settlement-creator/post-as-signed is not wired to the engine");
  if (!/dry_run:\s*z\.boolean\(\)\.default\(true\)/.test(t.routes ?? "")) p.push("route: dry_run must default to true");
  // 4. root fixes.
  const svc = t.service ?? "";
  const shell = svc.slice(Math.max(0, svc.indexOf("if (shells.length === 1)")), svc.indexOf("setSettlementSourceDocumentRef", svc.indexOf("if (shells.length === 1)")));
  if (/status\s*=\s*'closed'/.test(shell)) p.push("service: the born tour shell is set to status 'closed' without posted_at (tg_settlement_close_requires_posting)");
  if (!/reuseFuelIds/.test(svc)) p.push("service: postSettlementCreatorInClientTx no longer re-uses the fills a superseded settlement left");
  if (!/WHERE NOT EXISTS \(SELECT 1 FROM driver_finance\.settlement_lines x/.test(svc)) p.push("service: the deduction line is written twice when createSettlementDeduction already materialized it");
  if (!/fuel\.card === "relay" && relayFillId && doc\.outcome === "already_exists"\) continue/.test(svc)) p.push("service: a Relay fill's unposted document is posted by the Creator (credits the wallet — relay_wallet_consumed_only_by_a_relay_fill)");
  if (!/presettlement_linked_by_caller:\s*true/.test(t.seed ?? "")) p.push("seed: the Creator's booking joins the driver's live trip (presettlement_linked_by_caller: true missing)");
  if (!/input\.presettlement_linked_by_caller === true/.test(t.book ?? "")) p.push("book-load: presettlement_linked_by_caller is ignored");
  if (!/source !== "historical_backfill"\)\s*\{\s*const \{ repointFuelReceiptsToLoad \}/.test(t.book ?? "")) p.push("book-load: a historical booking re-points fills bought after its delivery onto it");
  if (!/priorVoid\?\.reversal/.test(t.reverse ?? "")) p.push("reverse: an already-reversed net-pay payment is voided again (bill_payment_already_voided)");
  if (!/no_money/.test(t.reverse ?? "")) p.push("reverse: a zero-money salaried GL row blocks the reverse (SOURCE_POSTING_LINK_MISSING)");
  if (/company_settlements cs\s+SET voided_at = now\(\), status = 'cancelled'/.test(t.cascade ?? "")) p.push("cascade: company_settlements.status 'cancelled' violates chk_company_settlements_status (open|closed|void)");
  if (!/\[0-9\]\{1,12\}-S\)\$\//.test(t.displayId ?? "")) p.push("display-id: the <load>-S supplement bill number is refused");
  if (!/s\.status <> 'open' OR s\.posted_at IS NOT NULL/.test(t.restate ?? "")) p.push("restate: an open, never-posted trip counts as having settled the bill");
  if (!/\(actual_arrival_at IS NULL\) <> \(actual_departure_at IS NULL\)/.test(t.stamps ?? "")) p.push("stamps: a half-stamped stop is never completed");
  if (!/DROP CONSTRAINT IF EXISTS uq_company_settlements_display_id/.test(t.migration ?? "") || !/WHERE voided_at IS NULL/.test(t.migration ?? "")) p.push("migration 202616470100: the company settlement number is not live-only");
  return p;
}

function read() {
  const t = {};
  for (const [k, f] of Object.entries(F)) {
    const full = path.join(ROOT, f);
    t[k] = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  }
  return t;
}

function selftest() {
  const real = read();
  const plant = (k, from, to) => ({ ...real, [k]: (real[k] ?? "").replaceAll(from, to) });
  const cases = [
    ["the current tree passes", problems(real).length, 0],
    ["PLANT: supersede after the post", problems(plant("engine", "const superseded = await supersedeForSignedSettlement(", "const superseded = await (async (...a) => a)(")).length > 0 ? 1 : 0, 1],
    ["PLANT: the net is not compared", problems(plant("engine", "got.net !== signedNet", "false")).length > 0 ? 1 : 0, 1],
    ["PLANT: the engine writes postings", problems({ ...real, engine: `${real.engine}\n// INSERT INTO accounting.journal_entries` }).length > 0 ? 1 : 0, 1],
    ["PLANT: a confirmed fill may move", problems(plant("engine", 'confirmation !== "proposed") continue', 'confirmation === "x") continue')).length > 0 ? 1 : 0, 1],
    ["PLANT: truck lookup unscoped", problems(plant("engine", "WHERE u.unit_number = $2 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid", "WHERE u.unit_number = $2 AND TRUE")).length > 0 ? 1 : 0, 1],
    ["PLANT: l2 hop unscoped", problems(plant("engine", "l2.id = sl2.load_id AND l2.operating_company_id = s.operating_company_id", "l2.id = sl2.load_id")).length > 0 ? 1 : 0, 1],
    ["PLANT: presettlement link unscoped", problems(plant("engine", "s.id = l.presettlement_link_id AND s.operating_company_id = l.operating_company_id AND (", "s.id = l.presettlement_link_id AND (")).length > 0 ? 1 : 0, 1],
    ["PLANT: route unwired", problems(plant("routes", "settlement-creator/post-as-signed", "settlement-creator/post-x")).length > 0 ? 1 : 0, 1],
    ["PLANT: the shell closed without posting", problems(plant("service", "SET period_start = $2::date, period_end = $3::date,", "SET period_start = $2::date, period_end = $3::date, status = 'closed',")).length > 0 ? 1 : 0, 1],
    ["PLANT: the Creator posts a Relay fill's document", problems(plant("service", 'fuel.card === "relay" && relayFillId && doc.outcome === "already_exists") continue', "false")).length > 0 ? 1 : 0, 1],
    ["PLANT: the seeder joins the live trip", problems(plant("seed", "presettlement_linked_by_caller: true", "presettlement_linked_by_caller: false")).length > 0 ? 1 : 0, 1],
    ["PLANT: historical booking repoints", problems(plant("book", 'source !== "historical_backfill") {', "true) {")).length > 0 ? 1 : 0, 1],
    ["PLANT: re-void a reversed payment", problems(plant("reverse", "priorVoid?.reversal", "priorVoid?.nothing")).length > 0 ? 1 : 0, 1],
    ["PLANT: cascade writes 'cancelled'", problems(plant("cascade", "SET voided_at = now(), status = 'void'", "SET voided_at = now(), status = 'cancelled'")).length > 0 ? 1 : 0, 1],
    ["PLANT: -S refused", problems(plant("displayId", "|[0-9]{1,12}-S)$/", ")$/")).length > 0 ? 1 : 0, 1],
    ["PLANT: open trip settles the bill", problems(plant("restate", "s.status <> 'open' OR s.posted_at IS NOT NULL", "true")).length > 0 ? 1 : 0, 1],
    ["PLANT: half stamps left", problems(plant("stamps", "(actual_arrival_at IS NULL) <> (actual_departure_at IS NULL)", "false")).length > 0 ? 1 : 0, 1],
    ["PLANT: number held by dead rows", problems({ ...real, migration: null }).length > 0 ? 1 : 0, 1],
  ];
  let bad = 0;
  for (const [n, got, want] of cases) { console.log(`${got === want ? "ok  " : "FAIL"} ${n} (${got}, want ${want})`); if (got !== want) bad++; }
  if (problems(real).length) for (const x of problems(real)) console.log(`  ✗ ${x}`);
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  const p = problems(read());
  if (p.length) { for (const x of p) console.error(`  ✗ ${x}`); console.error(`${LABEL}: FAIL — ${p.length} rule(s) broken`); process.exit(1); }
  console.log(`${LABEL}: PASS — post-as-signed supersedes then posts through the Creator, penny-exact, idempotent; 10 engine root fixes in place`);
}
