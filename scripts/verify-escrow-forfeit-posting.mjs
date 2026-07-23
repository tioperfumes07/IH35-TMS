#!/usr/bin/env node
/**
 * GUARD: the driver escrow FORFEIT path stays correct and fail-closed (SAF-F01).
 *
 * WHY THIS EXISTS (2026-07-23 build)
 * The forfeit route was called by EscrowForfeitModal but had NO backend handler — it 404'd. It is now
 * built as a financial-cluster HOLD. Forfeit is the OPPOSITE of release (release pays cash out; forfeit
 * recognizes a recovery against a recorded loss, no cash), so the ONE thing that must never regress is
 * the credit leg and its guards:
 *
 *   - posts via createJournalEntry (no inline GL math),
 *   - resolves the DR account via the escrow resolver (Liability-or-fail),
 *   - resolves the CR account = damage_recovery via the PRIMARY CoA resolver (fail loud when undesignated),
 *   - reuses posting_type='adjustment' and source_type='forfeit' — NEVER a new 'forfeiture' posting_type,
 *   - converts DOLLARS→CENTS exactly once (×100),
 *   - rejects an over-draw (forfeit ≤ balance, never negative),
 *   - fails loud when the escrow GL posting flag is OFF (no ledger write without the JE).
 *
 * A regression on any of these silently mis-books a real person's withheld pay.
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
// index.ts is large; a non-greedy block-comment strip can span a distant /** … */ and eat a real mount
// line. The mount check only needs to ignore a commented-OUT registration, so strip LINE comments only.
const stripLineComments = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");

export function assertForfeitPosting(sources) {
  const problems = [];
  const svc = stripComments(sources?.[SERVICE] ?? read(SERVICE));
  const route = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const index = stripLineComments(sources?.[INDEX] ?? read(INDEX));

  // Posts via the JE service, not inline SQL GL math.
  if (!/createJournalEntry(OnClient)?\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: does not post via createJournalEntry — no inline GL math is allowed.`);
  }
  // DR account via the escrow resolver.
  if (!/resolveDriverEscrowLiabilityAccount\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: does not resolve the DR account via resolveDriverEscrowLiabilityAccount (Liability-or-fail).`);
  }
  // CR account = damage_recovery via the PRIMARY CoA resolver.
  if (!/resolveRoleAccount\s*\([^)]*["']damage_recovery["']/.test(svc)) {
    problems.push(`${SERVICE}: does not resolve damage_recovery via resolveRoleAccount (PRIMARY CoA resolver, fail-loud).`);
  }
  // Never credit income (the ruling's hard NO).
  if (/["'](revenue_default|rental_income|interest_income|sales)["']/.test(svc)) {
    problems.push(`${SERVICE}: references an INCOME role — forfeited escrow is a recovery, never income.`);
  }
  // posting_type = adjustment, source_type = forfeit; NO new 'forfeiture' posting_type.
  if (!/posting_type[^,\n]*adjustment|'adjustment'/.test(svc)) {
    problems.push(`${SERVICE}: escrow_postings row must use posting_type='adjustment' (no new posting_type).`);
  }
  if (/['"]forfeiture['"]/.test(svc)) {
    problems.push(`${SERVICE}: introduces a 'forfeiture' posting_type — forbidden; use source_type='forfeit' on posting_type='adjustment'.`);
  }
  if (!/source_type[^,\n]*forfeit|'forfeit'/.test(svc)) {
    problems.push(`${SERVICE}: escrow_postings row must carry source_type='forfeit'.`);
  }
  // Dollars → cents exactly once.
  if (!/\*\s*100|dollarsToCents/.test(svc)) {
    problems.push(`${SERVICE}: no DOLLARS→CENTS (×100) conversion — a 100× error would post the wrong amount.`);
  }
  // Over-draw guard.
  if (!/over_draw|amountCents\s*>\s*balanceCents|>\s*balance/.test(svc)) {
    problems.push(`${SERVICE}: no over-draw guard (forfeit must be ≤ the current escrow balance).`);
  }
  // Fail loud when the flag is OFF.
  if (!/isEnabled\s*\([^)]*FORFEIT_GL_POSTING/.test(svc) && !/DRIVER_ESCROW_FORFEIT_GL_POSTING/.test(svc)) {
    problems.push(`${SERVICE}: no escrow-forfeit GL posting flag gate — must fail loud (no post) when OFF.`);
  }
  // The actual fail-loud GATE, not just the token (flag_off also appears in the result type union).
  if (!/if\s*\(\s*!\s*flagOn\s*\)\s*return\s*\{\s*result:\s*["']flag_off["']/.test(svc)) {
    problems.push(`${SERVICE}: the OFF path must be an explicit fail-loud gate (\`if (!flagOn) return { result: "flag_off" }\`), not a silent post.`);
  }

  // Route: Owner/Administrator only, and mounted.
  if (!/Owner["']?\s*\|\|\s*.*Administrator|role === ["']Owner["']/.test(route)) {
    problems.push(`${ROUTE}: forfeit is money-moving and must be Owner/Administrator only.`);
  }
  // The CALL, not merely the imported symbol — an imported-but-uncalled register is still a 404.
  if (!/registerDriverEscrowForfeitRoutes\s*\(\s*app\s*\)/.test(index)) {
    problems.push(`${INDEX}: registerDriverEscrowForfeitRoutes(app) is not mounted — the route would 404.`);
  }

  return problems;
}

if (SELFTEST) {
  // Mutate comment-stripped source so a planted defect lands on real CODE, not on the first mention of
  // the same token inside an explanatory comment (which stripComments would then erase, neutralizing the
  // mutation and producing a false "not caught"). assertForfeitPosting strips comments too, so passing
  // already-stripped source is equivalent.
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

  // 1. credit leg swapped to income.
  expectCaught("income-credit", { ...live, [SERVICE]: live[SERVICE].replace('"damage_recovery"', '"revenue_default"') }, "resolve damage_recovery");
  // 2. a 'forfeiture' posting_type introduced.
  expectCaught("new-posting-type", { ...live, [SERVICE]: live[SERVICE].replace("'adjustment'", "'forfeiture'") }, "forfeiture");
  // 3. flag gate removed (the actual fail-loud line).
  expectCaught(
    "flag-removed",
    { ...live, [SERVICE]: live[SERVICE].replace(/if \(!flagOn\) return \{ result: "flag_off" as const \};/, "const _x = flagOn;") },
    "explicit fail-loud gate"
  );
  // 4. route de-mounted (remove the CALL; the import stays, proving the guard checks the call).
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
console.log(`${LABEL} OK — escrow forfeit posts a balanced recovery JE, fail-closed, no new posting_type`);
