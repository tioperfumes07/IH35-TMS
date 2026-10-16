#!/usr/bin/env node
/**
 * LEAD 443.168 H — SUPERSEDES ACCT-LINK-06 / ACCT-F05's "rules reach CHAIN-05". OWNER LAW B (2026-09-12, permanent):
 * "it should never automatch, it suggests and we accept it or change the transactions". Plaid/rules autoCategorize is a
 * SUGGESTION: it writes suggested_* only — never status 'categorized', never categorization_gl_account_id /
 * coa_account_id, never maybePostBankCategorizationToGl. apply-historical still defaults dry_run=true.
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
const autoFn = (() => {
  const i = plaid.indexOf("export async function autoCategorize");
  return i < 0 ? "" : plaid.slice(i, plaid.indexOf("\nexport async function", i + 10));
})();
if (/status = 'categorized'|categorization_gl_account_id = \$|coa_account_id = \$/.test(autoFn)) {
  failures.push("autoCategorize writes a categorization (status / categorization_gl_account_id / coa_account_id) — Law B: suggest only");
}
if (/maybePostBankCategorizationToGl/.test(autoFn)) {
  failures.push("autoCategorize posts to the GL — Law B: only the human's categorize accept posts");
}
if (!/suggested_account_id = \$2::uuid/.test(autoFn) || !/plaid_rule:/.test(autoFn)) {
  failures.push("autoCategorize must write the suggestion (suggested_account_id + source plaid_rule:<id>)");
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
  "verify-acct-link06-rules-call-poster: OK — autoCategorize only SUGGESTS (Law B: no categorization, no GL post); apply-historical defaults dry_run"
);
