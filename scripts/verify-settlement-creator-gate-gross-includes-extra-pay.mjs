#!/usr/bin/env node
/**
 * GUARD — fork rehearsal 2026-10-11 (5771 / 5776 / 5777 refused "gross_pay ≠ Σ driver bills"): the feed gate's
 * settlement.gross_equals_driver_bills identity is gross_pay = Σ live driver bills (mileage per load) + Σ active
 * extra_pay settlement lines (tarp / layover / bonus — item-required lines on their load). Without the extra pay term
 * every settlement that pays extra pay is refused by the gate even when its money is exact.
 * Run: node scripts/verify-settlement-creator-gate-gross-includes-extra-pay.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-gate-gross-includes-extra-pay";
const FILE = "apps/backend/src/driver-finance/feed-gate/feed-gate.checks.ts";
const TERM = "coalesce((SELECT sum(round(abs(xl.amount) * 100))::bigint FROM driver_finance.settlement_lines xl WHERE xl.settlement_id = s.id AND xl.line_type = 'extra_pay' AND xl.is_active AND xl.voided_at IS NULL), 0)";

export function problems(src) {
  const a = src.indexOf('key: "settlement.gross_equals_driver_bills"');
  if (a < 0) return ["settlement.gross_equals_driver_bills check is missing"];
  const b = src.indexOf("{ key:", a + 10);
  const check = src.slice(a, b);
  const n = check.split(TERM).length - 1;
  return n >= 3 ? [] : [`the gross identity counts extra pay in ${n} of its 3 expressions (ok / missing / message)`];
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const once = good.replace(" + " + TERM, "");
  if (once === good) bad.push("plant did not apply");
  else if (!problems(once).length) bad.push("dropping the extra pay term from one expression passed");
  if (!problems(good.replace('key: "settlement.gross_equals_driver_bills"', 'key: "x"')).length) bad.push("a missing check passed");
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (2 plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
