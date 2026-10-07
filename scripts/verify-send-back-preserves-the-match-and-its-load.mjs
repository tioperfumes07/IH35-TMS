#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
/**
 * ROUND 363-CC3-B / LAW 363.9 — FAILS IF a bank-line send-back can overwrite its match. A send-back (unmatch, the
 * bank-line state machine's undo, a document void, a transfer revoke, the governed purge reset) KEEPS the accepted
 * match and records the release beside it: banking.release_bank_line_matches() runs before any matched_* pointer is
 * cleared, and the deferred trigger trg_send_back_keeps_the_match refuses a commit that clears one with no released
 * reconciliation_matches row (migration 202615330930).
 *   static — every send-back path calls the release before its clear; nothing flips an accepted row to 'rejected' in
 *            place; the migration still declares the refusal, the release function and the partial uniqueness.
 *   live   — UNSCOPED: the trigger is enabled, the functions exist; 0 bank lines in a matched state with nothing matched
 *            across all 13 matched_* columns; every released row is complete (who/when/why/how/from); 0 accepted match
 *            rows whose live bank line no longer carries the pointer (a release that was not recorded).
 * No allow-list. No database = FAIL. Run: node scripts/verify-send-back-preserves-the-match-and-its-load.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-send-back-preserves-the-match-and-its-load";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const MIGRATION = "db/migrations/202615330930_send_back_keeps_the_match.sql";

/** Each send-back path: the file, the release call that must appear, and the clear it must come before. */
export const PATHS = [
  { file: "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts", release: /await releaseBankLineMatches\(client,/, clear: /matched_expense_id = NULL,/ },
  { file: "apps/backend/src/banking/bank-line-state-machine.service.ts", release: /await releaseBankLineMatches\(client, \{\s*bankTransactionId: line\.id,/, clear: /if \(line\.review_bucket === "excluded"\)/ },
  { file: "apps/backend/src/banking/bank-line-state-machine.service.ts", release: /await releaseBankLineMatches\(client, \{\s*bankTransactionId: f\.line_id,/, clear: /SET \$\{RELEASE_CATEGORIZATION_SET_SQL\}\s*WHERE id = \$1::uuid AND operating_company_id = \$2::uuid`,\s*\[f\.line_id/ },
  { file: "apps/backend/src/accounting/void.service.ts", release: /await releaseBankLineMatchesWhere\(client, `operating_company_id = \$1::uuid AND id = \$2::uuid`/, clear: /\$\{BANK_TX_UNMATCH_RESET_SQL\} AND id = \$2::uuid/ },
  { file: "apps/backend/src/accounting/void.service.ts", release: /await releaseBankLineMatchesWhere\(\s*client,\s*`operating_company_id = \$1::uuid AND \(linked_entity_id/, clear: /\$\{BANK_TX_UNMATCH_RESET_SQL\}\s*AND \(linked_entity_id/ },
  { file: "apps/backend/src/banking/transfers.service.ts", release: /await releaseBankLineMatchesWhere\(client, `operating_company_id = \$1::uuid AND matched_transfer_id = \$2::uuid`/, clear: /SET \$\{RELEASE_TRANSFER_LINK_SET_SQL\}\s*WHERE operating_company_id = \$1::uuid\s*AND matched_transfer_id = \$2::uuid/ },
  { file: "scripts/ops/2026-10-02-cc1-r326-complete-delete.ts", release: /banking\.release_bank_line_matches\(id, 'purge_reset'/, clear: /SET \$\{matchedCols\.map/ },
];

export function pathGaps(read = (f) => readFileSync(f, "utf8")) {
  const f = [];
  for (const p of PATHS) {
    const src = read(p.file);
    const r = p.release.exec(src);
    const c = p.clear.exec(src);
    if (!c) { f.push(`${p.file}: send-back clear not found (${p.clear.source.slice(0, 60)}) — guard out of sync, re-read the path`); continue; }
    if (!r) f.push(`${p.file}: clears a bank line's matches with no release recorded first (LAW 363.9)`);
    else if (r.index > c.index) f.push(`${p.file}: records the release AFTER clearing the pointers — the trail would be empty`);
  }
  for (const file of ["apps/backend/src/accounting/bank-recon/recon-worklist.service.ts", "apps/backend/src/accounting/void.service.ts"]) {
    if (/SET\s+match_state = 'rejected',\s*voided_at = now\(\)/.test(read(file)) || /recordVoidedMatches\(/.test(read(file)))
      f.push(`${file}: flips an accepted match to 'rejected' in place — a send-back records 'released' beside it instead`);
  }
  return f;
}

export function migrationGaps(sql) {
  const f = [];
  if (!/CREATE CONSTRAINT TRIGGER trg_send_back_keeps_the_match\s+AFTER UPDATE ON banking\.bank_transactions\s+DEFERRABLE INITIALLY DEFERRED/.test(sql)) f.push("the deferred refusal trigger is gone");
  if (!/CREATE OR REPLACE FUNCTION banking\.release_bank_line_matches\(/.test(sql)) f.push("the release function is gone");
  if (!/ON banking\.reconciliation_matches \(bank_transaction_id, ledger_entry_kind, ledger_entry_id\)\s+WHERE match_state <> 'released'/.test(sql)) f.push("uniqueness is no longer limited to unreleased rows (a re-match would overwrite the release)");
  return f;
}

/** facts: { trigger, fn, matchedNothing, incompleteReleases, orphanAccepted } */
export function liveGaps(x) {
  const f = [];
  if (!x.trigger) f.push("trg_send_back_keeps_the_match is missing or disabled on banking.bank_transactions");
  if (!x.fn) f.push("banking.release_bank_line_matches() is missing");
  if (x.matchedNothing > 0) f.push(`${x.matchedNothing} bank line(s) read matched with nothing matched across all 13 matched_* columns`);
  if (x.incompleteReleases > 0) f.push(`${x.incompleteReleases} released match row(s) missing who/when/why/how/from`);
  if (x.orphanAccepted > 0) f.push(`${x.orphanAccepted} accepted match row(s) whose live bank line no longer carries the pointer — a release nobody recorded`);
  return f;
}

const sql = readFileSync(MIGRATION, "utf8");
if (process.argv.includes("--selftest")) {
  const clean = { trigger: true, fn: true, matchedNothing: 0, incompleteReleases: 0, orphanAccepted: 0 };
  const real = (f) => readFileSync(f, "utf8");
  const cases = [
    ["paths real", pathGaps().length === 0],
    ["release removed from unmatch", pathGaps((f) => real(f).replace(/await releaseBankLineMatches\(client,/, "await nothing(client,")).length >= 1],
    ["release moved after the clear", pathGaps((f) => f.endsWith("transfers.service.ts") ? real(f).replace(/  await releaseBankLineMatchesWhere\([\s\S]*?\}\);\n/, "") : real(f)).length === 1],
    ["rejected flip planted", pathGaps((f) => f.endsWith("void.service.ts") ? real(f) + "\n// x\nconst q = `SET match_state = 'rejected',\n voided_at = now()`;" : real(f)).length === 1],
    ["migration real", migrationGaps(sql).length === 0],
    ["trigger dropped", migrationGaps(sql.replace("CREATE CONSTRAINT TRIGGER trg_send_back_keeps_the_match", "-- dropped")).length === 1],
    ["live clean", liveGaps(clean).length === 0],
    ["live matched-nothing", liveGaps({ ...clean, matchedNothing: 1 }).length === 1],
    ["live orphan accepted", liveGaps({ ...clean, orphanAccepted: 2 }).length === 1],
    ["live trigger off", liveGaps({ ...clean, trigger: false }).length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = [...pathGaps(), ...migrationGaps(sql)];
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
const PTRS = ["load", "bill", "settlement", "expense", "transfer", "payment", "bill_payment", "journal_entry", "factoring_advance", "invoice", "fuel_transaction", "relay_fuel_transaction", "advance"]
  .map((k) => `bt.matched_${k}_id IS NOT NULL`).join(" OR ");
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL ROLE NONE");
  await c.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION.split("/").pop()])).rowCount > 0;
  const facts = (await c.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'banking.bank_transactions'::regclass AND tgname = 'trg_send_back_keeps_the_match' AND tgenabled <> 'D') AS trigger,
      to_regprocedure('banking.release_bank_line_matches(uuid,text,text,uuid)') IS NOT NULL AS fn,
      (SELECT count(*) FROM banking.bank_transactions bt
        WHERE bt.voided_at IS NULL AND (bt.review_state = 'matched' OR bt.resolution_kind = 'matched') AND NOT (${PTRS}))::int AS "matchedNothing"`)).rows[0];
  let incompleteReleases = 0, orphanAccepted = 0;
  if (facts.fn) {
    incompleteReleases = (await c.query(`
      SELECT count(*)::int AS n FROM banking.reconciliation_matches
       WHERE match_state = 'released' AND (released_at IS NULL OR release_kind IS NULL OR btrim(coalesce(release_reason, '')) = '' OR released_from_state IS NULL)`)).rows[0].n;
    orphanAccepted = (await c.query(`
      SELECT count(*)::int AS n
        FROM banking.reconciliation_matches m
        JOIN banking.bank_transactions bt ON bt.id = m.bank_transaction_id AND bt.voided_at IS NULL
       WHERE m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched')
         AND NOT EXISTS (SELECT 1 FROM banking.bank_line_match_pointers(to_jsonb(bt)) p
                          WHERE p.kind = m.ledger_entry_kind AND p.ledger_entry_id = m.ledger_entry_id)`)).rows[0].n;
  }
  const live = liveGaps({ ...facts, incompleteReleases, orphanAccepted });
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — ${MIGRATION.split("/").pop()} not in the ledger; live check reported, not enforced`);
    console.log(`${LABEL}: today — matched with nothing matched ${facts.matchedNothing}; ${live.length} live gap(s)`);
  } else {
    fails.push(...live);
    console.log(`${LABEL}: live, unscoped — matched-with-nothing ${facts.matchedNothing}, incomplete releases ${incompleteReleases}, orphan accepted ${orphanAccepted}`);
  }
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS`);
