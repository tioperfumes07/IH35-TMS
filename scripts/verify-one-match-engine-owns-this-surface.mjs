#!/usr/bin/env node
/**
 * ROUND 156 §0 / ROUND 157-C PR1 — ONE match engine owns the Banking Match surface.
 * Declared owner: accounting/bank-recon/match.service.ts (findCandidates / computeMatchScore /
 * acceptMatchWithResolveDifference).
 * link-suggestion-engine and obligation-reconcile suggestionConfidence must NOT be imported by
 * the Match drawer / BankingTransactionsDesignView match panel / match-candidates route.
 *
 * Usage: node scripts/verify-one-match-engine-owns-this-surface.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-one-match-engine-owns-this-surface";
const FILES = {
  service: "apps/backend/src/accounting/bank-recon/match.service.ts",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
  view: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  linkEngine: "apps/backend/src/banking/link-suggestion-engine.ts",
  obligation: "apps/backend/src/banking/obligation-reconcile.logic.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function problemsFor(files) {
  const p = [];
  if (!/THIS FILE OWNS THE BANKING MATCH SURFACE/.test(files.service)) {
    p.push("match.service.ts must declare it owns the Banking Match surface");
  }
  if (!/findCandidates/.test(files.service) || !/computeMatchScore/.test(files.service)) {
    p.push("match.service must export findCandidates / computeMatchScore");
  }
  if (!/from ["'].*match\.service/.test(files.route) || !/findCandidates/.test(files.route)) {
    p.push("match-candidates route must call findCandidates from match.service");
  }
  if (/link-suggestion-engine/.test(files.route)) {
    p.push("match-candidates route must not import link-suggestion-engine");
  }
  if (/link-suggestion-engine|rankLinkCandidates|suggestionConfidence/.test(files.view)) {
    p.push("BankingTransactionsDesignView match panel must not use link-suggestion / obligation confidence");
  }
  if (/link-suggestion-engine|rankLinkCandidates|suggestionConfidence/.test(files.drawer)) {
    p.push("MatchDrawer must not use link-suggestion / obligation confidence");
  }
  if (!/getMatchCandidates/.test(files.view) || !/getMatchCandidates/.test(files.drawer)) {
    p.push("view + drawer must call getMatchCandidates (match.service path)");
  }
  // The other two engines may exist — they just must not own THIS surface.
  if (!fs.existsSync(path.join(ROOT, FILES.linkEngine))) {
    // ok if retired entirely
  }
  return p;
}

if (process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, rel.includes("link") || rel.includes("obligation") ? "" : read(rel)]));
  base.service = read(FILES.service);
  base.route = read(FILES.route);
  base.view = read(FILES.view);
  base.drawer = read(FILES.drawer);
  if (problemsFor(base).length) {
    console.error("baseline FAIL", problemsFor(base));
    process.exit(1);
  }
  const bad = { ...base, view: base.view + '\nimport { rankLinkCandidates } from "../../../api/x";\n' };
  // Actually inject into view string
  const badView = { ...base, view: base.view + "\nrankLinkCandidates(\n" };
  if (!problemsFor(badView).length) {
    console.error("mutant did not fail");
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const problems = problemsFor({
  service: read(FILES.service),
  route: read(FILES.route),
  view: read(FILES.view),
  drawer: read(FILES.drawer),
});
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of problems) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
