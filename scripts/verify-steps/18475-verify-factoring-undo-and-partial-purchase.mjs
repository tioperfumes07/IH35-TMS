#!/usr/bin/env node
/**
 * LEAD 443.171 — factoring Undo purchase + partial purchase (owner: "we sent Faro 4,000, they purchased 3,000").
 *
 *   A. Undo: the purchases list + detail offer Undo on POSTED purchases, Owner only, reason >= 10 chars, through the ONE
 *      existing void (voidFactoringPurchase -> voidPurchase); a matched Faro wire says "Unmatch the Faro wire in Banking first".
 *   B. Partial: each selected invoice carries a Purchased amount capped at its open balance (down only) and the purchase
 *      line posts gross_cents = purchased; the backend refuses gross > open by name (purchase_line_gross_exceeds_open).
 *   C. Collection: a customer payment to Faro relieves 2150 only up to the line's UNRELIEVED purchased gross; the excess
 *      goes to cash_clearing. Receive Payment on an advanced invoice is capped at open - unrelieved purchased gross.
 *   E. Edit a POSTED purchase (QuickBooks click-to-edit): editPurchase() reverses the live funding through the canonical
 *      reversal and re-posts the SAME advance through the funding poster, in one function (the caller's one transaction);
 *      PATCH /api/v1/factoring/purchases/:id is its only route; a posted purchase row opens the SAME Submit-to-Factor form
 *      in edit mode, and no second purchase-form component exists (only SubmitToFactorTab creates or edits a purchase).
 *   D. Selection totals are editable; a total is split pro rata to the cent (distributeTotalProRata) into the lines; Post
 *      is disabled while net < 0.
 *
 * --selftest: plants each regression (one per clause) and asserts the guard fails; the baseline must pass.
 * --against-main: runs the checks on origin/main's copies (red before this PR).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  panel: "apps/frontend/src/pages/factoring/PaymentsToYouPanel.tsx",
  submit: "apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx",
  purchase: "apps/backend/src/factoring/purchase.service.ts",
  reserve: "apps/backend/src/factoring/faro-reserve-entries.service.ts",
  gross: "apps/backend/src/factoring/purchased-gross.service.ts",
  apply: "apps/backend/src/accounting/payments/apply.service.ts",
  route: "apps/backend/src/accounting/customer-payments.routes.ts",
  routes: "apps/backend/src/factoring/purchase.routes.ts",
  testEdit: "apps/backend/src/factoring/__tests__/purchase-edit.test.ts",
  testPartial: "apps/backend/src/factoring/__tests__/purchase-partial.test.ts",
  testUndo: "apps/backend/src/factoring/__tests__/purchase-undo.test.ts",
  testTotals: "apps/frontend/src/pages/factoring/__tests__/submit-to-factor-totals.test.ts",
};

export function check(src) {
  const s = (k) => src[k] ?? "";
  const out = [];
  // A
  if (!/voidFactoringPurchase\(/.test(s("panel"))) out.push(`${F.panel}: Undo does not call voidFactoringPurchase (A)`);
  if (!/isOwner\s*&&\s*row\.status\s*===\s*"posted"/.test(s("panel"))) out.push(`${F.panel}: list-row Undo is not limited to Owner + posted (A)`);
  if (!/\.trim\(\)\.length\s*>=\s*10/.test(s("panel"))) out.push(`${F.panel}: Undo reason is not required to be >= 10 chars (A)`);
  if (!/Unmatch the Faro wire in Banking first/.test(s("panel"))) out.push(`${F.panel}: matched-wire refusal message missing (A)`);
  // B
  if (!/export function clampPurchased[\s\S]{0,300}Math\.min\(openCents/.test(s("submit"))) out.push(`${F.submit}: Purchased is not capped at the open balance (B)`);
  if (!/gross_cents:\s*linePurchased\(/.test(s("submit"))) out.push(`${F.submit}: the purchase line does not post the purchased amount (B)`);
  if (!/if \(gross > openCents\)\s*\{?\s*throw new FactoringPurchaseError\("purchase_line_gross_exceeds_open"/.test(s("purchase"))) out.push(`${F.purchase}: gross above the open balance is not refused (B)`);
  // C
  if (!/export async function unrelievedPurchasedGrossCents\(/.test(s("gross"))) out.push(`${F.gross}: unrelievedPurchasedGrossCents missing (C)`);
  if (!/unrelievedPurchasedGrossCents\(/.test(s("reserve")) || !/Math\.min\(payment\.cents,\s*room\)/.test(s("reserve"))) out.push(`${F.reserve}: the customer-paid-Faro leg does not cap 2150 at the unrelieved purchased gross (C)`);
  if (!/role\("cash_clearing"\)/.test(s("reserve"))) out.push(`${F.reserve}: the excess over purchased gross has no cash_clearing leg (C)`);
  if (!/directPaymentRoomCents\(/.test(s("apply"))) out.push(`${F.apply}: Receive Payment is not capped at the non-purchased portion (C)`);
  if (!/directPaymentRoomCents\(/.test(s("route"))) out.push(`${F.route}: the apply route is not capped at the non-purchased portion (C)`);
  // D
  if (!/export function distributeTotalProRata\(/.test(s("submit")) || !/export function applyTotalEdit\(/.test(s("submit"))) out.push(`${F.submit}: total edits are not distributed pro rata into the lines (D)`);
  if (!/data-testid="submit-factor-total-fee">\s*<MoneyInput/.test(s("submit"))) out.push(`${F.submit}: the fee total is not editable (D)`);
  if (!/disabled=\{[^}]*totals\.net < 0\}/.test(s("submit"))) out.push(`${F.submit}: Post is not disabled while net < 0 (D)`);
  // E
  const edit = (s("purchase").match(/export async function editPurchase\([\s\S]*?\n}\n/) ?? [""])[0];
  const iRev = edit.indexOf("reverseFactoringAdvanceEventInClientTx(");
  const iPost = edit.indexOf("postFactoringAdvanceEventInClientTx(");
  if (!edit) out.push(`${F.purchase}: editPurchase (the one edit writer) is missing (E)`);
  else if (iRev < 0 || iPost < 0 || iPost < iRev) out.push(`${F.purchase}: editPurchase does not reverse then re-post the funding in one function (E)`);
  if (edit && /INSERT INTO accounting\.factoring_purchases\b/.test(edit)) out.push(`${F.purchase}: editPurchase inserts a second purchase row (E)`);
  if (!/app\.patch\("\/api\/v1\/factoring\/purchases\/:id"[\s\S]{0,1200}editPurchase\(/.test(s("routes"))) out.push(`${F.routes}: PATCH /api/v1/factoring/purchases/:id does not call editPurchase (E)`);
  if (!/onRowClick=\{[^}]*onEditPurchase/.test(s("panel"))) out.push(`${F.panel}: a posted purchase row does not open the edit form (E)`);
  if (!/editFactoringPurchase\(/.test(s("submit")) || !/editPurchaseId/.test(s("submit"))) out.push(`${F.submit}: Submit-to-Factor has no edit mode (E)`);
  for (const rel of src.__purchaseWriters ?? []) {
    if (rel !== F.submit) out.push(`${rel}: a second purchase form — only ${F.submit} creates or edits a purchase (E)`);
  }
  // tests
  for (const k of ["testPartial", "testUndo", "testEdit"]) if (!s(k)) out.push(`${F[k]}: test missing`);
  if (!/15001/.test(s("testTotals"))) out.push(`${F.testTotals}: the 150.01 fee-total test is missing (D)`);
  return out;
}

function load(fromMain) {
  const src = {};
  for (const [k, rel] of Object.entries(F)) {
    if (fromMain) {
      const r = spawnSync("git", ["show", `origin/main:${rel}`], { cwd: ROOT, encoding: "utf8" });
      src[k] = r.status === 0 ? r.stdout : "";
    } else {
      src[k] = existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), "utf8") : "";
    }
  }
  // Every frontend file (tests and the API client aside) that creates or edits a purchase.
  const walk = (dir, out = []) => {
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir)) {
      const a = join(dir, n);
      if (statSync(a).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") walk(a, out); }
      else if (/\.(tsx?|jsx?)$/.test(n)) out.push(a);
    }
    return out;
  };
  src.__purchaseWriters = fromMain ? [] : walk(resolve(ROOT, "apps/frontend/src"))
    .map((a) => relative(ROOT, a))
    .filter((rel) => rel !== "apps/frontend/src/api/factoring-purchases.ts" && /\b(createFactoringPurchase|editFactoringPurchase)\(/.test(readFileSync(resolve(ROOT, rel), "utf8")));
  return src;
}

if (process.argv.includes("--selftest")) {
  const src = load(false);
  const base = check(src);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base);
    process.exit(1);
  }
  const edit = (k, from, to) => ({ ...src, [k]: src[k].replace(from, to) });
  const plants = [
    ["A undo not wired", edit("panel", /voidFactoringPurchase\(/g, "noop(")],
    ["A reason min dropped", edit("panel", /\.trim\(\)\.length\s*>=\s*10/, ".trim().length >= 1x")],
    ["B cap removed", edit("submit", /Math\.min\(openCents/, "Math.max(openCents")],
    ["B line posts open", edit("submit", /gross_cents:\s*linePurchased\(/, "gross_cents: (")],
    ["B backend uncapped", edit("purchase", /if \(gross > openCents\)/, "if (false)")],
    ["C 2150 takes the whole payment", edit("reserve", /Math\.min\(payment\.cents,\s*room\)/, "payment.cents")],
    ["C apply uncapped", edit("apply", /directPaymentRoomCents\(/g, "noop(")],
    ["D pro rata gone", edit("submit", /export function distributeTotalProRata\(/, "function distributeTotalProRataX(")],
    ["D post on negative net", edit("submit", /totals\.net < 0\}/, "false}")],
    ["tests gone", { ...src, testUndo: "" }],
    ["E edit does not re-post", edit("purchase", /const posted = await postFactoringAdvanceEventInClientTx\(client as never, \{\n    operating_company_id: oci,\n    factoring_advance_id: advId,/, "const posted = await noop(client as never, {\n    operating_company_id: oci,\n    factoring_advance_id: advId,")],
    ["E no PATCH route", edit("routes", /app\.patch\(/, "app.get(")],
    ["E row does not open edit", edit("panel", /onRowClick=\{[^}]*onEditPurchase/, "onRowClick={x")],
    ["E second purchase form", { ...src, __purchaseWriters: [...src.__purchaseWriters, "apps/frontend/src/pages/factoring/OtherPurchaseForm.tsx"] }],
  ];
  for (const [name, planted] of plants) {
    if (check(planted).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(load(process.argv.includes("--against-main")));
if (findings.length) {
  console.error(`verify-factoring-undo-and-partial-purchase FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-factoring-undo-and-partial-purchase PASS: undo via voidPurchase (Owner, posted, reason >= 10); purchased capped at open; 2150 relieved only to the unrelieved purchased gross; totals split pro rata; post blocked on net < 0; edit = reverse + re-post the same purchase from the one form");
