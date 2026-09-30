#!/usr/bin/env node

import fs from "node:fs";

const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const ROUTES = "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts";
const good = { service: fs.readFileSync(SERVICE, "utf8"), routes: fs.readFileSync(ROUTES, "utf8") };

function audit(source) {
  const errors = [];
  const accept = source.service.slice(source.service.indexOf("export async function acceptMatchWithResolveDifference"));
  const assertAt = accept.indexOf("await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id)");
  const storeAt = accept.indexOf("await storeMatch(client");
  if (assertAt < 0 || storeAt < 0 || assertAt > storeAt) {
    errors.push("accept-match must reject a closed reconciliation session before persisting the match");
  }
  if (!source.service.includes('from "../../banking/closed-session-immutability.js"')) {
    errors.push("accept-match must reuse the canonical closed-session helper");
  }
  // BANK-RECON-409-GUARD (Lead, 2026-09-30): this used to assert `mappings.length !== 2`, an exact
  // count. accept-multi-match was later given the SAME correct 409 mapping — a third, right answer —
  // and the guard went red on main for it. An exact count punishes correctness: adding another
  // money-writing match route that handles the closed-session lock properly must never fail a guard
  // whose whole purpose is that the lock IS handled. Worse, the count could be satisfied while the
  // wrong two routes carried it. Assert PER ROUTE instead — strictly stronger, and it cannot be
  // satisfied by mappings living somewhere else.
  const MONEY_WRITING_MATCH_ROUTES = [
    "/api/v1/bank-recon/accept-match",
    "/api/v1/bank-recon/manual-match",
    "/api/v1/bank-recon/accept-multi-match",
  ];
  const routeBodies = new Map();
  const starts = [...source.routes.matchAll(/app\.(?:post|get|patch|put)\(\s*"([^"]+)"/g)].map((m) => ({
    path: m[1],
    at: m.index,
  }));
  starts.forEach((s, i) => {
    routeBodies.set(s.path, source.routes.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : source.routes.length));
  });
  const MAPPING =
    /if \(error instanceof ReconciledSessionLockedError\) \{[\s\S]{0,200}?reply\.code\(409\)\.send\(\{ error: error\.code, message: error\.message \}\)/;
  for (const route of MONEY_WRITING_MATCH_ROUTES) {
    const body = routeBodies.get(route);
    if (!body) {
      errors.push(`${route} is missing from recon-worklist.routes.ts — a money-writing match route may not disappear silently`);
      continue;
    }
    if (!MAPPING.test(body)) {
      errors.push(`${route} must map the typed closed-session error (ReconciledSessionLockedError) to HTTP 409`);
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove pre-write assert", { ...good, service: good.service.replace("await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);", "") }],
    ["move assert after store", { ...good, service: good.service.replace("await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);", "").replace("await storeMatch(client, {", "await storeMatch(client, { /* assert moved after write */") }],
    ["drop one route mapping", { ...good, routes: good.routes.replace(/if \(error instanceof ReconciledSessionLockedError\) \{[\s\S]*?\n      \}/, "") }],
    // BANK-RECON-409-GUARD — prove the check is PER ROUTE, not a count: drop only the LAST
    // mapping (accept-multi-match). A count-based check passed this; a per-route check cannot.
    ["drop the accept-multi-match mapping only", {
      ...good,
      routes: (() => {
        const at = good.routes.lastIndexOf("if (error instanceof ReconciledSessionLockedError) {");
        const end = good.routes.indexOf("\n      }", at) + "\n      }".length;
        return good.routes.slice(0, at) + good.routes.slice(end);
      })(),
    }],
    // …and that a money-writing match route cannot simply vanish to satisfy the guard.
    ["delete the accept-multi-match route entirely", {
      ...good,
      routes: good.routes.replace('"/api/v1/bank-recon/accept-multi-match"', '"/api/v1/bank-recon/retired"'),
    }],
  ];
  for (const [name, candidate] of mutations) {
    if (audit(candidate).length === 0) {
      console.error(`verify-bank-recon-accept-closed-session-conflict: SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`verify-bank-recon-accept-closed-session-conflict: selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const errors = audit(good);
if (errors.length) {
  console.error(`verify-bank-recon-accept-closed-session-conflict: FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-bank-recon-accept-closed-session-conflict: PASS");
