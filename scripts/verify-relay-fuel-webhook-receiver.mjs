#!/usr/bin/env node
// 10-02 CC-2 queue item 5 / Lead ROUND 353 — the Relay fuel webhook receiver changes ARRIVAL time, never the posting rule.
// Static (no database):
//   1. reject before persist: the signature is verified before the body is parsed or anything is ingested;
//   2. no secret configured -> 503 (the receiver never runs unsigned);
//   3. it lands rows only through ingestForCompany(..., source: "webhook") — the pull's own path — and writes nothing
//      itself (no INSERT, no journal entry, no direct poster call);
//   4. the after-commit flushes are the pull's (fuel GL + overage, each behind its own flag);
//   5. the route is registered in index.ts, and the unit test exists.
// --selftest plants each regression.
export const ALLOW_OFFLINE_SKIP = "static source contract — never touches the database";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-fuel-webhook-receiver";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/integrations/relay-payments/relay-fuel-webhook.routes.ts",
  index: "apps/backend/src/index.ts",
  test: "apps/backend/src/integrations/relay-payments/relay-fuel-webhook.test.ts",
  cron: "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts",
};

export function check(src) {
  const f = [];
  const r = src.route;
  const handler = r.slice(r.indexOf("async function handleRelayWebhook"));
  const iVerify = handler.indexOf("verifyRelayWebhookSignature(");
  const iParse = handler.indexOf("JSON.parse(");
  const iIngest = handler.indexOf("ingestForCompany(");
  if (iVerify < 0 || iParse < 0 || iIngest < 0 || !(iVerify < iParse && iParse < iIngest)) {
    f.push(`${FILES.route}: the signature must be verified before the body is parsed and before anything is ingested`);
  }
  if (!/verify\.reason === "no_secret"\) return reply\.code\(503\)/.test(handler)) f.push(`${FILES.route}: no configured secret must answer 503`);
  if (!/ingestForCompany\([\s\S]{0,400}?source: "webhook"/.test(handler)) f.push(`${FILES.route}: rows must land through ingestForCompany with source "webhook"`);
  if (/INSERT\s+INTO|UPDATE\s+fuel\.|createJournalEntry|postSourceTransaction|upsertRelayFuelTransaction\(/i.test(handler)) {
    f.push(`${FILES.route}: the receiver writes nothing itself — the pull's ingest path does`);
  }
  if (!/flushFuelGlPostsAfterCommit\(/.test(handler) || !/flushFuelCardOverageAfterCommit\(/.test(handler)) f.push(`${FILES.route}: the after-commit flushes must match the pull's`);
  if (!/await registerRelayFuelWebhookRoute\(app\)/.test(src.index)) f.push(`${FILES.index}: registerRelayFuelWebhookRoute is not registered`);
  if (!src.test.includes("verifyRelayWebhookSignature")) f.push(`${FILES.test}: the signature unit test is missing`);
  if (!/export async function ingestForCompany\(/.test(src.cron)) f.push(`${FILES.cron}: ingestForCompany must stay the one exported ingest path`);
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : ""]));

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["parse before verify", { ...real, route: real.route.replace("const code = q.data.entity.toUpperCase();", "const early = JSON.parse(rawBody.toString()); void early; const code = q.data.entity.toUpperCase();") }],
    ["unsigned accepted", { ...real, route: real.route.replace('if (verify.reason === "no_secret") return reply.code(503)', 'if (verify.reason === "no_secret") return reply.code(200)') }],
    ["source not webhook", { ...real, route: real.route.replace('source: "webhook",', 'source: "daily_pull",') }],
    ["direct insert", { ...real, route: real.route.replace("const pending: FuelTxnGlPostCandidate[]", "await Promise.resolve(`INSERT INTO fuel.fuel_transactions`); const pending: FuelTxnGlPostCandidate[]") }],
    ["unregistered", { ...real, index: real.index.replace("await registerRelayFuelWebhookRoute(app)", "void 0") }],
  ];
  for (const [name, s] of plants) {
    if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — signed before parsed, 503 when unconfigured, lands through ingestForCompany (source webhook), writes nothing itself, registered`);
