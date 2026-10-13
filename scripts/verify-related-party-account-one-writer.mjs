#!/usr/bin/env node
/**
 * verify-related-party-account-one-writer — LEAD 443.134 #1.
 *
 * Owner standing rule: ONE running "Due to / from <party>" account per related party, created by the app. The ONE writer
 * is ensureRelatedPartyAccount (apps/backend/src/accounting/related-party-loan-posting/party-account.service.ts):
 *   1. nothing else in apps/backend/src INSERTs a "Due to / from" / 2410-00 account or a accounting.related_party_accounts row;
 *   2. the writer numbers the account with its allocator (nextRelatedPartyAccountNumber over every 2410-00-nnn ever used,
 *      live or retired) under a transaction-scoped advisory lock — never a hand-picked literal sub-account number;
 *   3. the writer is idempotent (returns the party's linked account first) and records the link + an audit event;
 *   4. the Owner route refuses a non-Owner (403, audited).
 * Static: reads source only.
 *
 * Run: node scripts/verify-related-party-account-one-writer.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-related-party-account-one-writer";
const WRITER = "apps/backend/src/accounting/related-party-loan-posting/party-account.service.ts";
const ROUTES = "apps/backend/src/accounting/related-party-loan-posting/routes.ts";
const SRC_DIR = "apps/backend/src";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(rel, out); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** files: { relPath: source } (whole backend), writer: source, routes: source. Returns problems. */
export function check(files, writer, routes) {
  const p = [];
  for (const [rel, src] of Object.entries(files)) {
    if (rel === WRITER) continue;
    const code = strip(src);
    if (/INSERT\s+INTO\s+accounting\.related_party_accounts/i.test(code)) p.push(`${rel}: writes accounting.related_party_accounts outside the one writer`);
    const inserts = code.match(/INSERT\s+INTO\s+catalogs\.accounts[\s\S]{0,1500}?(?:RETURNING|;|`)/gi) ?? [];
    if (inserts.some((i) => /Due to \/ from|'2410-00-/.test(i))) p.push(`${rel}: creates a related-party account outside ensureRelatedPartyAccount`);
  }
  const w = strip(writer);
  if (!/export async function ensureRelatedPartyAccount\(/.test(w)) p.push(`${WRITER}: ensureRelatedPartyAccount is gone`);
  if (!/pg_advisory_xact_lock\(hashtext\('related-party-account:'/.test(w)) p.push(`${WRITER}: allocation is not serialized per company (advisory lock)`);
  if (!/account_number ~ '\^2410-00-\[0-9\]\{3\}\$'/.test(w) || !/nextRelatedPartyAccountNumber\(used\)/.test(w)) p.push(`${WRITER}: the number is not allocated from every 2410-00-nnn ever used`);
  if (/'2410-00-[0-9]{3}'/.test(w)) p.push(`${WRITER}: a literal related-party sub-account number`);
  if (!/FROM accounting\.related_party_accounts l[\s\S]{0,400}party_vendor_id = \$2::uuid/.test(w) || !/dry_run: input\.dryRun, outcome: "exists"/.test(w)) p.push(`${WRITER}: not idempotent (the party's linked account is not returned first)`);
  if (!/INSERT INTO accounting\.related_party_accounts/.test(w) || !/"accounting\.related_party_account_ensured"/.test(w)) p.push(`${WRITER}: the link row / audit event is not written`);
  if (!/vendor_name FROM mdata\.vendors[\s\S]{0,200}operating_company_id = \$2::uuid AND deactivated_at IS NULL/.test(w)) p.push(`${WRITER}: the party is not an active vendor of the same company`);
  const r = strip(routes);
  if (!/"\/api\/v1\/accounting\/related-parties\/accounts\/ensure"/.test(r) || !/if \(role !== "Owner"\)[\s\S]{0,400}refuseNonOwnerRelatedPartyAccount[\s\S]{0,400}code\(403\)/.test(r)) p.push(`${ROUTES}: the ensure route is not Owner-only (403 + audit)`);
  return p;
}

function load() {
  const files = Object.fromEntries(walk(SRC_DIR).map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
  return { files, writer: files[WRITER] ?? "", routes: files[ROUTES] ?? "" };
}

if (process.argv.includes("--selftest")) {
  const real = load();
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real tree passes", check(real.files, real.writer, real.routes).length === 0);
  ex("a second writer of related_party_accounts is caught", check({ ...real.files, "apps/backend/src/x.ts": "await q(`INSERT INTO accounting.related_party_accounts (a) VALUES (1)`);" }, real.writer, real.routes).length > 0);
  ex("a hand-made Due to / from account elsewhere is caught", check({ ...real.files, "apps/backend/src/y.ts": "await q(`INSERT INTO catalogs.accounts (account_name) VALUES ('Due to / from X') RETURNING id`);" }, real.writer, real.routes).length > 0);
  ex("dropping the advisory lock is caught", check(real.files, real.writer.replace("pg_advisory_xact_lock(hashtext('related-party-account:'", "pg_sleep(0 + hashtext('x:'"), real.routes).length > 0);
  ex("a literal sub-account number is caught", check(real.files, real.writer.replace("nextRelatedPartyAccountNumber(used)", "'2410-00-005'"), real.routes).length > 0);
  ex("losing idempotency is caught", check(real.files, real.writer.replace('dry_run: input.dryRun, outcome: "exists"', 'dry_run: input.dryRun, outcome: "created"'), real.routes).length > 0);
  ex("dropping the audit event is caught", check(real.files, real.writer.replace('"accounting.related_party_account_ensured"', '"x"'), real.routes).length > 0);
  ex("an open (non-Owner) route is caught", check(real.files, real.writer, real.routes.replace('if (role !== "Owner")', "if (false)")).length > 0);
  console.log(ok ? `${LABEL} --selftest PASS (8/8)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const { files, writer, routes } = load();
const problems = check(files, writer, routes);
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — one writer of related-party accounts (allocator-numbered, idempotent, audited, Owner-only route)`);
