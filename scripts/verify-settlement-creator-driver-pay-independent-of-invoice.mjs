#!/usr/bin/env node
/**
 * GUARD — ROUND 443.4: CUSTOMER REVENUE NEVER ENTERS DRIVER PAY.
 *
 * MEASURED on main 745714fe5d: settlement-creator.service.ts:1496-1500 paid the driver line_haul_amount_cents (the
 * drawer's "Invoice Amt") + customer accessorials; the preview paid rate x miles, so preview and post disagreed and
 * settlement_lines_item_qty_rate_amount_check refused the post (reproduced on a prod fork, ROUND 443.3). The pay item
 * was a "Driver Pay-CDL-…" literal for every driver. The feed gate's driver-bill checks read driver_bills.revoked_at,
 * a column that does not exist, so they errored on every settlement.
 *
 * STATIC
 *   1. the post's earnings use creatorLoadedPayCents / creatorPayMiles; the earnings block never reads
 *      line_haul_amount_cents or accessorials; the preview uses the same creatorLoadedPayCents
 *   2. the pay item comes from resolveDriverPayItems (mdata.drivers.has_b1_visa, Lead ruling c890d88); no "Driver Pay-CDL-" literal in the service
 *   3. miles x rate rounds like Postgres numeric (milesTimesRateCents)
 *   4. feed gate: one live priced driver bill per per-mile load; bills linked to the settlement; no driver_bills.revoked_at
 * Run: node scripts/verify-settlement-creator-driver-pay-independent-of-invoice.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-driver-pay-independent-of-invoice";
const F = {
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  pay: "apps/backend/src/driver-finance/settlement-creator-empty-pay.ts",
  item: "apps/backend/src/driver-finance/settlement-creator-pay-item.ts",
  rule: "apps/backend/src/driver-finance/deadhead-rule.ts",
  gate: "apps/backend/src/driver-finance/feed-gate/feed-gate.checks.ts",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-driver-pay.test.ts",
};

export function problems(src) {
  const p = [];
  const s = src.svc;
  const a = s.indexOf("// ROUND 443.4 — driver pay = pay rate x short miles");
  const b = s.indexOf("// Invoices do not change driver pay", a);
  const block = a >= 0 && b > a ? s.slice(a, b) : "";
  if (!block) p.push("the 443.4 earnings block is missing");
  if (/line_haul_amount_cents|\.accessorials\b|accessorialCents/.test(block.replace(/\/\/[^\n]*/g, ""))) p.push("the earnings block reads the invoice amount or customer accessorials");
  if (!/const loadedCents = creatorLoadedPayCents\(load\)/.test(block)) p.push("the post's loaded pay must be creatorLoadedPayCents");
  if (!/const loaded = creatorLoadedPayCents\(load\) \?\? 0;/.test(s)) p.push("the preview must use the same creatorLoadedPayCents");
  if (/Driver Pay-CDL-/.test(s)) p.push('a "Driver Pay-CDL-" literal remains in the service');
  if (!/const payItems = await resolveDriverPayItems\(/.test(s) || !/payItems\.loaded\.id/.test(block) || !/payItems\.empty\.id/.test(block)) p.push("the pay item must come from resolveDriverPayItems (the pay card)");
  if (!/"driver_pay_item_unresolved"/.test(src.item) || /\?\?\s*"cdl"|default:\s*"cdl"/.test(src.item)) p.push("an unresolved pay item must refuse, never default to CDL");
  if (!/flag === true \? "mexico_b1" : flag === false \? "cdl" : null/.test(src.item) || /UPDATE mdata\.drivers/i.test(src.item)) p.push("pay item family = has_b1_visa (true B1 / false CDL / NULL refuse), never written by the Creator (Lead ruling c890d88)");
  if (!/return milesTimesRateCents\(miles, rate\)/.test(src.pay) || !/toFixed\(6\)/.test(src.rule)) p.push("miles x rate must round like Postgres numeric");
  if (/driver_bills (db|b) WHERE[^`]*revoked_at/.test(src.gate)) p.push("feed gate reads driver_bills.revoked_at (no such column)");
  if (!/key: "settlement\.driver_bills_linked"/.test(src.gate) || !/b\.live = 1 AND b\.gross > 0/.test(src.gate)) p.push("feed gate must require one priced driver bill per per-mile load, linked to the settlement");
  if (!/58676/.test(src.test) || !/56876/.test(src.test)) p.push("5769-shape unit tests missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("svc", "const loadedCents = creatorLoadedPayCents(load);", "const loadedCents = load.line_haul_amount_cents ?? creatorLoadedPayCents(load);")).some((x) => /invoice amount/.test(x))) bad.push("invoice amount in earnings passed");
  if (!problems(m("svc", "payItems.loaded.id]", '(await itemByName(client, co, "Driver Pay-CDL-Loaded Miles"))?.id]')).some((x) => /CDL/.test(x))) bad.push("a CDL literal passed");
  if (!problems(m("item", 'flag === false ? "cdl" : null;', 'flag === false ? "cdl" : "cdl";')).some((x) => /has_b1_visa/.test(x))) bad.push("a CDL default passed");
  if (!problems(m("gate", "driver_finance.driver_bills db WHERE db.load_id = l.id AND db.voided_at IS NULL", "driver_finance.driver_bills db WHERE db.load_id = l.id AND db.revoked_at IS NULL AND db.voided_at IS NULL")).some((x) => /revoked_at/.test(x))) bad.push("revoked_at passed");
  if (!problems(m("rule", "toFixed(6)", "toFixed(0)")).some((x) => /numeric/.test(x))) bad.push("float rounding passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 6/6 (real tree passes; invoice amount in earnings, CDL literal, CDL default, revoked_at, float rounding each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — driver pay = pay rate x short miles + empty rate x empty miles; the invoice never feeds it; pay item from has_b1_visa (NULL refuses); one priced driver bill per load, linked to the settlement.`);
