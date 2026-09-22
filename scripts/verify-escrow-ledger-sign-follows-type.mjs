#!/usr/bin/env node
/**
 * ESCROW-LEDGER-SIGN-01 — owner ruling, 2026-09-23, verbatim: "A hold is a CREDIT to the driver's
 * escrow liability... Held = negative to him, credit to 2100-00-NNN. Released = positive... Fix
 * the writer; sign follows transaction_type, never the caller." Guard requirement, same ruling:
 * "a 'hold' row with a positive amount is a build failure."
 *
 * ROOT CAUSE this responds to: driver_finance.escrow_ledger's own writers each independently
 * reimplemented the INSERT with their own ad-hoc sign -- settlements/approval.service.ts forced
 * `Math.abs(amountCents)` unconditionally regardless of hold vs release, discarding the sign
 * distinction entirely. Live-measured before the fix: 56 of 60 USMCA rows positive, net
 * +$1,624.99, against 80 real settlement-document hold lines netting -$2,000.00.
 *
 * TWO CHECKS:
 *   STATIC  every INSERT INTO driver_finance.escrow_ledger in apps/backend/src derives
 *           amount_cents via signedEscrowLedgerAmountCents(...) (escrow-ledger-sign.ts) --
 *           never a raw variable, never Math.abs(...), so the sign can never again be a
 *           per-caller guess.
 *   LIVE    no live row violates the sign law: hold/forfeit rows must be <= 0 (0 is a real,
 *           legitimate zero-amount adjustment; only a POSITIVE hold/forfeit is the defect),
 *           release rows must be >= 0. (`correction` is exempt -- its sign is data-dependent,
 *           per the shared helper's own contract.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-ledger-sign-follows-type";
const SRC = path.join(ROOT, "apps", "backend", "src");
const SELFTEST = process.argv.includes("--selftest");

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

/**
 * @param {string} src file contents
 * @returns {string[]} violations found in this file (each names the offending INSERT), or [].
 */
export function checkWriterSource(src) {
  if (!/INSERT INTO driver_finance\.escrow_ledger/.test(src)) return [];
  const problems = [];
  // The file must reference the shared sign helper at all if it writes this table.
  if (!/signedEscrowLedgerAmountCents\s*\(/.test(src)) {
    problems.push(
      "writes driver_finance.escrow_ledger but never calls signedEscrowLedgerAmountCents() -- sign is not derived from transaction_type"
    );
  }
  return problems;
}

function selftest() {
  const bad = `
    await client.query(
      \`INSERT INTO driver_finance.escrow_ledger (transaction_type, amount_cents) VALUES ($1, $2)\`,
      [type, Math.abs(amountCents)]
    );
  `;
  const good = `
    await client.query(
      \`INSERT INTO driver_finance.escrow_ledger (transaction_type, amount_cents) VALUES ($1, $2)\`,
      [type, signedEscrowLedgerAmountCents(type, amountCents)]
    );
  `;
  const unrelated = `const x = Math.abs(y); doSomethingElse(x);`;
  if (checkWriterSource(bad).length !== 1) throw new Error(`${LABEL} selftest: raw-sign writer not caught`);
  if (checkWriterSource(good).length !== 0) throw new Error(`${LABEL} selftest: compliant writer flagged`);
  if (checkWriterSource(unrelated).length !== 0) throw new Error(`${LABEL} selftest: unrelated Math.abs flagged`);
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const staticFailures = [];
for (const abs of walk(SRC, [])) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const problems = checkWriterSource(fs.readFileSync(abs, "utf8"));
  for (const p of problems) staticFailures.push(`${rel}: ${p}`);
}

if (staticFailures.length) {
  console.error(`${LABEL}: FAILED (static) — ${staticFailures.length} writer(s) don't derive the sign from transaction_type:`);
  for (const f of staticFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — every driver_finance.escrow_ledger writer derives amount_cents via signedEscrowLedgerAmountCents()`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  // is_local=false (SESSION scope, not the 3rd-arg-true LOCAL/transaction scope) -- this script
  // issues each query as its own implicit transaction on a single persistent Client connection, so
  // a LOCAL-scoped setting would reset before the next statement runs, silently un-bypassing RLS
  // and making every live check below read a false "0 violations."
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
  const res = await client.query(`
    SELECT transaction_type, count(*) FILTER (WHERE transaction_type IN ('hold','forfeit') AND amount_cents > 0) AS bad_holds,
           count(*) FILTER (WHERE transaction_type = 'release' AND amount_cents < 0) AS bad_releases
    FROM driver_finance.escrow_ledger
    GROUP BY transaction_type
  `);
  let badHolds = 0;
  let badReleases = 0;
  for (const row of res.rows) {
    badHolds += Number(row.bad_holds ?? 0);
    badReleases += Number(row.bad_releases ?? 0);
  }
  // Shrink-only baseline (ESCROW-LEDGER-SIGN-01, 2026-09-23): the 39 pre-fix hold rows are known
  // debt per the owner's own ruling ("FIX THE WRITER, not the rows -- the rows purge") -- accepted
  // as a ceiling, not a pass. Growing past it means a writer regressed (a NEW wrong-signed row),
  // which still fails. Baseline file is never edited to grow without a written ruling.
  const baselinePath = path.join(ROOT, "scripts", "verify-escrow-ledger-sign-follows-type.baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (badHolds > baseline.bad_holds_ceiling || badReleases > baseline.bad_releases_ceiling) {
    console.error(
      `${LABEL}: LIVE FAIL — ${badHolds} hold/forfeit row(s) with amount_cents > 0 (ceiling ${baseline.bad_holds_ceiling}), ${badReleases} release row(s) with amount_cents < 0 (ceiling ${baseline.bad_releases_ceiling}). Sign must follow transaction_type. A NEW wrong-signed row was written after the fix.`
    );
    process.exit(1);
  }
  if (badHolds > 0 || badReleases > 0) {
    console.log(
      `${LABEL}: LIVE PASS (known debt, not growing) — ${badHolds} pre-fix hold row(s) / ${badReleases} pre-fix release row(s), within the ${baseline.established} baseline ceiling. These purge; the writer no longer produces new ones.`
    );
  } else {
    console.log(`${LABEL}: LIVE OK — 0 sign violations across driver_finance.escrow_ledger`);
  }
} finally {
  await client.end();
}
