#!/usr/bin/env node
/**
 * GUARD (CONN-3 Part B): the Relay internal-bank SEED migration is master-data ONLY — it must never post
 * to the GL, never flip a posting flag, and must write ONLY canonical tables.
 *
 * Locks (2026-07-12, owner directive — financial cluster §1.4, HOLD-FOR-JORGE):
 *  - `202607290000_relay_internal_bank_seed.sql` never sets `posted_to_gl = true`.
 *  - It calls NO posting primitive and writes NO GL/JE/ledger table (accounting.journal*, accounting.postings,
 *    accounting.gl*, etc.) — seeding catalogs.accounts + catalogs.items only.
 *  - It enables NO flag (no `..._ENABLED ... true`).
 *  - It writes ONLY canonical tables (catalogs.accounts / catalogs.items) and reads org.companies —
 *    NEVER a RETIRE table (accounting.qbo_*, bank.*, settlement.*, payroll.*, maint.*).
 *  - It still carries the `DO NOT RUN ON PROD` held marker (defense-in-depth vs hold-migrations-registered).
 *
 * Comments are STRIPPED before matching so descriptive `-- ...` header prose is not a false positive.
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const MIGRATION = path.join(root, "db/migrations/202607290000_relay_internal_bank_seed.sql");

// Blank comment CONTENT (keep newlines for line-accurate reasoning) so header prose never false-positives.
function stripSqlComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);
}

// RETIRE tables (FINAL-TABLES-WIRING §A / LINKAGE-LAW) — never a NEW write/FK.
const RETIRE_RE =
  /(INSERT\s+INTO|UPDATE|REFERENCES)\s+(?:ONLY\s+)?(accounting\.qbo_\w+|bank\.\w+|settlement\.\w+|payroll\.\w+|maint\.\w+)/i;
// GL/posting/ledger write surface — this master-data seed must touch NONE of it.
const GL_WRITE_RE =
  /(INSERT\s+INTO|UPDATE)\s+(?:ONLY\s+)?accounting\.(journal\w*|postings?|gl\w*|ledger\w*|source_transactions?)/i;
// A write target that is NOT one of the two allowed canonical master-data tables.
const WRITE_TARGET_RE = /INSERT\s+INTO\s+(?:ONLY\s+)?([a-z_]+\.[a-z_]+)/gi;
const ALLOWED_WRITE = new Set(["catalogs.accounts", "catalogs.items"]);

function assertAll(rawSrc) {
  const errors = [];
  const src = stripSqlComments(rawSrc);

  if (/posted_to_gl\s*(=|:)\s*true/i.test(src)) {
    errors.push("sets posted_to_gl = true — the seed must never post");
  }
  if (GL_WRITE_RE.test(src)) {
    errors.push("writes a GL/JE/ledger table — the seed is master-data only, it must not post");
  }
  if (/\b[A-Z0-9_]*_ENABLED\b[\s\S]{0,40}?\btrue\b/i.test(src)) {
    errors.push("enables a flag (…_ENABLED … true) — flags stay OFF on this held path");
  }
  const retire = RETIRE_RE.exec(src);
  if (retire) errors.push(`writes/FKs a RETIRE table (${retire[2]}) — use the canonical table`);

  let m;
  WRITE_TARGET_RE.lastIndex = 0;
  while ((m = WRITE_TARGET_RE.exec(src)) !== null) {
    const target = m[1].toLowerCase();
    if (!ALLOWED_WRITE.has(target)) {
      errors.push(`writes a non-canonical/unexpected table (${target}) — allowed: catalogs.accounts, catalogs.items`);
    }
  }
  // Held marker still present (raw source — the marker lives in a comment).
  if (!/DO NOT RUN ON PROD|never run on prod|runs? on a neon branch/i.test(rawSrc)) {
    errors.push("lost its DO-NOT-RUN held marker — restore it or it fires on prod");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `-- DO NOT RUN ON PROD\nBEGIN;\nINSERT INTO catalogs.accounts (account_number) SELECT '1295';\nINSERT INTO catalogs.items (item_code) SELECT 'RELAY-DIESEL';\nCOMMIT;`;
  const badPost = `-- DO NOT RUN ON PROD\nINSERT INTO accounting.journal_entries (id) VALUES (1);\nUPDATE x SET posted_to_gl = true;`;
  const badRetire = `-- DO NOT RUN ON PROD\nINSERT INTO payroll.driver_settlements (id) VALUES (1);`;
  const badFlag = `-- DO NOT RUN ON PROD\nUPDATE catalogs.accounts SET x=1;\nINSERT INTO catalogs.items SELECT 1 WHERE RELAY_FUEL_GL_POSTING_ENABLED = true;`;
  const badMarker = `BEGIN;\nINSERT INTO catalogs.accounts (account_number) SELECT '1295';\nCOMMIT;`;
  if (assertAll(good).length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", assertAll(good)); process.exit(1); }
  for (const [name, fx, min] of [["post", badPost, 2], ["retire", badRetire, 1], ["flag", badFlag, 1], ["marker", badMarker, 1]]) {
    if (assertAll(fx).length < min) { console.error(`SELFTEST FAIL: bad-${name} fixture not caught`, assertAll(fx)); process.exit(1); }
  }
  console.log("verify-relay-internal-bank-no-post selftest OK");
  process.exit(0);
}

if (!fs.existsSync(MIGRATION)) { console.error(`GUARD FAIL: missing migration ${MIGRATION}`); process.exit(1); }
const errors = assertAll(fs.readFileSync(MIGRATION, "utf8"));
if (errors.length) {
  console.error("GUARD FAIL — CONN-3 Relay internal-bank seed must be master-data-only, no posting, canonical tables:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-relay-internal-bank-no-post OK — no GL posting, flags OFF, canonical tables only, held marker intact");
