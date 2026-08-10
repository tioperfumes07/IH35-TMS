#!/usr/bin/env node
/**
 * GUARD: an internal fine can be disputed and voided, and a converted fine refuses the void.
 *
 * WHY THIS EXISTS (2026-07-23 audit — SAF-F12)
 * `safety.internal_fines.status` has accepted 'disputed' and 'voided' since migration 0050, and the
 * table carries `voided_at` + `voided_reason`. The backend exposed ONLY GET and POST, and the page
 * rendered NO row action of any kind. So a punitive money record could be imposed on a driver and
 * then never corrected: the status labels for "Disputed" and "Voided" existed in the UI with no code
 * path that could ever set them. A driver's only recourse existed in the schema and nowhere else.
 *
 * The void half is the dangerous half, so it is pinned hard:
 *   - Owner/Administrator only (void-cancel governance), reason required (min 3).
 *   - void-not-delete: sets voided_at + voided_reason, never DELETE.
 *   - OWNER RULING 2026-07-23 (amend BLOCKS, never cascades): a fine already converted to a
 *     driver_finance.driver_liabilities row REFUSES the void and names the dependent liability id.
 *     Voiding it while the liability stands would leave the driver owing money for a fine that no
 *     longer exists — the same silent-overcharge shape as the fine-reduce path fixed in #3341.
 *   - The converted/voided predicate is repeated in the UPDATE so a concurrent convert cannot slip
 *     between the read and the write.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/safety/safety-v5.routes.ts";
const API = "apps/frontend/src/api/safety.ts";
const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const FILES = [ROUTES, API, PAGE];
const LABEL = "verify-internal-fine-lifecycle";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Slice the void handler so assertions cannot be satisfied by unrelated code elsewhere in the file. */
// Route matchers are FORMAT-AGNOSTIC on purpose: adding the repo's `{ config: { rateLimit } }`
// second argument reformats the registration across lines, and an assertion keyed to the one-line
// shape would report "no void route" for a route that is right there — a false alarm that teaches
// the next person to distrust the guard.
const DISPUTE_ROUTE = /app\.patch\(\s*"\/api\/v1\/safety\/internal-fines\/:id\/dispute"/;
const VOID_ROUTE = /app\.post\(\s*"\/api\/v1\/safety\/internal-fines\/:id\/void"/;

function voidHandler(routeSrc) {
  const match = VOID_ROUTE.exec(routeSrc);
  const start = match ? match.index : -1;
  if (start === -1) return "";
  const rest = routeSrc.slice(start);
  const end = rest.indexOf("app.post(\"/api/v1/safety/v5/complaints\"");
  return end === -1 ? rest.slice(0, 6000) : rest.slice(0, end);
}

export function assertInternalFineLifecycle(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  // 1. Both transitions exist.
  if (!DISPUTE_ROUTE.test(src[ROUTES])) {
    problems.push(`${ROUTES}: no dispute route — a driver has no recorded way to contest an internal fine.`);
  }
  const vh = voidHandler(src[ROUTES]);
  if (!vh) {
    problems.push(`${ROUTES}: no void route for internal fines — the record could never be corrected, only created.`);
    return problems;
  }

  // 2. Void is role-gated and reason-required.
  if (!/\["Owner", "Administrator"\]\.includes\(user\.role\)/.test(vh)) {
    problems.push(`${ROUTES}: the internal-fine void is not restricted to Owner/Administrator — void-cancel governance requires it.`);
  }
  if (!src[ROUTES].includes("internalFineReasonBodySchema") || !/reason: z\.string\(\)\.trim\(\)\.min\(3\)/.test(src[ROUTES])) {
    problems.push(`${ROUTES}: the lifecycle reason is not required at min length 3 — a void with no accountable explanation.`);
  }

  // 3. void-not-delete.
  if (!/voided_at = now\(\)/.test(vh) || !/voided_reason = /.test(vh)) {
    problems.push(`${ROUTES}: the void does not set voided_at + voided_reason (void-not-delete).`);
  }
  if (/DELETE\s+FROM\s+safety\.internal_fines/i.test(src[ROUTES])) {
    problems.push(`${ROUTES}: internal fines are DELETEd somewhere — void-not-delete forbids it.`);
  }

  // 4. A converted fine refuses the void AND names the dependent liability.
  if (!/driver_liability_id/.test(vh) || !/internal_fine_already_converted_to_liability/.test(vh)) {
    problems.push(`${ROUTES}: the void does not refuse a fine already converted to a driver liability — voiding it would leave the driver owing money for a fine that no longer exists.`);
  }
  if (!/AND driver_liability_id IS NULL/.test(vh)) {
    problems.push(`${ROUTES}: the converted-fine guard is not repeated in the UPDATE predicate — a concurrent convert can slip between the read and the write.`);
  }

  // 5. The UI can actually reach both transitions.
  for (const [needle, what] of [
    ["disputeInternalFine", "dispute"],
    ["voidInternalFine", "void"],
  ]) {
    if (!src[API].includes(`export function ${needle}`)) {
      problems.push(`${API}: no ${needle} client — the ${what} route is unreachable from the UI.`);
    }
    if (!src[PAGE].includes(needle)) {
      problems.push(`${PAGE}: does not call ${needle} — the row action is missing, which is the original defect.`);
    }
  }
  if (!/key: "actions"/.test(src[PAGE])) {
    problems.push(`${PAGE}: the fines grid has no Actions column — a fine can be imposed and never corrected.`);
  }
  if (!src[PAGE].includes("VoidReasonModal")) {
    problems.push(`${PAGE}: lifecycle actions do not use the reason-required shell — a reasonless void.`);
  }
  if (!/query\.isError[\s\S]*?<ListErrorBanner[\s\S]*?query\.refetch\(\)/.test(src[PAGE])) {
    problems.push(`${PAGE}: query failure must render retryable ListErrorBanner before empty copy.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertInternalFineLifecycle(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "dispute-route-removed",
    { ...live, [ROUTES]: live[ROUTES].replace('/api/v1/safety/internal-fines/:id/dispute', '/api/v1/safety/internal-fines/:id/something-else') },
    "no dispute route"
  );
  expectCaught(
    "void-role-gate-weakened",
    { ...live, [ROUTES]: live[ROUTES].replace('["Owner", "Administrator"].includes(user.role)', "true") },
    "not restricted to Owner/Administrator"
  );
  expectCaught(
    "converted-guard-dropped-from-update",
    { ...live, [ROUTES]: live[ROUTES].replace(/AND driver_liability_id IS NULL/g, "") },
    "not repeated in the UPDATE predicate"
  );
  expectCaught(
    "void-becomes-a-delete",
    { ...live, [ROUTES]: live[ROUTES].replace(/voided_at = now\(\)/g, "status = 'voided'") },
    "does not set voided_at + voided_reason"
  );
  expectCaught(
    "reason-no-longer-required",
    { ...live, [ROUTES]: live[ROUTES].replace("reason: z.string().trim().min(3).max(500)", "reason: z.string().optional()") },
    "not required at min length 3"
  );
  expectCaught(
    "row-actions-removed",
    { ...live, [PAGE]: live[PAGE].replace(/key: "actions"/g, 'key: "not_actions"') },
    "has no Actions column"
  );

  const liveProblems = assertInternalFineLifecycle(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertInternalFineLifecycle();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — internal fines can be disputed and voided (reason-required, Owner/Admin void, converted fines refused)`);
