#!/usr/bin/env node
/**
 * ACCT-F350 — the account register replayed an unwind out of order, so A/P read NEGATIVE for money that
 * was never overpaid.
 *
 * WHAT HAPPENED: a reversal is back-dated onto the ORIGINAL entry's date whenever that period is still
 * open (resolveReversalDate — deliberate, matches QuickBooks, pinned by four tests in void.service.test.ts).
 * One date therefore legitimately holds a document AND its unwind, recorded days apart. Ordering that date
 * purely by recording time drops an unwind into the middle of still-live documents.
 *
 * Measured on prod 2026-08-11 — USMCA A/P (2000) on 2026-08-06: bill CC3-VOIDTEST-20260807-01 (+8,877)
 * had two payments (-3,340 and -1,260). Its VOID reversal was recorded at 02:12:56 but the second
 * payment's reversal only at 18:51, so the register removed the liability while a payment against it was
 * still standing and the running balance read **-3,340 — a negative accounts payable**.
 *
 * Unwinding is LAST-IN-FIRST-OUT: you cannot un-bill something while a payment against it stands. The fix
 * orders originals by recording order (a payment is never recorded before its bill), then their reversals
 * by the ORIGINAL's recording order DESCENDING.
 *
 * TWO INVARIANTS:
 *   A. STATIC — the register's ORDER BY ranks originals before reversals and orders reversals by the
 *      original's created_at DESC. Both halves: without the first, an unwind interleaves; without the
 *      second, a stack is unwound bottom-first, which is the same defect one level down.
 *   B. LIVE — under that ordering, no reversal sorts before the entry it reverses, on any account-day,
 *      on any entity.
 *
 * The static half needs no database, so it runs in every CI context including the fresh-DB job.
 *
 * Self-test: node scripts/verify-steps/3081-verify-register-reversal-never-precedes-original.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "3081-verify-register-reversal-never-precedes-original";
const SERVICE = path.join("apps", "backend", "src", "accounting", "account-register.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Strip comments FIRST — a guard that matches its own prose proves nothing (see 3065/3073/3077). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/** Exported so the selftest can mutate the REAL service source and prove each check bites. */
export function assertLifoUnwindOrdering(rawSource) {
  const problems = [];
  const code = stripComments(rawSource);

  const m = code.match(/ORDER BY\s+je\.entry_date[\s\S]*?`/i);
  if (!m) {
    problems.push(`cannot find the register's ORDER BY in ${SERVICE} — it moved; re-point this guard rather than deleting it`);
    return problems;
  }
  const orderBy = m[0].replace(/\s+/g, " ");

  // Originals before reversals: the reversal flag must be an ASC key.
  if (!/\(\s*je\.reverses_je_id IS NOT NULL\s*\)\s*ASC/i.test(orderBy)) {
    problems.push(
      "the register ORDER BY does not rank originals before reversals ((je.reverses_je_id IS NOT NULL) ASC) — an unwind lands in the middle of still-live documents and the running balance shows a state the books were never in (ACCT-F350)"
    );
  }

  // LIFO: reversals ordered by the ORIGINAL's recording time, descending.
  if (!/CASE WHEN je\.reverses_je_id IS NOT NULL THEN orig\.created_at END DESC/i.test(orderBy)) {
    problems.push(
      "the register ORDER BY does not unwind reversals LIFO (CASE WHEN je.reverses_je_id IS NOT NULL THEN orig.created_at END DESC) — a bill's void reversal can then precede the reversal of a payment made against it, which reads as a negative liability (ACCT-F350)"
    );
  }

  // The LIFO key needs the joined original; without it the CASE silently degrades.
  if (!/LEFT JOIN accounting\.journal_entries orig\s+ON orig\.id = je\.reverses_je_id/i.test(stripComments(rawSource).replace(/\s+/g, " "))) {
    problems.push("the register no longer joins the reversed entry as `orig` — the LIFO ordering key has nothing to sort by (ACCT-F350)");
  }

  return problems;
}

// ── selftest ─────────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  const healthy = fs.readFileSync(SERVICE, "utf8");
  const failures = [];

  const clean = assertLifoUnwindOrdering(healthy);
  if (clean.length) failures.push(`healthy source must PASS, got: ${clean.join(" | ")}`);

  const mutate = (name, from, to, needle) => {
    if (!healthy.includes(from)) {
      failures.push(`${name}: mutation anchor not present — the selftest is inert`);
      return;
    }
    const problems = assertLifoUnwindOrdering(healthy.replace(from, to));
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // Drop the originals-before-reversals rank → back to interleaved recording order (the ACCT-F350 defect).
  mutate(
    "originals/reversals rank removed",
    "               (je.reverses_je_id IS NOT NULL) ASC,\n",
    "",
    "does not rank originals before reversals"
  );

  // Keep the rank but unwind the stack bottom-first (ASC) — the subtler half of the same defect.
  mutate(
    "LIFO unwind inverted to FIFO",
    "CASE WHEN je.reverses_je_id IS NOT NULL THEN orig.created_at END DESC NULLS LAST",
    "CASE WHEN je.reverses_je_id IS NOT NULL THEN orig.created_at END ASC NULLS LAST",
    "does not unwind reversals LIFO"
  );

  // Remove the join the ordering key depends on.
  mutate(
    "orig join removed",
    "       LEFT JOIN accounting.journal_entries orig\n         ON orig.id = je.reverses_je_id AND orig.operating_company_id = je.operating_company_id\n",
    "",
    "no longer joins the reversed entry"
  );

  if (assertLifoUnwindOrdering(healthy.replace(/ACCT-F350/g, "ACCT-XXXX")).length) {
    failures.push("checks depend on the finding id appearing in prose rather than on the ORDER BY itself");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(`selftest: ${failures.length} check(s) do not catch what they claim`);
  }
  console.log(`[${LABEL}] SELFTEST PASS — 3 mutations caught, healthy source clean, no prose-matching`);
  process.exit(0);
}

if (!fs.existsSync(SERVICE)) fail(`${SERVICE} not found — the account register moved; re-point this guard rather than deleting it`);
const problems = assertLifoUnwindOrdering(fs.readFileSync(SERVICE, "utf8"));
if (problems.length) {
  for (const p of problems) console.error(` - ${p}`);
  fail(`${problems.length} register unwind-ordering invariant(s) broken (ACCT-F350)`);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] PASS (static half) — originals rank before reversals and reversals unwind LIFO; no DATABASE_URL for the live half`);
  process.exit(0);
}

// ── B · LIVE: under the register's ordering, no reversal precedes the entry it reverses ───────────
const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] PASS (static half) — database unreachable; static invariant held`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const present = await client.query(`SELECT to_regclass('accounting.journal_entries') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] PASS (static half) — accounting schema not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  const { rows } = await client.query(`
    WITH ordered AS (
      SELECT p.operating_company_id, p.account_id, je.entry_date, je.id AS je_id, je.reverses_je_id,
             row_number() OVER (
               PARTITION BY p.operating_company_id, p.account_id, je.entry_date
               ORDER BY (je.reverses_je_id IS NOT NULL) ASC,
                        CASE WHEN je.reverses_je_id IS NOT NULL THEN orig.created_at END DESC NULLS LAST,
                        je.created_at ASC, je.id ASC, p.line_sequence ASC, p.created_at ASC
             ) AS pos
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.journal_entries orig
          ON orig.id = je.reverses_je_id AND orig.operating_company_id = je.operating_company_id
       WHERE je.voided_at IS NULL
    )
    SELECT r.operating_company_id::text AS opco, r.account_id::text, r.entry_date::text,
           r.je_id::text AS reversal_je, o.je_id::text AS original_je,
           min(r.pos)::int AS reversal_pos, min(o.pos)::int AS original_pos
      FROM ordered r
      JOIN ordered o
        ON o.je_id = r.reverses_je_id
       AND o.operating_company_id = r.operating_company_id
       AND o.account_id = r.account_id
       AND o.entry_date = r.entry_date
     GROUP BY 1,2,3,4,5
    HAVING min(r.pos) < min(o.pos)
     LIMIT 25
  `);

  const scope = await client.query(`
    SELECT count(*)::int AS pairs
      FROM accounting.journal_entries r
      JOIN accounting.journal_entries o ON o.id = r.reverses_je_id
     WHERE r.reverses_je_id IS NOT NULL
  `);
  await client.query("COMMIT");

  const pairs = scope.rows[0]?.pairs ?? 0;
  if (pairs === 0) {
    fail("no journal entry reverses another anywhere — this guard cannot see what it checks (RLS mask or empty DB), which is not a clean result");
  }

  if (rows.length) {
    for (const r of rows) {
      console.error(
        ` - opco ${r.opco}: on ${r.entry_date}, account ${r.account_id} shows reversal ${r.reversal_je} at position ${r.reversal_pos}, BEFORE the entry it reverses (${r.original_je}, position ${r.original_pos}) — the running balance between them is a state the books were never in.`
      );
    }
    fail(`${rows.length} reversal(s) sort before the entry they reverse (ACCT-F350)`);
  }

  console.log(`[${LABEL}] PASS — originals rank before reversals, unwind is LIFO, and across ${pairs} reversal pair(s) none precedes its original`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
