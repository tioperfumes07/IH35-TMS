#!/usr/bin/env node
/**
 * GUARD: the driver escrow FORFEIT path stays correct and fail-closed (SAF-F01 / SAF-ORPH).
 *
 * Forfeit is the OPPOSITE of release (release pays cash out; forfeit recognizes a recovery against
 * a recorded loss, no cash). After SAF-ORPH-01/02 the subledger row MUST use posting_type='forfeiture'
 * so accounting.apply_escrow_posting_delta (202608070000) DECREMENTS the liability — the old
 * posting_type='adjustment' hit the 0234 ELSE→+ bug and inflated the balance.
 *
 *   - posts via createJournalEntry (no inline GL math),
 *   - resolves the DR account via the escrow resolver (Liability-or-fail),
 *   - resolves the CR account = damage_recovery via the PRIMARY CoA resolver (fail loud when undesignated),
 *   - records via recordEscrowPostingOnly with posting_type='forfeiture' + source_type='forfeit',
 *   - converts DOLLARS→CENTS exactly once (×100),
 *   - rejects an over-draw (forfeit ≤ balance, never negative),
 *   - fails loud when the escrow GL posting flag is OFF (no ledger write without the JE).
 *
 *   node scripts/verify-escrow-forfeit-posting.mjs
 *   node scripts/verify-escrow-forfeit-posting.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/driver-finance/escrow-forfeit.service.ts";
const ROUTE = "apps/backend/src/driver-finance/escrow-forfeit.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const LABEL = "verify-escrow-forfeit-posting";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const stripLineComments = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");

export function assertForfeitPosting(sources) {
  const problems = [];
  const svc = stripComments(sources?.[SERVICE] ?? read(SERVICE));
  const route = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const index = stripLineComments(sources?.[INDEX] ?? read(INDEX));

  if (!/createJournalEntry(OnClient)?\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: does not post via createJournalEntry — no inline GL math is allowed.`);
  }
  if (!/resolveDriverEscrowLiabilityAccount\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: does not resolve the DR account via resolveDriverEscrowLiabilityAccount (Liability-or-fail).`);
  }
  if (!/resolveRoleAccount\s*\([^)]*["']damage_recovery["']/.test(svc)) {
    problems.push(`${SERVICE}: does not resolve damage_recovery via resolveRoleAccount (PRIMARY CoA resolver, fail-loud).`);
  }
  if (/["'](revenue_default|rental_income|interest_income|sales)["']/.test(svc)) {
    problems.push(`${SERVICE}: references an INCOME role — forfeited escrow is a recovery, never income.`);
  }
  // SAF-ORPH: must use recordEscrowPostingOnly + forfeiture (not adjustment / raw INSERT).
  if (!/recordEscrowPostingOnly\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: must record via recordEscrowPostingOnly so the #3533 trigger path applies the signed delta.`);
  }
  if (!/posting_type:\s*["']forfeiture["']/.test(svc)) {
    problems.push(`${SERVICE}: escrow_postings row must use posting_type='forfeiture' (trigger decrements balance).`);
  }
  if (!/UPDATE\s+driver_finance\.escrow_balances/.test(svc)) {
    problems.push(`${SERVICE}: must UPDATE driver_finance.escrow_balances (driver-visible) — accounting-only forfeit is a split-brain half-close.`);
  }
  if (!/INSERT\s+INTO\s+driver_finance\.escrow_ledger/.test(svc)) {
    problems.push(`${SERVICE}: must append driver_finance.escrow_ledger transaction_type='forfeit'.`);
  }
  if (/posting_type:\s*["']adjustment["']|'adjustment'/.test(svc)) {
    problems.push(`${SERVICE}: posting_type='adjustment' is forbidden — 0234 ELSE→+ inflated the liability on forfeit.`);
  }
  if (!/source_type:\s*["']forfeit["']|'forfeit'/.test(svc)) {
    problems.push(`${SERVICE}: escrow_postings row must carry source_type='forfeit'.`);
  }
  if (!/\*\s*100|dollarsToCents/.test(svc)) {
    problems.push(`${SERVICE}: no DOLLARS→CENTS (×100) conversion — a 100× error would post the wrong amount.`);
  }
  if (!/over_draw|amountCents\s*>\s*balanceCents|>\s*balance/.test(svc)) {
    problems.push(`${SERVICE}: no over-draw guard (forfeit must be ≤ the current escrow balance).`);
  }
  if (!/isEnabled\s*\([^)]*FORFEIT_GL_POSTING/.test(svc) && !/DRIVER_ESCROW_FORFEIT_GL_POSTING/.test(svc)) {
    problems.push(`${SERVICE}: no escrow-forfeit GL posting flag gate — must fail loud (no post) when OFF.`);
  }
  if (!/if\s*\(\s*!\s*flagOn\s*\)\s*return\s*\{\s*result:\s*["']flag_off["']/.test(svc)) {
    problems.push(`${SERVICE}: the OFF path must be an explicit fail-loud gate (\`if (!flagOn) return { result: "flag_off" }\`), not a silent post.`);
  }
  if (!/Owner["']?\s*\|\|\s*.*Administrator|role === ["']Owner["']/.test(route)) {
    problems.push(`${ROUTE}: forfeit is money-moving and must be Owner/Administrator only.`);
  }
  if (!/registerDriverEscrowForfeitRoutes\s*\(\s*app\s*\)/.test(index)) {
    problems.push(`${INDEX}: registerDriverEscrowForfeitRoutes(app) is not mounted — the route would 404.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = {
    [SERVICE]: stripComments(read(SERVICE)),
    [ROUTE]: stripComments(read(ROUTE)),
    [INDEX]: stripLineComments(read(INDEX)),
  };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: mutation did not change source — inert`);
      return;
    }
    const problems = assertForfeitPosting(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("income-credit", { ...live, [SERVICE]: live[SERVICE].replace('"damage_recovery"', '"revenue_default"') }, "resolve damage_recovery");
  expectCaught("adjustment-regress", { ...live, [SERVICE]: live[SERVICE].replace('posting_type: "forfeiture"', 'posting_type: "adjustment"') }, "adjustment");
  expectCaught(
    "flag-removed",
    { ...live, [SERVICE]: live[SERVICE].replace(/if \(!flagOn\) return \{ result: "flag_off" as const \};/, "const _x = flagOn;") },
    "explicit fail-loud gate"
  );
  expectCaught(
    "unmounted",
    { ...live, [INDEX]: live[INDEX].replace(/await registerDriverEscrowForfeitRoutes\(app\);/, "void 0;") },
    "not mounted"
  );

  const liveProblems = assertForfeitPosting(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertForfeitPosting();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — escrow forfeit posts recovery JE + forfeiture-signed subledger, fail-closed`);
