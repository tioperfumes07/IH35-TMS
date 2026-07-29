#!/usr/bin/env node
/**
 * ACCT-LINK-06 / ACCT-F05 — Plaid/rules autoCategorize must reach CHAIN-05 (same terminal state as
 * For Review categorize): status=categorized + categorization_gl_account_id + maybePostBankCategorizationToGl
 * when an actor is present. apply-historical must default dry_run=true and pass actorUserUuid on apply.
 *
 * Cursor even claim: verify-step 1762.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAID = path.join(ROOT, "apps/backend/src/integrations/plaid/plaid.service.ts");
const RULES = path.join(ROOT, "apps/backend/src/banking/categorization-rules.routes.ts");

const failures = [];

function read(p) {
  if (!fs.existsSync(p)) {
    failures.push(`missing ${path.relative(ROOT, p)}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const plaid = read(PLAID);
const rules = read(RULES);

if (!/export async function autoCategorize/.test(plaid)) {
  failures.push("plaid.service.ts missing export async function autoCategorize");
}
if (!/categorization_gl_account_id\s*=\s*\$2/.test(plaid) && !/categorization_gl_account_id = \$2::uuid/.test(plaid)) {
  failures.push("autoCategorize must SET categorization_gl_account_id (CHAIN-05 tag), not only coa_account_id");
}
if (!/status = 'categorized'/.test(plaid)) {
  failures.push("autoCategorize must SET status = 'categorized'");
}
if (!/maybePostBankCategorizationToGl/.test(plaid)) {
  failures.push("autoCategorize must call maybePostBankCategorizationToGl when actorUserUuid is present");
}
if (!/actorUserUuid/.test(plaid)) {
  failures.push("autoCategorize opts must accept actorUserUuid");
}
if (!/dryRun/.test(plaid)) {
  failures.push("autoCategorize opts must accept dryRun (apply-historical preview)");
}

if (!/apply-historical/.test(rules)) {
  failures.push("categorization-rules.routes.ts missing apply-historical route");
}
if (!/dry_run/.test(rules)) {
  failures.push("apply-historical must expose dry_run (default true)");
}
if (!/actorUserUuid:\s*String\(user\.uuid\)/.test(rules) && !/actorUserUuid: String\(user\.uuid\)/.test(rules)) {
  failures.push("apply-historical apply path must pass actorUserUuid: String(user.uuid) into autoCategorize");
}
if (!/dryRun:\s*true/.test(rules)) {
  failures.push("apply-historical dry_run path must call autoCategorize(..., { dryRun: true })");
}

if (failures.length) {
  console.error("verify-acct-link06-rules-call-poster: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-acct-link06-rules-call-poster: OK — autoCategorize writes CHAIN-05 tags + calls poster with actor; apply-historical defaults dry_run"
);
