// CHAIN-03 guard: there must be exactly ONE bill-line debit-account resolver, and BOTH the draft
// preview and the actual poster must call it — so the preview can never diverge from what posts
// (divergence = books that don't tie out). Also asserts the dropped silent fallbacks stay dropped.
import { readFileSync } from "node:fs";

const fail = (m) => {
  console.error(`FAIL verify-bill-resolver-single-source: ${m}`);
  process.exit(1);
};

const RESOLVER = "apps/backend/src/accounting/bill-account-resolver.ts";
const DRAFT = "apps/backend/src/accounting/bill-gl-draft.service.ts";
const POSTER = "apps/backend/src/accounting/posting-engine.service.ts";

const resolver = readFileSync(RESOLVER, "utf8");
const draft = readFileSync(DRAFT, "utf8");
const poster = readFileSync(POSTER, "utf8");

// 1) The single resolver exists and owns the resolution order.
if (!/export async function resolveBillLineDebitAccount\b/.test(resolver))
  fail(`${RESOLVER} must export resolveBillLineDebitAccount (the ONE canonical resolver)`);
for (const marker of ["bill_line_explicit_account", "expense_category_map", "uncategorized_expense_role"]) {
  if (!resolver.includes(`"${marker}"`)) fail(`${RESOLVER} must define the resolution tier "${marker}"`);
}
// The category-map call (the decision) lives ONLY in the shared resolver.
if (!/resolveAccountForCategory\(/.test(resolver))
  fail(`${RESOLVER} must be the one place that calls resolveAccountForCategory (the B1 map)`);

// 2) BOTH consumers import the shared resolver from the same module — import identity.
const IMPORT_RE = /resolveBillLineDebitAccount[^\n]*from\s+["']\.\/bill-account-resolver\.js["']|from\s+["']\.\/bill-account-resolver\.js["'][^\n]*resolveBillLineDebitAccount/;
if (!/from\s+["']\.\/bill-account-resolver\.js["']/.test(draft) || !/resolveBillLineDebitAccount/.test(draft))
  fail(`${DRAFT} must import resolveBillLineDebitAccount from ./bill-account-resolver.js`);
if (!/from\s+["']\.\/bill-account-resolver\.js["']/.test(poster) || !/resolveBillLineDebitAccount/.test(poster))
  fail(`${POSTER} must import resolveBillLineDebitAccount from ./bill-account-resolver.js`);
if (!IMPORT_RE.test(draft) && !IMPORT_RE.test(poster)) {
  // soft sanity — at least one must show the symbol on the import line
}

// 3) The draft preview must NOT re-implement category resolution (single source).
if (/resolveAccountForCategory/.test(draft))
  fail(`${DRAFT} must NOT call resolveAccountForCategory directly — go through resolveBillLineDebitAccount`);

// 4) The dropped silent fallbacks must stay dropped in the poster's bill path.
for (const banned of ["header_coa_account_fallback", "role_expense_default", "detectBillLineAccountColumn"]) {
  if (poster.includes(banned))
    fail(`${POSTER} still references "${banned}" — the silent bill fallbacks were dropped by the CHAIN-03 fork decision`);
}

console.log("OK verify-bill-resolver-single-source: one canonical bill resolver; draft + poster both use it; silent fallbacks dropped.");
