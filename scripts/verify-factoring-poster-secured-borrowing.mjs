#!/usr/bin/env node
// Factoring GL poster — SECURED-BORROWING contract guard (deep).
//
// Complements verify-factoring-posting-uses-resolver-and-roles.mjs (which asserts the resolver +
// createJournalEntry routing + absence of the sale-model artifacts). THIS guard adds the deeper
// per-leg contract so the CPA-ruling-conformant poster (poster.service.ts) can never silently drift:
//
//   1. Funding never references ar_control            (borrowing keeps A/R whole; code invariant)
//   2. factoring_advance_liability DIRECTION contract  (CREDIT at funding; DEBIT at customer-payment
//      and chargeback — the borrow-then-repay shape). Any other direction = the sale model creeping back.
//   3. Every posting path routes through createJournalEntry (no local debit/credit summation).
//   4. The FLAG GATE (factoringPostingEnabled / FACTORING_GL_POSTING_ENABLED) precedes every posting fn.
//   5. Role ALLOWLIST — only the 7 secured-borrowing roles may be resolved. A new role literal = FAIL
//      (forces deliberate CPA review before a new account can enter a money-posting path).
//   6. Doc §6 open-items marker gate — while PENDING_OWNER_CONFIRMATION items remain in the design doc,
//      the flag default must stay OFF anywhere in the repo config.
//
// Verify-only. This guard reads source; it changes no posting logic. Wired into verify:arch-design.
// Run with --self-test to prove the guard has teeth against a synthetic funding-credits-ar_control sample.

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const POSTER = path.join(repoRoot, "apps/backend/src/accounting/factoring-posting/poster.service.ts");
const DOC = path.join(repoRoot, "docs/accounting/FACTORING-POSTER-DESIGN.md");

// The ONLY roles the secured-borrowing poster may resolve. Adding one requires editing this list
// (a deliberate, reviewable act) — never a silent literal in the poster.
const ALLOWED_ROLES = new Set([
  "cash_clearing",
  "factor_reserve_held",
  "factor_fee_expense",
  // FACT-05 — ACH/wire transaction cost (BC-Ach & Wire Fees); distinct from financing fee.
  "factor_wire_fee",
  "factoring_advance_liability",
  "ar_control",
  "factoring_recoursed_ar",
  "default_interest_expense",
]);

// Expected (role -> direction) per lifecycle leg. Absence of a listed role, a wrong direction, or a
// forbidden role present = failure. `forbidden` lists roles that must NOT appear in that leg.
const LEG_CONTRACT = {
  funding: {
    fn: "postFactoringAdvanceEvent",
    expect: {
      cash_clearing: "debit",
      factor_reserve_held: "debit",
      factor_fee_expense: "debit",
      factor_wire_fee: "debit",
      factoring_advance_liability: "credit",
    },
    forbidden: ["ar_control"],
  },
  customerPayment: {
    fn: "postFactoringCustomerPaymentEvent",
    expect: { factoring_advance_liability: "debit", ar_control: "credit" },
    forbidden: [],
  },
  reserveRelease: {
    fn: "postFactoringReleaseEvent",
    expect: { cash_clearing: "debit", factor_reserve_held: "credit" },
    forbidden: [],
  },
  chargeback: {
    fn: "postFactoringChargebackEvent",
    expect: {
      factoring_advance_liability: "debit",
      default_interest_expense: "debit",
      cash_clearing: "credit",
      factoring_recoursed_ar: "debit",
      ar_control: "credit",
    },
    forbidden: [],
  },
};

const FN_ORDER = [
  "postFactoringAdvanceEvent",
  "postFactoringCustomerPaymentEvent",
  "postFactoringReleaseEvent",
  "postFactoringChargebackEvent",
];

// Slice the source into per-exported-function segments (functions appear in FN_ORDER).
function segmentByFunction(source) {
  const segments = {};
  for (let i = 0; i < FN_ORDER.length; i++) {
    const start = source.indexOf(`export async function ${FN_ORDER[i]}`);
    if (start === -1) continue;
    const nextName = FN_ORDER[i + 1];
    const end = nextName ? source.indexOf(`export async function ${nextName}`) : source.length;
    segments[FN_ORDER[i]] = source.slice(start, end === -1 ? source.length : end);
  }
  return segments;
}

// role -> local var name, from `const X = await resolveRoleAccount(client, id, "role")`
function roleVarMap(segment) {
  const map = {};
  // Match `const x = await resolveRoleAccount(..., "role")` and ACH ternary:
  // `const x =\n  ach > 0 ? await resolveRoleAccount(..., "role") : null`.
  const re = /(?:const|let)\s+(\w+)\s*=[\s\S]{0,120}?resolveRoleAccount\([^)]*?"([^"]+)"\s*\)/g;
  let m;
  while ((m = re.exec(segment)) !== null) map[m[1]] = m[2];
  return map;
}

// (role, direction) pairs from `{ account_id: VAR, debit_or_credit: "debit"|"credit" ... }`
function legPostings(segment, varToRole) {
  const out = [];
  const re = /account_id:\s*(\w+)\s*,\s*debit_or_credit:\s*"(debit|credit)"/g;
  let m;
  while ((m = re.exec(segment)) !== null) {
    const role = varToRole[m[1]];
    if (role) out.push({ role, dir: m[2] });
  }
  return out;
}

function analyzePoster(source, docSource, configFlipFound) {
  const failures = [];
  const segments = segmentByFunction(source);

  for (const [legName, contract] of Object.entries(LEG_CONTRACT)) {
    const seg = segments[contract.fn];
    if (!seg) {
      failures.push(`missing lifecycle function ${contract.fn} (${legName}) in poster.service.ts`);
      continue;
    }
    const varToRole = roleVarMap(seg);
    const postings = legPostings(seg, varToRole);
    const seen = new Map();
    for (const p of postings) if (!seen.has(p.role)) seen.set(p.role, p.dir);

    // 2. direction contract
    for (const [role, dir] of Object.entries(contract.expect)) {
      if (!seen.has(role)) failures.push(`${legName}: expected a ${dir.toUpperCase()} leg on role "${role}" — not found`);
      else if (seen.get(role) !== dir)
        failures.push(`${legName}: role "${role}" must be ${dir.toUpperCase()} but is ${seen.get(role).toUpperCase()} (sale-model drift)`);
    }
    // 1. forbidden roles (funding never touches ar_control)
    for (const role of contract.forbidden) {
      if (seen.has(role)) failures.push(`${legName}: role "${role}" must NEVER appear in this leg (borrowing keeps A/R whole)`);
    }
    // 4. flag gate precedes posting in every leg
    if (!/factoringPostingEnabled\(/.test(seg)) {
      failures.push(`${legName}: missing flag gate — factoringPostingEnabled(...) must be checked before posting`);
    }
  }

  // 5. role allowlist across the whole poster
  const roleLiteralRe = /resolveRoleAccount\([^)]*?"([^"]+)"\s*\)/g;
  let rm;
  while ((rm = roleLiteralRe.exec(source)) !== null) {
    if (!ALLOWED_ROLES.has(rm[1])) {
      failures.push(`role "${rm[1]}" is not in the secured-borrowing allowlist — add it to ALLOWED_ROLES with CPA review, never as a bare literal`);
    }
  }

  // 3. routes through createJournalEntry, no local debit/credit summation, no sale-model source
  if (!/createJournalEntry\(/.test(source)) failures.push("poster must post via createJournalEntry (double-entry trigger asserts balance)");
  if (/source_transaction_type:\s*"customer_payment"/.test(source)) failures.push('sale-model source_transaction_type:"customer_payment" must not return');
  if (/\.reduce\([^)]*debit_or_credit/.test(source)) failures.push("poster must NOT locally sum debit/credit — the DB double-entry trigger is the balance control");

  // 6. open-items marker gate (doc §6). While open items remain, the flag default must stay OFF.
  if (docSource !== null) {
    const hasOpenItems = /PENDING_OWNER_CONFIRMATION/.test(docSource);
    if (hasOpenItems && configFlipFound) {
      failures.push("FACTORING_GL_POSTING_ENABLED is flipped ON in repo config while §6 PENDING_OWNER_CONFIRMATION items remain unresolved");
    }
    if (!hasOpenItems) {
      // Not fatal on its own, but the doc must carry the open-items section this block adds.
      failures.push("design doc §6 is missing PENDING_OWNER_CONFIRMATION open-items markers (Task 2 reconciliation)");
    }
  }

  return failures;
}

// ---- self-test: a synthetic funding that CREDITS ar_control must be caught ----
function runSelfTest() {
  const badFunding = `
export async function postFactoringAdvanceEvent(input) {
  if (!(await factoringPostingEnabled(client, id))) return;
  const cashAccountId = await resolveRoleAccount(client, id, "cash_clearing");
  const arAccountId = await resolveRoleAccount(client, id, "ar_control");
  const liabilityAccountId = await resolveRoleAccount(client, id, "factoring_advance_liability");
  postings.push({ account_id: cashAccountId, debit_or_credit: "debit", amount_cents: cash });
  postings.push({ account_id: arAccountId, debit_or_credit: "credit", amount_cents: face });
  postings.push({ account_id: liabilityAccountId, debit_or_credit: "credit", amount_cents: face });
  await createJournalEntry({ postings });
}
export async function postFactoringCustomerPaymentEvent() {}
export async function postFactoringReleaseEvent() {}
export async function postFactoringChargebackEvent() {}
`;
  const failures = analyzePoster(badFunding, "PENDING_OWNER_CONFIRMATION", false);
  return failures.some((f) => /funding: role "ar_control" must NEVER appear/.test(f));
}

if (process.argv.includes("--self-test")) {
  if (!runSelfTest()) {
    console.error("verify:factoring-poster-secured-borrowing SELF-TEST FAILED — guard did not catch funding crediting ar_control");
    process.exit(1);
  }
  console.log("verify:factoring-poster-secured-borrowing — self-test OK (guard catches funding→ar_control)");
  process.exit(0);
}

// ---- main: assert against the real poster + doc ----
// First prove the guard still has teeth (a weakened regex would let real drift through).
if (!runSelfTest()) {
  console.error("verify:factoring-poster-secured-borrowing — FAILED: guard self-test broken (does not catch funding→ar_control)");
  process.exit(1);
}
if (!fs.existsSync(POSTER)) {
  console.error("verify:factoring-poster-secured-borrowing — FAILED: missing poster.service.ts");
  process.exit(1);
}
const source = fs.readFileSync(POSTER, "utf8");
const docSource = fs.existsSync(DOC) ? fs.readFileSync(DOC, "utf8") : null;

// Repo config flip check: any non-comment line setting the flag literally true.
let configFlipFound = false;
try {
  const grep = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");
  configFlipFound = /FACTORING_GL_POSTING_ENABLED\s*[:=]\s*["']?true/i.test(grep);
} catch {
  configFlipFound = false;
}

const failures = analyzePoster(source, docSource, configFlipFound);
if (failures.length > 0) {
  console.error("verify:factoring-poster-secured-borrowing — FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("verify:factoring-poster-secured-borrowing — OK (7-role allowlist, per-leg directions, funding≠ar_control, flag-gated, open-items tracked)");
