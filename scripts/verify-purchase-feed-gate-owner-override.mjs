#!/usr/bin/env node
/**
 * verify-purchase-feed-gate-owner-override — LEAD 443.154 (owner 2026-10-16 11:03 CT: "I already put an override and if I
 * already provided a reason, then it should let me").
 *
 * The purchase Feed Gate (apps/backend/src/factoring/purchase-candidates.service.ts runPurchaseFeedGate) must:
 *   1. release reds ONLY for an Owner actor WITH an engine-confirmed override code (LEAD 443.294; ownerOverride = code && actorIsOwner);
 *   2. never release silently: every released red writes a WORM 'na' feed_intake_checks row carrying the reason, and the
 *      invoice gets one `factoring.purchase_feed_gate_owner_override` audit row;
 *   3. keep "invoice not found in this company" hard (never released);
 *   4. be called by POST /api/v1/factoring/purchases only after ownerGate, passing actorIsOwner.
 * Run: node scripts/verify-purchase-feed-gate-owner-override.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-purchase-feed-gate-owner-override";
const SERVICE = "apps/backend/src/factoring/purchase-candidates.service.ts";
const ROUTES = "apps/backend/src/factoring/purchase.routes.ts";

export function check(service, routes) {
  const p = [];
  const fn = service.slice(service.indexOf("export async function runPurchaseFeedGate("), service.indexOf("async function recordOwnerOverrideCheck("));
  if (!fn) return [`${SERVICE}: runPurchaseFeedGate not found.`];
  // LEAD 443.294: the reason is the ONE override engine's confirmed catalog code (recordOverride in the route), not >= 10 typed chars.
  if (!/const ownerOverride = override\.length > 0 && opts\.actorIsOwner === true;/.test(fn)) p.push(`${SERVICE}: the release must require BOTH an engine-confirmed override code AND opts.actorIsOwner === true.`);
  if (!/if \(reds\.length && ownerOverride\)/.test(fn)) p.push(`${SERVICE}: reds may be released only under ownerOverride.`);
  if (!/for \(const r of reds\) await recordOwnerOverrideCheck\(/.test(fn)) p.push(`${SERVICE}: every released red must write its WORM 'na' check row (recordOwnerOverrideCheck).`);
  if (!/"factoring\.purchase_feed_gate_owner_override"/.test(fn)) p.push(`${SERVICE}: a released invoice must write the factoring.purchase_feed_gate_owner_override audit row.`);
  const notFound = fn.indexOf('"invoice not found in this company"');
  const release = fn.indexOf("if (reds.length && ownerOverride)");
  if (notFound < 0 || !/feed_gate_subject_not_found[\s\S]{0,120}continue;/.test(fn) || notFound > release) p.push(`${SERVICE}: "invoice not found in this company" must stay hard (pushed + continue BEFORE any override release).`);
  if (!/'na'/.test(service.slice(service.indexOf("async function recordOwnerOverrideCheck(")))) p.push(`${SERVICE}: recordOwnerOverrideCheck must write status 'na'.`);
  const route = routes.slice(routes.indexOf('app.post("/api/v1/factoring/purchases",'));
  const gateAt = route.indexOf("ownerGate(");
  const runAt = route.indexOf("runPurchaseFeedGate(");
  if (gateAt < 0 || runAt < 0 || gateAt > runAt) p.push(`${ROUTES}: POST /factoring/purchases must run ownerGate before runPurchaseFeedGate.`);
  if (!/runPurchaseFeedGate\([\s\S]{0,400}actorIsOwner: true/.test(route)) p.push(`${ROUTES}: POST /factoring/purchases must pass actorIsOwner to runPurchaseFeedGate.`);
  return p;
}

if (process.argv.includes("--selftest")) {
  const service = readFileSync(join(ROOT, SERVICE), "utf8");
  const routes = readFileSync(join(ROOT, ROUTES), "utf8");
  const planted = [
    ["release without the Owner flag", service.replace("&& opts.actorIsOwner === true;", ";"), routes],
    ["silent release (no 'na' rows)", service.replace("for (const r of reds) await recordOwnerOverrideCheck(", "for (const r of reds) void ("), routes],
    ["no audit row", service.replace('"factoring.purchase_feed_gate_owner_override"', '"x"'), routes],
    ["not-found released", service.replace('out.push({ invoice_id: invoiceId, passed: false, intake_id: null, error: "feed_gate_subject_not_found", reds: extra });\n      continue;', ""), routes],
    ["route skips actorIsOwner", service, routes.replace("actorIsOwner: true", "actorIsOwner: false")],
  ];
  let caught = 0;
  for (const [name, s, r] of planted) {
    const problems = check(s, r);
    if (problems.length) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted "${name}" NOT caught`);
  }
  const clean = check(service, routes).length === 0;
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught; clean source ${clean ? "passes" : "FAILS"}`);
  process.exit(caught === planted.length && clean ? 0 : 1);
}

const problems = check(readFileSync(join(ROOT, SERVICE), "utf8"), readFileSync(join(ROOT, ROUTES), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — the purchase Feed Gate releases reds only for the Owner with a reason, records each release ('na' row + audit), and keeps not-found hard.`);
