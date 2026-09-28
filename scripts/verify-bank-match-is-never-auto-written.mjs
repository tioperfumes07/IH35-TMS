#!/usr/bin/env node
/**
 * ROUND 156 §10 / ROUND 157-C — bank match is NEVER auto-written on GET / suggest / cron.
 * Persistence happens ONLY in the explicit accept handler.
 * Complements verify-no-automatch.mjs; asserts the named master-spec guard title.
 *
 * Usage: node scripts/verify-bank-match-is-never-auto-written.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-bank-match-is-never-auto-written";
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const ROUTE = "apps/backend/src/banking/p7-wave2.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function problemsFor({ service, route }) {
  const p = [];
  // findCandidates must not call storeMatch / UPDATE matched_*
  const findStart = service.indexOf("export async function findCandidates");
  const findEnd = service.indexOf("export async function acceptMatchWithResolveDifference");
  if (findStart < 0 || findEnd < 0) {
    p.push("findCandidates / acceptMatchWithResolveDifference boundaries missing");
    return p;
  }
  const findBody = service.slice(findStart, findEnd);
  if (/storeMatch\(/.test(findBody)) p.push("findCandidates must not call storeMatch (auto-write)");
  if (/matched_bill_payment_id\s*=/.test(findBody) || /review_state\s*=\s*'matched'/.test(findBody)) {
    p.push("findCandidates must not write matched_* / review_state");
  }
  if (!/acceptMatchWithResolveDifference/.test(service)) {
    p.push("acceptMatchWithResolveDifference must exist (the only write path)");
  }
  // GET match-candidates route must not write
  const getChunk = route.slice(route.indexOf('app.get("/api/v1/banking/transactions/:id/match-candidates"'));
  const getBody = getChunk.slice(0, 2500);
  if (/storeMatch|acceptMatch|UPDATE banking\.bank_transactions/.test(getBody)) {
    p.push("GET match-candidates must not write");
  }
  return p;
}

if (process.argv.includes("--selftest")) {
  const base = { service: read(SERVICE), route: read(ROUTE) };
  if (problemsFor(base).length) {
    console.error("baseline FAIL", problemsFor(base));
    process.exit(1);
  }
  const bad = {
    ...base,
    service: base.service.replace(
      "export async function findCandidates",
      "export async function findCandidates(){ await storeMatch(client,{}); }\nexport async function findCandidates_OLD"
    ),
  };
  if (!problemsFor(bad).length) {
    console.error("mutant did not fail");
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const problems = problemsFor({ service: read(SERVICE), route: read(ROUTE) });
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of problems) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
