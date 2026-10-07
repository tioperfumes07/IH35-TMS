#!/usr/bin/env node
// Owner ruling 2026-10-02: "Two identical same-day transactions are ordinary in a real bank feed. QuickBooks never
// auto-removes them; it marks them 'possible duplicate' in For Review and the human decides. Do that ... No deletion, no
// merge, no script."
// Static: the For Review query computes possible_duplicate on the statement-upload identity and the screen renders it.
// Live (DATABASE_URL): every live identical group (account, date, |amount|, direction, printed description) still has all
// its lines (nothing removed) and the same predicate flags every one of them. A live check that cannot run FAILS.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const LABEL = "verify-bank-possible-duplicates-flagged-never-removed";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  routes: "apps/backend/src/banking/categorization.routes.ts",
  page: "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx",
};

export function check(src) {
  const fails = [];
  if (!/\) AS possible_duplicate\s+FROM banking\.bank_transactions bt/.test(src.routes)) fails.push(`${F.routes}: For Review no longer computes possible_duplicate`);
  if (!/AND d\.is_credit = bt\.is_credit/.test(src.routes) || !/abs\(d\.amount_cents\) = abs\(bt\.amount_cents\)/.test(src.routes)) {
    fails.push(`${F.routes}: the duplicate identity lost its amount / direction terms`);
  }
  if (!/tx\.possible_duplicate === true/.test(src.page) || !/Possible duplicate/.test(src.page)) fails.push(`${F.page}: the badge is not rendered`);
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const g = read();
  const plants = [
    ["flag dropped", { routes: g.routes.replace(") AS possible_duplicate", ") AS _x") }],
    ["direction ignored", { routes: g.routes.replace("AND d.is_credit = bt.is_credit", "") }],
    ["badge not shown", { page: g.page.replace("tx.possible_duplicate === true", "false") }],
  ];
  if (check(g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(g).join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, o]) => check({ ...g, ...o }).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await c.query(`
    WITH k AS (
      SELECT bt.id, bt.bank_account_id, bt.transaction_date, abs(bt.amount_cents) amt, bt.is_credit,
             lower(regexp_replace(btrim(bt.description), '\\s+', ' ', 'g')) d
        FROM banking.bank_transactions bt WHERE bt.voided_at IS NULL),
    g AS (SELECT bank_account_id, transaction_date, amt, is_credit, d, count(*) n FROM k GROUP BY 1,2,3,4,5 HAVING count(*) > 1)
    SELECT (SELECT count(*) FROM g)::int AS groups,
           (SELECT COALESCE(sum(n), 0) FROM g)::int AS lines,
           (SELECT count(*) FROM k JOIN g USING (bank_account_id, transaction_date, amt, is_credit, d)
             WHERE NOT EXISTS (SELECT 1 FROM k k2 WHERE k2.bank_account_id = k.bank_account_id AND k2.id <> k.id
                                AND k2.transaction_date = k.transaction_date AND k2.amt = k.amt AND k2.is_credit = k.is_credit AND k2.d = k.d))::int AS unflagged,
           (SELECT count(*) FROM banking.bank_transactions)::int AS total`)).rows[0];
  await c.query("ROLLBACK");
  if (r.total === 0) { console.error(`${LABEL}: FAIL — positive control: no bank lines visible`); process.exit(1); }
  if (r.unflagged > 0) { console.error(`${LABEL}: LIVE FAIL — ${r.unflagged} line(s) in identical groups the badge would not flag`); process.exit(1); }
  console.log(`${LABEL}: PASS — static 3/3; live: ${r.groups} identical group(s), ${r.lines} line(s), every one flagged and none removed; positive control ${r.total} bank lines`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
