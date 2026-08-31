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
  const mappings = source.routes.match(/error instanceof ReconciledSessionLockedError/g) ?? [];
  if (mappings.length !== 2 || !/reply\.code\(409\)\.send\(\{ error: error\.code, message: error\.message \}\)/.test(source.routes)) {
    errors.push("accept-match and manual-match must map the typed closed-session error to HTTP 409");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove pre-write assert", { ...good, service: good.service.replace("await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);", "") }],
    ["move assert after store", { ...good, service: good.service.replace("await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);", "").replace("await storeMatch(client, {", "await storeMatch(client, { /* assert moved after write */") }],
    ["drop one route mapping", { ...good, routes: good.routes.replace(/if \(error instanceof ReconciledSessionLockedError\) \{[\s\S]*?\n      \}/, "") }],
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
