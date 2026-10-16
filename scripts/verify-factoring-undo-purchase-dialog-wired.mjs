#!/usr/bin/env node
/**
 * LEAD 443.171 A — the Undo purchase dialog (Factoring → Payments to You, list row + detail) is wired: it calls the one
 * void (voidFactoringPurchase → POST /api/v1/factoring/purchases/:id/void → voidPurchase), Owner-only on posted purchases,
 * reason >= 10 characters, and a bank-matched wire refuses with "Unmatch the Faro wire in Banking first".
 * Run by verify-step 18475 (verify:pre-commit), which carries the rest of 443.171.
 *
 * @matrix-built {"modules":["factoring"],"cols":["connectivity"],"leaves":["factoring.dialog.undo_purchase"],"task":"LEAD-443.171-A-UNDO-PURCHASE-CONNECTIVITY","vertical":"class-sweep"}
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "apps/frontend/src/pages/factoring/PaymentsToYouPanel.tsx";
const ROUTES = "apps/backend/src/factoring/purchase.routes.ts";

export function check(panel, routes) {
  const out = [];
  if (!/import\s*\{[^}]*\bvoidFactoringPurchase\b[^}]*\}\s*from\s*"..\/..\/api\/factoring-purchases"/.test(panel)) out.push(`${PANEL}: does not import voidFactoringPurchase`);
  if (!/await voidFactoringPurchase\(companyId,/.test(panel)) out.push(`${PANEL}: the Undo dialog does not call voidFactoringPurchase`);
  if (!/isOwner\s*&&\s*row\.status\s*===\s*"posted"/.test(panel)) out.push(`${PANEL}: Undo is not limited to the Owner on posted purchases`);
  if (!/\.trim\(\)\.length\s*>=\s*10/.test(panel)) out.push(`${PANEL}: the Undo reason is not required to be >= 10 characters`);
  if (!/Unmatch the Faro wire in Banking first/.test(panel)) out.push(`${PANEL}: the matched-wire refusal message is missing`);
  if (!/app\.post\("\/api\/v1\/factoring\/purchases\/:id\/void"[\s\S]{0,900}voidPurchase\(/.test(routes)) out.push(`${ROUTES}: POST /purchases/:id/void does not reach voidPurchase`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const panel = readFileSync(resolve(ROOT, PANEL), "utf8");
  const routes = readFileSync(resolve(ROOT, ROUTES), "utf8");
  if (check(panel, routes).length) { console.error("SELFTEST FAIL: baseline not clean", check(panel, routes)); process.exit(1); }
  const plants = [
    [panel.replace(/await voidFactoringPurchase\(companyId,/g, "await noop(companyId,"), routes],
    [panel.replace(/\.trim\(\)\.length\s*>=\s*10/, ".trim().length >= 1"), routes],
    [panel, routes.replace(/voidPurchase\(client/g, "noop(client")],
  ];
  for (const [p, r] of plants) if (!check(p, r).length) { console.error("SELFTEST FAIL: plant not caught"); process.exit(1); }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(readFileSync(resolve(ROOT, PANEL), "utf8"), readFileSync(resolve(ROOT, ROUTES), "utf8"));
if (findings.length) {
  console.error(`verify-factoring-undo-purchase-dialog-wired FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-factoring-undo-purchase-dialog-wired PASS — Undo purchase calls the one void, Owner + posted only, reason >= 10, matched wire refused");
