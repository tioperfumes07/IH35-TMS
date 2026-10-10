#!/usr/bin/env node
// ROUND 443.21 (owner, 2026-10-10): "in usmca we put in transportation env key. we only use transportation, we do not
// use relay usmca." Relay posts fills from the IH 35 TRANSPORTATION LLC account to ?entity=TRANSP. A verified delivery
// to ?entity=TRANSP or ?entity=USMCA is stored ONCE under USMCA; nothing is written under Transportation; a fill dated
// before 2026-08-03 is refused by name. The signature still verifies with the ENTITY's own secret.
//
// Static, on apps/backend/src/integrations/relay-payments/relay-fuel-webhook.routes.ts:
//   1. RELAY_WEBHOOK_ACCOUNT_STORAGE maps TRANSP and USMCA to USMCA_OPERATING_COMPANY_ID;
//   2. the secret is still read for the entity's own code (companySecret(company.code)) and verified BEFORE parsing;
//   3. ingestForCompany and the flag read use storageCompanyId, never company.id;
//   4. rows dated before the floor are split off by splitRelayRowsAtUsmcaFloor before ingestForCompany and returned by
//      name (refused_before_usmca_floor);
//   5. the secret value is never logged or audited (no `secret` inside an audit payload or log call).
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-webhook-stores-under-usmca";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/integrations/relay-payments/relay-fuel-webhook.routes.ts";

export function check(src) {
  const f = [];
  const map = src.match(/RELAY_WEBHOOK_ACCOUNT_STORAGE[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (!map) f.push("RELAY_WEBHOOK_ACCOUNT_STORAGE is missing");
  else {
    if (!/TRANSP:\s*USMCA_OPERATING_COMPANY_ID/.test(map[1])) f.push("?entity=TRANSP must store under USMCA");
    if (!/USMCA:\s*USMCA_OPERATING_COMPANY_ID/.test(map[1])) f.push("?entity=USMCA must store under USMCA");
  }
  const handler = src.slice(src.indexOf("async function handleRelayWebhook("));
  const iSecret = handler.indexOf("const secret = companySecret(company.code);");
  const iVerify = handler.indexOf("verifyRelayWebhookSignature(rawBody, secret,");
  const iParse = handler.indexOf("JSON.parse(rawBody");
  if (iSecret < 0 || iVerify < 0 || iParse < 0 || !(iSecret < iVerify && iVerify < iParse)) {
    f.push("the entity's own secret must verify the raw body before it is parsed");
  }
  if (!/isEnabled\(client, "RELAY_FUEL_INGEST_ENABLED", \{ operating_company_id: storageCompanyId \}\)/.test(handler)) {
    f.push("the ingest flag must be read for the storage company");
  }
  const ingest = handler.match(/ingestForCompany\(client, req, (\w+),/);
  if (!ingest || ingest[1] !== "storageCompanyId") f.push("ingestForCompany must store under storageCompanyId, never the entity's company");
  const iSplit = handler.indexOf("splitRelayRowsAtUsmcaFloor(allRows, storageCompanyId)");
  const iIngest = handler.indexOf("ingestForCompany(");
  if (iSplit < 0 || iIngest < 0 || iSplit > iIngest) f.push("pre-2026-08-03 fills must be split off before ingestForCompany");
  if (!handler.includes("refused_before_usmca_floor: beforeFloor")) f.push("pre-2026-08-03 fills must be refused by name in the response");
  if (/(audit\([^)]*|log\.\w+\([^)]*)\bsecret\b/.test(handler)) f.push("the signing secret must never be logged or audited");
  return f;
}

const read = () => fs.readFileSync(path.join(ROOT, ROUTE), "utf8");

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["TRANSP stored under Transportation", real.replace("TRANSP: USMCA_OPERATING_COMPANY_ID,", "TRANSP: TRANSP_ID,")],
    ["ingest under the entity's company", real.replace("ingestForCompany(client, req, storageCompanyId,", "ingestForCompany(client, req, company.id,")],
    ["flag read for the entity", real.replace("{ operating_company_id: storageCompanyId })", "{ operating_company_id: company.id })")],
    ["verified with the storage company's secret", real.replace("const secret = companySecret(company.code);", "const secret = companySecret(storageCode);")],
    ["pre-floor fills ingested", real.replace("splitRelayRowsAtUsmcaFloor(allRows, storageCompanyId)", "({ keep: allRows, beforeFloor: [] })")],
    ["secret audited", real.replace("reason: verify.reason,", "reason: verify.reason, secret,")],
  ];
  for (const [name, s] of plants) {
    if (s === real) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ?entity=TRANSP and ?entity=USMCA store under USMCA; entity secret verifies first; pre-2026-08-03 refused by name`);
