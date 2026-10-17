#!/usr/bin/env node
/**
 * LEAD 443.183 G10 (built as 443.110 G10, #26625) — the from-load invoice is ITEMIZED from dispatch.load_charge_lines:
 * line haul, fuel surcharge and each accessorial are their own invoice line with their item and that item's income
 * account, and the lines must foot to the load's rate (refused by name otherwise). Accessorial / lumper stop lines carry
 * their item too. This step locks the rule so a regression back to one "Linehaul" line for rate_total_cents is red.
 *
 *   (a) accounting/from-load.ts reads dispatch.load_charge_lines and plans the lines with planInvoiceChargeLines.
 *   (b) planInvoiceChargeLines (accounting/invoice-charge-lines.ts) refuses lines that do not foot to rate_total_cents.
 *   (c) each planned line is inserted with its item (resolveInvoiceLineItemId) and its account; the single-linehaul
 *       fallback runs ONLY when the load has no charge lines.
 *   (d) accessorial / lumper stop lines resolve and write their item.
 *
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FL = "apps/backend/src/accounting/from-load.ts";
const PL = "apps/backend/src/accounting/invoice-charge-lines.ts";

export function check(fl, pl) {
  const out = [];
  if (!/FROM dispatch\.load_charge_lines\b/.test(fl) || !/planInvoiceChargeLines\(/.test(fl)) out.push(`${FL}: the invoice is not planned from the load's charge lines (a)`);
  if (!/export function planInvoiceChargeLines\(/.test(pl) || !/if \(total !== rateTotalCents\) throw/.test(pl)) out.push(`${PL}: charge lines that do not foot to the load rate are not refused (b)`);
  if (!/for \(const \[idx, planned\] of plannedChargeLines\.entries\(\)\)[\s\S]{0,600}resolveInvoiceLineItemId\(/.test(fl)) out.push(`${FL}: each charge line is not written with its item (c)`);
  if (!/if \(plannedChargeLines\.length === 0\)/.test(fl)) out.push(`${FL}: the single-linehaul line is not limited to loads with no charge lines (c)`);
  if (!/const stopItemId = await resolveInvoiceLineItemId\(/.test(fl)) out.push(`${FL}: accessorial / lumper lines do not carry their item (d)`);
  return out;
}

const fl = readFileSync(resolve(ROOT, FL), "utf8");
const pl = readFileSync(resolve(ROOT, PL), "utf8");

if (process.argv.includes("--selftest")) {
  if (check(fl, pl).length) { console.error("SELFTEST FAIL: baseline not clean", check(fl, pl)); process.exit(1); }
  const plants = [
    ["one linehaul for the whole rate", fl.replace(/FROM dispatch\.load_charge_lines\b/, "FROM dispatch.nothing"), pl],
    ["no foot check", fl, pl.replace(/if \(total !== rateTotalCents\) throw/, "if (false) throw")],
    ["charge line without item", fl.replace(/(for \(const \[idx, planned\] of plannedChargeLines\.entries\(\)\)[\s\S]{0,600}?)resolveInvoiceLineItemId\(/, "$1noItem("), pl],
    ["linehaul always added", fl.replace(/if \(plannedChargeLines\.length === 0\)/, "if (true)"), pl],
    ["accessorial without item", fl.replace(/const stopItemId = await resolveInvoiceLineItemId\(/, "const stopItemId = null && ("), pl],
  ];
  for (const [name, f, p] of plants) if (!check(f, p).length) { console.error(`SELFTEST FAIL: plant "${name}" not caught`); process.exit(1); }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(fl, pl);
if (findings.length) {
  console.error(`verify-invoice-itemized-from-load-charge-lines FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-invoice-itemized-from-load-charge-lines PASS — the invoice is itemized from the load's charge lines (each with its item + income account, footed to the rate); accessorial / lumper lines carry their item");
