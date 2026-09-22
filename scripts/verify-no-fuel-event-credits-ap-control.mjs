#!/usr/bin/env node
// R-30.1-A (2026-09-22) — "ap_control NEVER credits a fuel_event. Ever."
//
// Root cause (fixed same PR): resolveCompanyDirectCreditPreference() collapsed every card-settled
// fuel purchase into a blanket "ap" preference, which resolveCompanyDirectCreditAccount() resolved
// to the generic A/P control account (a control account backed by accounting.bills — fuel-card
// purchases carry no bill). 351 live fuel_event credits (76 Relay + 275 Dreamline) hit GL 2000,
// driving it to -108,938.77 against a $0.00 open bills subledger, while GL 2510 Dreamline Diesel
// Card Payable sat at 0 postings. Fixed: the credit now resolves PER RAIL from the fuel
// transaction's own fuel_card_id (Dreamline -> 2510, Relay -> 1295); a card-signaled row whose
// rail cannot be identified throws rather than falling back to ap_control.
//
// This guard asserts the invariant stays true: no LIVE (posted, non-voided) journal_entry_postings
// credit line whose posting_batch is source_transaction_type='fuel_event' may target the resolved
// A/P control account, for any USMCA-scoped operating company.
//
// ROUND 29.9-B (owner ruling, 2026-09-22, verify-no-silent-db-skip.mjs / scripts/lib/db-skip-
// baseline.json): "a live money guard that cannot connect is a FAIL, never a pass" — a silent
// exit-0 skip here is the exact anti-pattern that guard now hunts for, and this guard is
// unambiguously money (GL account routing) so it may not declare ALLOW_OFFLINE_SKIP. No
// DATABASE_URL -> FAIL, loud, not a silent pass.
//
// REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md, "your verify-static question is
// ruled"): the ROUND 29.9-B design above means this guard is ALWAYS a gated fail under
// verify-static.mjs's no-DB dead-port sentinel — that sweep is asking a question this guard
// cannot be asked, not finding a defect in it. Declaring this constant EXCLUDES it from that
// sweep entirely (mirrors ALLOW_OFFLINE_SKIP); it still runs for real, live, fail-closed under
// money-pr-local-gate.mjs with a real DATABASE_URL. Not an escape hatch — a declaration, and it
// touches no owner-protected baseline.
export const REQUIRES_LIVE_DB =
  "ROUND 29.9-B money guard — always fails without a live DB by design (fail-closed, never a " +
  "silent skip), which is incompatible with verify-static's no-DB dead-port sentinel.";

import pg from "pg";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-fuel-event-credits-ap-control";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SELF_PATH = fileURLToPath(import.meta.url);

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — no DATABASE_URL. A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (err) {
    // Bug found + fixed 2026-09-23 (docs/bus/INBOX-CC-1.md): connect() used to sit outside any
    // try/catch, so a PRESENT-but-UNREACHABLE DATABASE_URL (verify-static's dead-port sentinel, or
    // a genuinely down prod) threw an uncaught ECONNREFUSED instead of the same clean, recognized
    // failure shape as the "no DATABASE_URL" branch above. Both cases are "cannot connect" and
    // must look identical to anything parsing this guard's output.
    console.error(`${LABEL}: FAIL — cannot connect (${err.code || err.message}). A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    // Resolve the A/P control account the same two-tier way the real poster does: a designated
    // role binding first, then the AccountsPayable subtype fallback. Never hardcode the account_number
    // — a different opco's control account id must be caught too.
    const roleBound = await client.query(
      `
        SELECT account_id::text AS id
          FROM accounting.chart_of_accounts_roles
         WHERE operating_company_id = $1::uuid
           AND role = 'ap_control'
           AND is_active = true
         LIMIT 1
      `,
      [USMCA_COMPANY_ID]
    ).catch(() => ({ rows: [] }));
    const subtypeBound = await client.query(
      `
        SELECT id::text
          FROM catalogs.accounts
         WHERE operating_company_id = $1::uuid
           AND account_subtype = 'AccountsPayable'
           AND deactivated_at IS NULL
         ORDER BY updated_at DESC
      `,
      [USMCA_COMPANY_ID]
    );
    const apControlIds = new Set([
      ...roleBound.rows.map((r) => r.id),
      ...subtypeBound.rows.map((r) => r.id),
    ].filter(Boolean));

    if (apControlIds.size === 0) {
      console.log(`${LABEL}: SKIP — no A/P control account resolved for USMCA (nothing to guard against yet)`);
      await client.query("ROLLBACK");
      return;
    }

    // LIVE means "not superseded by a void". voidJournalEntry uses the Option-1 reversing-entry
    // model (journal-entries.service.ts): voiding a posted JE NEVER flips its own status away from
    // 'posted' -- it posts a separate, equal-and-opposite reversing JE and sets reversed_by_je_id
    // on the original. So `je.status = 'posted'` alone can never distinguish a still-live posting
    // from an already-voided one; `reversed_by_je_id IS NULL` is the correct liveness predicate.
    const { rows } = await client.query(
      `
        SELECT count(*)::int AS n, COALESCE(sum(jep.amount_cents), 0)::numeric / 100 AS total
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          JOIN accounting.posting_batches pb ON pb.id = jep.posting_batch_id
         WHERE je.operating_company_id = $1::uuid
           AND je.status = 'posted'
           AND je.reversed_by_je_id IS NULL
           AND jep.debit_or_credit = 'credit'
           AND jep.account_id = ANY($2::uuid[])
           AND pb.source_transaction_type = 'fuel_event'
      `,
      [USMCA_COMPANY_ID, Array.from(apControlIds)]
    );
    await client.query("ROLLBACK");

    const n = rows[0]?.n ?? 0;
    const total = Number(rows[0]?.total ?? 0);
    if (n > 0) {
      console.error(`${LABEL}: FAIL — ${n} live fuel_event credit posting(s) on ap_control, total $${total.toFixed(2)}. ap_control must NEVER credit a fuel_event.`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: PASS — 0 live fuel_event credits on ap_control (USMCA)`);
  } finally {
    await client.end().catch(() => {});
  }
}

// --selftest: proves the crash fix without needing a live DB — spawns this same file as a child
// process under two controlled environments and asserts BOTH produce the same clean, recognized
// "FAIL — cannot connect"-shaped output at exit 1, never a raw Node uncaught-exception stack trace.
function selftest() {
  const run = (env) =>
    spawnSync(process.execPath, [SELF_PATH], { env, encoding: "utf8", timeout: 10000 });

  const noUrlEnv = { ...process.env };
  delete noUrlEnv.DATABASE_URL;
  const r1 = run(noUrlEnv);

  const deadPortEnv = { ...process.env, DATABASE_URL: "postgresql://u:p@127.0.0.1:1/deadport" };
  const r2 = run(deadPortEnv);

  const looksLikeUncaughtCrash = (s) =>
    /triggerUncaughtException|internal\/modules\/run_main|Node\.js v\d/.test(s || "");

  const checks = [
    ["no DATABASE_URL -> exit 1", r1.status === 1],
    ["no DATABASE_URL -> clean recognized FAIL message", /FAIL — no DATABASE_URL/.test(r1.stderr || "")],
    ["no DATABASE_URL -> not an uncaught-crash stack trace", !looksLikeUncaughtCrash(r1.stderr)],
    ["unreachable DATABASE_URL -> exit 1", r2.status === 1],
    ["unreachable DATABASE_URL -> clean recognized FAIL message", /FAIL — cannot connect/.test(r2.stderr || "")],
    ["unreachable DATABASE_URL -> not an uncaught-crash stack trace (the bug this selftest guards against)", !looksLikeUncaughtCrash(r2.stderr)],
    ["both failure shapes share the same recognized FAIL prefix", /FAIL —/.test(r1.stderr || "") && /FAIL —/.test(r2.stderr || "")],
  ];

  let bad = 0;
  for (const [name, ok] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  }
  if (bad) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
