#!/usr/bin/env node
/**
 * verify-rows-85-24-98 — register rows 85 (R73 driver pay accrual), 24 (R217 empty settlements), 98 (R86 settlement numbers).
 *
 * ROW 85 LAW: every delivered load's driver bill accrues to A/P at delivery through THE one poster
 * (accrueDriverPayAtDeliveryInClientTx -> createBillInClientTx + postBillDocumentInClientTx). A bill on an OPEN,
 * unposted settlement is NOT excluded (prod 11-03: 8 such bills on 7 open settlements had no A/P bill — 13663 P-0115,
 * 13688 P-0114, …). The engine, its stamp and the 15-min sweep share ONE eligibility expression
 * (deliveryAccrualSkipReasonSql), which names every skip (already_accrued · settlement_posted ·
 * team_bill_on_open_settlement · settlement_pays_less_than_bill). Every accrual line carries an item (THE ONE MAP:
 * earnings -> loaded) — an item-less 6890 line is refused by accounting.enforce_line_categorization.
 *
 * ROW 24 LAW: the close engine refuses an empty settlement by name (SETTLEMENT_HAS_NO_LIVE_LINES); a live line is
 * is_active = true AND voided_at IS NULL. The only $0 close is the owner's weekly-salary ruling.
 *
 * ROW 98 LAW: a company settlement carries its driver settlement's number. A header born under the open tour's
 * P-number takes the AlwaysTrack number at close (prod 11-03: header a188e47a read "P-0119" while P-0119 = 5854);
 * a number held by another header is refused by name.
 *
 * Usage: node scripts/verify-rows-85-24-98.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-rows-85-24-98";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ACCRUAL = "apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts";
const SWEEP = "apps/backend/src/accounting/driver-pay-accrual-sweep.service.ts";
const CLOSE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const COMPANY = "apps/backend/src/accounting/company-settlement-close.service.ts";

export function checkRow85({ accrualSrc, sweepSrc }) {
  const p = [];
  if (!/export function deliveryAccrualSkipReasonSql\(/.test(accrualSrc)) p.push("accrual: deliveryAccrualSkipReasonSql is not exported");
  for (const r of ["already_accrued", "settlement_posted", "team_bill_on_open_settlement", "settlement_pays_less_than_bill"]) {
    if (!accrualSrc.includes(`'${r}'`)) p.push(`accrual: skip reason '${r}' is not named`);
  }
  if (!/WHEN \$\{db\}\.settled_in_settlement_id IS NULL THEN NULL/.test(accrualSrc)) p.push("accrual: an unsettled bill no longer accrues");
  if (!/s_acc\.posted_at IS NOT NULL OR EXISTS \(SELECT 1 FROM driver_finance\.driver_settlement_gl_runs/.test(accrualSrc)) {
    p.push("accrual: a settlement whose close posted is not recognised (pay would post twice)");
  }
  if (/settled_in_settlement_id IS NULL AND db\.accrued_bill_id IS NULL|AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL/.test(accrualSrc)) {
    p.push("accrual: the blanket 'never on any settlement' exclusion is back");
  }
  if (!/AND \$\{deliveryAccrualSkipReasonSql\("db"\)\} IS NULL/.test(accrualSrc)) p.push("accrual: the stamp UPDATE does not use the shared eligibility");
  if (!/deliveryAccrualSkipReasonSql\("db"\)\} AS skip_reason/.test(accrualSrc)) p.push("accrual: the engine select does not compute skip_reason from the shared eligibility");
  if (!accrualSrc.includes('resolvePayComponentItem(client as never, opco, l.component ?? "loaded")')) p.push("accrual: a single-line accrual names no item (line_item_required)");
  if (!/import \{[^}]*deliveryAccrualSkipReasonSql[^}]*\} from "\.\.\/driver-finance\/driver-pay-delivery-accrual\.service\.js"/.test(sweepSrc)) {
    p.push("sweep: does not import the shared eligibility");
  }
  if (!/db\.due_date_basis = 'delivered'\s*\n\s*AND \$\{deliveryAccrualSkipReasonSql\("db"\)\} IS NULL/.test(sweepSrc)) p.push("sweep: delivered arm does not use the shared eligibility");
  if (/AND db\.settled_in_settlement_id IS NULL\)/.test(sweepSrc)) p.push("sweep: the blanket settled exclusion is back");
  return p;
}

export function checkRow24({ closeSrc }) {
  const p = [];
  if (!/const liveLineCount = await client\.query[\s\S]{0,500}AND \$\{activeSettlementLine\("sl", "s_live"\)\}`/.test(closeSrc)) {
    p.push("close: liveLineCount does not count active AND not-voided lines");
  }
  const at = closeSrc.indexOf("if (Number(liveLineCount.rows[0]?.n ?? 0) === 0)");
  const block = at >= 0 ? closeSrc.slice(at, at + 4000) : "";
  if (!block.includes('"SETTLEMENT_HAS_NO_LIVE_LINES"')) p.push("close: empty settlement is not refused by name");
  if (!block.includes("driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)'")) p.push("close: the $0 exception is not the weekly-salary ruling");
  return p;
}

export function checkRow98({ companySrc }) {
  const p = [];
  const call = companySrc.indexOf("await renumberCompanySettlementToDriverNumber(client,");
  const before = companySrc.indexOf("const beforeRes = await client.query");
  if (call < 0 || before < 0 || call > before) p.push("company close: header is not renumbered before it closes");
  if (!/export async function renumberCompanySettlementToDriverNumber\(/.test(companySrc)) p.push("company close: renumber function missing");
  if (!companySrc.includes('"company_settlement_number_taken"')) p.push("company close: a taken number is not refused by name");
  if (!/row\.header_number !== row\.p_number/.test(companySrc)) p.push("company close: renumber is not limited to a header still on its own P-number");
  return p;
}

function liveInputs() {
  return { r85: { accrualSrc: read(ACCRUAL), sweepSrc: read(SWEEP) }, r24: { closeSrc: read(CLOSE) }, r98: { companySrc: read(COMPANY) } };
}

if (process.argv.includes("--selftest")) {
  const live = liveInputs();
  const cases = [
    ["live tree: row 85 clean", checkRow85(live.r85).length === 0],
    ["live tree: row 24 clean", checkRow24(live.r24).length === 0],
    ["live tree: row 98 clean", checkRow98(live.r98).length === 0],
    ["plant: blanket settled exclusion in the stamp is caught",
      checkRow85({ ...live.r85, accrualSrc: live.r85.accrualSrc + '\n" AND accrued_bill_id IS NULL AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL"' }).some((x) => x.includes("blanket"))],
    ["plant: posted-settlement arm removed is caught",
      checkRow85({ ...live.r85, accrualSrc: live.r85.accrualSrc.replace("s_acc.posted_at IS NOT NULL OR EXISTS", "false OR EXISTS") }).some((x) => x.includes("twice"))],
    ["plant: skip reason dropped is caught",
      checkRow85({ ...live.r85, accrualSrc: live.r85.accrualSrc.replaceAll("'settlement_pays_less_than_bill'", "NULL") }).length > 0],
    ["plant: item-less accrual line is caught",
      checkRow85({ ...live.r85, accrualSrc: live.r85.accrualSrc.replace('l.component ?? "loaded"', "l.component!") }).some((x) => x.includes("item"))],
    ["plant: sweep back on settled IS NULL is caught",
      checkRow85({ ...live.r85, sweepSrc: live.r85.sweepSrc.replace('AND ${deliveryAccrualSkipReasonSql("db")} IS NULL)', "AND db.settled_in_settlement_id IS NULL)") }).some((x) => x.includes("sweep"))],
    ["plant: voided lines counted live is caught",
      checkRow24({ closeSrc: live.r24.closeSrc.replace('AND ${activeSettlementLine("sl", "s_live")}`', "AND sl.is_active = true`") }).length > 0],
    ["plant: empty refusal removed is caught",
      checkRow24({ closeSrc: live.r24.closeSrc.replace('"SETTLEMENT_HAS_NO_LIVE_LINES",\n', '"X",\n') }).some((x) => x.includes("by name"))],
    ["plant: renumber call removed is caught",
      checkRow98({ companySrc: live.r98.companySrc.replace("await renumberCompanySettlementToDriverNumber(client,", "void (") }).some((x) => x.includes("renumbered"))],
    ["plant: taken-number refusal removed is caught",
      checkRow98({ companySrc: live.r98.companySrc.replaceAll('"company_settlement_number_taken"', '"x"') }).length > 0],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const live = liveInputs();
const problems = [
  ...checkRow85(live.r85).map((p) => `[85] ${p}`),
  ...checkRow24(live.r24).map((p) => `[24] ${p}`),
  ...checkRow98(live.r98).map((p) => `[98] ${p}`),
];
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`${LABEL} FAIL (${problems.length})`);
  process.exit(1);
}
console.log(`${LABEL} PASS — 85: one eligibility for engine/stamp/sweep, open-settlement bills accrue, skips named, every line itemed · 24: empty refused by name (activeSettlementLine: active AND not voided) · 98: company settlement takes its driver settlement's number at close`);
