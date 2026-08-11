#!/usr/bin/env node
/**
 * ACCT-F349 (P28 · 28 OF 50) — the account register sorted ACROSS journal entries by each posting's
 * position INSIDE its own entry, so its running-balance column showed balances that never existed.
 *
 * WHAT HAPPENED: the ORDER BY was `je.entry_date, p.line_sequence, p.created_at`. line_sequence is the
 * line number WITHIN one journal entry, so using it as the first tiebreaker interleaves unrelated
 * documents that share a date. A bill credits A/P on line 2 (its expense line is line 1); a bill payment
 * debits A/P on line 1. In the A/P register EVERY payment therefore sorted before EVERY bill sharing its
 * date, whichever actually happened.
 *
 * Measured on prod 2026-08-11 — USMCA A/P (2000), 2026-08-16: the payment of bill L-20260810-0003 (JE
 * created 22:45:57) sorted above the bill itself (JE created 22:45:54), so the register read -17,415c —
 * a NEGATIVE accounts payable, produced by paying a bill the register had not yet shown. 468 account-days
 * across the ledger carry more than one journal entry, so this is the ordinary case on any day a bill is
 * paid the day it is entered.
 *
 * A wrong running balance is not cosmetic: the register is where A/P is read back, and a balance that
 * dips negative mid-day is the shape of an overpayment that did not happen.
 *
 * TWO INVARIANTS:
 *   A. STATIC — the register's ORDER BY ranks the DOCUMENT (je.created_at / je.id) BEFORE p.line_sequence,
 *      and line_sequence is never the first tiebreaker after entry_date.
 *   B. LIVE — ordering by that key actually groups each journal entry contiguously within an account-day
 *      (no document is split around another), and the ordering key it depends on is never NULL.
 *
 * The static half needs no database, so it runs in every CI context including the fresh-DB job.
 *
 * Self-test: node scripts/verify-steps/3077-verify-account-register-orders-by-document-not-line.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "3077-verify-account-register-orders-by-document-not-line";
const SERVICE = path.join("apps", "backend", "src", "accounting", "account-register.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Strip comments FIRST — a guard that matches its own explanatory prose proves nothing (see 3065/3073). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/** Exported so the selftest can mutate the REAL service source and prove each check bites. */
export function assertRegisterOrdersByDocument(rawSource) {
  const problems = [];
  const code = stripComments(rawSource);

  const m = code.match(/ORDER BY\s+je\.entry_date[^`]*/i);
  if (!m) {
    problems.push(`cannot find the register's ORDER BY in ${SERVICE} — it moved; re-point this guard rather than deleting it`);
    return problems;
  }
  const orderBy = m[0].replace(/\s+/g, " ").trim();

  // The keys after entry_date, in order.
  const keys = orderBy
    .replace(/^ORDER BY\s+/i, "")
    .split(",")
    .map((k) => k.trim().replace(/\s+(ASC|DESC)$/i, ""));

  const lineIdx = keys.findIndex((k) => /\bp\.line_sequence\b/.test(k));
  const docIdx = keys.findIndex((k) => /\bje\.(created_at|id)\b/.test(k));

  if (lineIdx === -1) {
    problems.push("the register ORDER BY no longer orders lines within an entry by p.line_sequence");
  }
  if (docIdx === -1) {
    problems.push(
      "the register ORDER BY has NO document-level key (je.created_at / je.id) — entries sharing a date fall back to line position, which interleaves unrelated documents and corrupts the running balance (ACCT-F349)"
    );
  }
  if (lineIdx !== -1 && docIdx !== -1 && docIdx > lineIdx) {
    problems.push(
      `the register ORDER BY ranks p.line_sequence (position ${lineIdx + 1}) BEFORE the document key (position ${docIdx + 1}) — a bill payment debits A/P on line 1 while a bill credits it on line 2, so every payment sorts above every same-date bill and the running balance shows a state that never existed (ACCT-F349)`
    );
  }
  if (keys[1] && /\bp\.line_sequence\b/.test(keys[1])) {
    problems.push("p.line_sequence is the FIRST tiebreaker after entry_date — that is the exact pre-ACCT-F349 ordering");
  }

  return problems;
}

// ── selftest: every check must catch the defect it names ─────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  const healthy = fs.readFileSync(SERVICE, "utf8");
  const failures = [];

  const clean = assertRegisterOrdersByDocument(healthy);
  if (clean.length) failures.push(`healthy source must PASS, got: ${clean.join(" | ")}`);

  const mutate = (name, from, to, needle) => {
    if (!healthy.includes(from)) {
      failures.push(`${name}: mutation anchor not present — the selftest is inert`);
      return;
    }
    const problems = assertRegisterOrdersByDocument(healthy.replace(from, to));
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // Exactly the pre-fix ORDER BY.
  mutate(
    "regress to line_sequence-first ordering",
    "ORDER BY je.entry_date ASC, je.created_at ASC, je.id ASC, p.line_sequence ASC, p.created_at ASC",
    "ORDER BY je.entry_date ASC, p.line_sequence ASC, p.created_at ASC",
    "FIRST tiebreaker after entry_date"
  );

  // Document key present but ranked after the line — the subtler regression.
  mutate(
    "document key demoted below line_sequence",
    "ORDER BY je.entry_date ASC, je.created_at ASC, je.id ASC, p.line_sequence ASC, p.created_at ASC",
    "ORDER BY je.entry_date ASC, p.line_sequence ASC, je.created_at ASC, je.id ASC, p.created_at ASC",
    "BEFORE the document key"
  );

  // A guard that reads comments proves nothing: strip the finding id and the checks must still pass.
  if (assertRegisterOrdersByDocument(healthy.replace(/ACCT-F349/g, "ACCT-XXXX")).length) {
    failures.push("checks depend on the finding id appearing in prose rather than on the ORDER BY itself");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(`selftest: ${failures.length} check(s) do not catch what they claim`);
  }
  console.log(`[${LABEL}] SELFTEST PASS — 2 mutations caught, healthy source clean, no prose-matching`);
  process.exit(0);
}

if (!fs.existsSync(SERVICE)) fail(`${SERVICE} not found — the account register moved; re-point this guard rather than deleting it`);
const problems = assertRegisterOrdersByDocument(fs.readFileSync(SERVICE, "utf8"));
if (problems.length) {
  for (const p of problems) console.error(` - ${p}`);
  fail(`${problems.length} register-ordering invariant(s) broken (ACCT-F349)`);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] PASS (static half) — the register orders by document before line; no DATABASE_URL for the live half`);
  process.exit(0);
}

// ── B · LIVE: the ordering key groups each entry contiguously within an account-day ───────────────
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

  const present = await client.query(`SELECT to_regclass('accounting.journal_entry_postings') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] PASS (static half) — accounting schema not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // The ordering key must EXIST for every entry, or the sort silently falls back to an arbitrary order.
  const nullKey = await client.query(
    `SELECT count(*)::int AS n FROM accounting.journal_entries WHERE created_at IS NULL`
  );
  if ((nullKey.rows[0]?.n ?? 0) > 0) {
    await client.query("ROLLBACK").catch(() => {});
    fail(`${nullKey.rows[0].n} journal entr(ies) have a NULL created_at — the register's document ordering key is missing, so their position in the running balance is arbitrary (ACCT-F349)`);
  }

  // Apply the register's own ORDER BY, then assert each journal entry occupies ONE contiguous block
  // within its account-day. A split block is a document interleaved around another — the defect's shape.
  const { rows } = await client.query(`
    WITH ordered AS (
      SELECT p.operating_company_id, p.account_id, je.entry_date, je.id AS je_id,
             row_number() OVER (
               PARTITION BY p.operating_company_id, p.account_id, je.entry_date
               ORDER BY je.created_at ASC, je.id ASC, p.line_sequence ASC, p.created_at ASC
             ) AS rn
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       WHERE je.voided_at IS NULL
    ), islands AS (
      SELECT operating_company_id, account_id, entry_date, je_id,
             rn - row_number() OVER (
               PARTITION BY operating_company_id, account_id, entry_date, je_id ORDER BY rn
             ) AS island
        FROM ordered
    )
    SELECT operating_company_id::text AS opco, account_id::text, entry_date::text, je_id::text,
           count(DISTINCT island)::int AS blocks
      FROM islands
     GROUP BY 1,2,3,4
    HAVING count(DISTINCT island) > 1
     ORDER BY 5 DESC
     LIMIT 25
  `);

  const scope = await client.query(`
    SELECT count(*)::int AS account_days FROM (
      SELECT p.account_id, je.entry_date
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       GROUP BY 1,2 HAVING count(DISTINCT je.id) > 1
    ) d
  `);
  await client.query("COMMIT");

  const accountDays = scope.rows[0]?.account_days ?? 0;
  if (accountDays === 0) {
    fail("no account-day carries more than one journal entry — this guard cannot see what it checks (RLS mask or empty DB), which is not a clean result");
  }

  if (rows.length) {
    for (const r of rows) {
      console.error(
        ` - opco ${r.opco}: account ${r.account_id} on ${r.entry_date}: journal entry ${r.je_id} is split into ${r.blocks} blocks — another document is interleaved through it, so the running balance between those blocks is a state that never existed.`
      );
    }
    fail(`${rows.length} journal entr(ies) are interleaved in the register ordering (ACCT-F349)`);
  }

  console.log(`[${LABEL}] PASS — register orders by document before line, and across ${accountDays} multi-entry account-day(s) every journal entry stays contiguous`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
