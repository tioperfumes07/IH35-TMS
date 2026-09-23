#!/usr/bin/env node
// Account numbers are hidden everywhere by default (owner, Round 83 R1: "I DO NOT WANT TO VIEW THE
// ACCOUNT NUMBERS ANYWHERE"), so the account NAME is the only thing a person sees. Two active
// USMCA accounts with the same name are an ambiguity in every picker, register and report
// (Lead, Round 84 M1). Live, read-only.
//   collision       two active accounts whose names match, ignoring case and whitespace
//   near-collision  names that match once "(hired unknown)" is removed (CC-3 is stripping it
//                   from the driver account names, E13-B D5)
// A group not in the baseline -> FAIL. A baselined group that no longer collides -> PASS with a
// note; the PR that fixed it removes it from the baseline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-duplicate-active-account-names";
export const REQUIRES_LIVE_DB =
  "reads catalogs.accounts on live USMCA in a READ ONLY transaction; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH =
  process.env.DUPLICATE_ACCOUNT_NAME_BASELINE_PATH ||
  path.join(ROOT, "scripts/verify-no-duplicate-active-account-names.baseline.json");

const HIRED_UNKNOWN_RE = /\s*\(hired unknown\)\s*/gi;
const HAS_HIRED_UNKNOWN = /\(hired unknown\)/i;

export function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function strippedName(name) {
  return normalizeName(String(name ?? "").replace(HIRED_UNKNOWN_RE, " "));
}

function groupsBy(rows, keyOf, keep) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r.account_name);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].filter(([, rs]) => rs.length > 1 && keep(rs)).map(([key, accounts]) => ({ key, accounts }));
}

export function findCollisions(rows) {
  const collisions = groupsBy(rows, normalizeName, () => true);
  const exactKeys = new Set(collisions.map((g) => g.key));
  const nearCollisions = groupsBy(rows, strippedName, (rs) => rs.some((r) => HAS_HIRED_UNKNOWN.test(r.account_name))).filter(
    (g) => !exactKeys.has(g.key)
  );
  return { collisions, nearCollisions };
}

export function evaluate(found, baseline) {
  const known = { collisions: new Set(baseline.collisions ?? []), nearCollisions: new Set(baseline.near_collisions ?? []) };
  const out = { failures: [], notes: [] };
  for (const kind of ["collisions", "nearCollisions"]) {
    const current = new Set(found[kind].map((g) => g.key));
    for (const g of found[kind]) if (!known[kind].has(g.key)) out.failures.push({ kind, ...g });
    for (const key of known[kind]) if (!current.has(key)) out.notes.push({ kind, key });
  }
  return out;
}

function describe(g) {
  return g.accounts.map((a) => `"${a.account_name}" (${a.account_number ?? "no number"}, ${a.account_type})`).join(" · ");
}

function selftest() {
  const check = (cond, msg) => {
    if (!cond) {
      console.error(`${LABEL} --selftest FAIL: ${msg}`);
      process.exit(1);
    }
  };
  const acct = (account_name, account_number = "1") => ({ account_name, account_number, account_type: "Expense" });
  const clean = [acct("Office Expense"), acct("Office & Administrative Expense"), acct("Fuel")];
  check(findCollisions(clean).collisions.length === 0, "distinct names must not collide");
  check(findCollisions([acct("Fuel Expense"), acct("  fuel   EXPENSE ")]).collisions.length === 1, "case and whitespace must not hide a duplicate");
  const near = findCollisions([acct("Driver Escrow - Juan Perez (hired unknown)"), acct("Driver Escrow - Juan Perez")]);
  check(near.nearCollisions.length === 1 && near.collisions.length === 0, "a name differing only by (hired unknown) is a near-collision");
  check(
    findCollisions([acct("Driver Escrow - Ana (Hired Unknown)"), acct("Driver Escrow - Ana (hired unknown)")]).collisions.length === 1,
    "two names both carrying (hired unknown) are an exact collision, not only a near one"
  );
  const planted = findCollisions([acct("Tires"), acct("TIRES")]);
  check(evaluate(planted, {}).failures.length === 1, "a planted duplicate not in the baseline must fail");
  check(evaluate(planted, { collisions: ["tires"] }).failures.length === 0, "a baselined duplicate must pass");
  check(evaluate(findCollisions(clean), { collisions: ["tires"] }).notes.length === 1, "a fixed baselined duplicate must be reported for removal");
  console.log(`${LABEL} --selftest PASS — 7 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let rows;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  rows = (
    await client.query(
      `SELECT id::text, account_number, account_name, account_type::text AS account_type
         FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
        ORDER BY account_name`,
      [USMCA_COMPANY_ID]
    )
  ).rows;
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}

if (rows.length === 0) {
  console.error(`${LABEL}: FAIL — 0 active USMCA accounts visible; that is an instrument problem, not a clean chart`);
  process.exit(1);
}

const found = findCollisions(rows);
const { failures, notes } = evaluate(found, baseline);
for (const n of notes) {
  console.log(`${LABEL}: NOTE — "${n.key}" no longer collides. Remove it from ${path.basename(BASELINE_PATH)} in the PR that fixed it.`);
}
if (failures.length > 0) {
  console.error(`${LABEL}: FAIL — ${failures.length} account name group(s) a person cannot tell apart:`);
  for (const f of failures) console.error(`  ✗ ${f.kind === "collisions" ? "same name" : "same name apart from (hired unknown)"}: ${describe(f)}`);
  process.exit(1);
}
const hiredUnknown = rows.filter((r) => HAS_HIRED_UNKNOWN.test(r.account_name)).length;
console.log(
  `${LABEL}: PASS — ${rows.length} active USMCA accounts, ${new Set(rows.map((r) => normalizeName(r.account_name))).size} distinct names; ` +
    `${found.collisions.length} collision(s), ${found.nearCollisions.length} near-collision(s) (${hiredUnknown} names still carry "(hired unknown)").`
);
