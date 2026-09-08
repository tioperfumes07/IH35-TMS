#!/usr/bin/env node
/**
 * USMCA SETTLEMENT REBUILD — PHASE 1 (REVERSAL) ORCHESTRATION.
 *
 * Owner directive 2026-09-08 ("GO, build the mechanics") + Claude checker note: build the reversal
 * loop for the mis-grouped live driver settlements + explicitly fold the ONE standalone manual
 * correction JE (15e0887f), with the driver/settlement scope as a PASSED-IN PARAMETER — never
 * hardcoded to a doc window. This is Phase 1 (tear the mis-grouped 17 down cleanly). Phase 2 (post
 * 28 one-per-tour settlements from the signed-doc CSVs, stamp source_document_ref) is a SEPARATE,
 * still-gated step and is NOT in this file.
 *
 * NO NEW GL MATH. Every ledger movement is delegated to reviewed primitives:
 *   - reverseSettlementPayRunInClientTx  (the merged, rehearsal-proven pay-run reversal engine)
 *   - reverseJournalEntryNoFlip          (the one linked-reversal primitive, for the standalone JE)
 * The orchestration layer only does what the live /settlements/:id/reverse route already does around
 * that engine (settlements.routes.ts): void the settlement_lines (is_active=false + void register),
 * flip the header to 'cancelled' with reversed_at/by/reason, and unmatch any bank txn. Mirrored
 * EXACTLY — not reinvented.
 *
 * SAFETY: PREVIEW by default — opens ONE transaction, runs the whole orchestration, then ROLLS BACK
 * and prints the tie-out. Prod is NEVER written unless BOTH `--commit` AND env
 * `REBUILD_I_UNDERSTAND=yes` are set. Intended to be rehearsed against an ISOLATED Neon branch first
 * (same discipline that cleared Gate #2). Nothing posts to prod without Claude's GO + the owner's yes.
 *
 * Usage:
 *   REBUILD_DB_URL="postgres://…branch…" npx tsx scripts/rebuild-usmca-settlements-orchestration.mts
 *   REBUILD_DB_URL=… npx tsx …orchestration.mts --settlements=<uuid>,<uuid>
 *   REBUILD_DB_URL=… REBUILD_I_UNDERSTAND=yes npx tsx …orchestration.mts --commit   (branch only)
 */
import pg from "pg";
import { reverseSettlementPayRunInClientTx } from "../src/driver-finance/settlement-payrun-reverse.service.js";
import { reverseJournalEntryNoFlip } from "../src/accounting/journal-entries.service.js";

// ── HARD PROD BLOCK (code-level, not a comment/eyeball step). ──────────────────────────────────────
// Checker finding (Claude Lead, 2026-09-08): the old design relied on a human reading a printed host
// string before Ctrl-C'ing (the repo-wide guard-expense-gl-branch.sh pattern) — a single copy-paste of
// the real prod REBUILD_DB_URL plus --commit + REBUILD_I_UNDERSTAND=yes would silently post to prod
// with nothing in code to stop it. Fixed here with an unconditional string match against the ACTUAL
// prod Neon endpoint (project tiny-field-89581227, branch br-fancy-credit-akjnd07a — confirmed live via
// Neon list_branch_computes 2026-09-08), checked before anything else runs, with NO override flag.
const PROD_ENDPOINT_MARKERS = [
  "ep-broad-block-akykk7bw", // prod compute endpoint id (host + pooled host both contain this)
  "tiny-field-89581227", // prod Neon project id, in case a project-qualified host/string is ever used
];
function assertNotProd(dbUrl: string): void {
  const lowered = dbUrl.toLowerCase();
  const hit = PROD_ENDPOINT_MARKERS.find((m) => lowered.includes(m.toLowerCase()));
  if (hit) {
    throw new Error(
      `REFUSING TO RUN: REBUILD_DB_URL resolves to the PROD Neon endpoint (matched "${hit}"). ` +
        `This script only ever runs against an isolated rehearsal branch. There is no override flag for ` +
        `this check — point REBUILD_DB_URL at a branch, never prod, regardless of --commit or ` +
        `REBUILD_I_UNDERSTAND.`
    );
  }
}

// ── Fixed data (identities, not scope). Scope is the --settlements parameter / discovery query. ──────
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // system actor used by the rehearsal harness
// The ONE standalone manual correction JE CC-2 confirmed at the line level (docs/bus/OUTBOX-CC-2.md):
// it corrects S-13643's pay-run JE 13ffbcff for load 13541 / tour 5796 (−$389.66) and is NOT linked
// to payrun_gl_runs, so reversing S-13643's pay-run alone would leave this correction dangling. Fold
// it (reverse it) alongside so tour 5796 is neither double- nor under-corrected on the Phase-2 repost.
const MANUAL_CORRECTION_JE_ID = "15e0887f-d94e-42a2-a248-1a14f951cde3";
const REASON = "USMCA settlement rebuild — reverse mis-grouped per-driver settlement to repost one-per-tour (owner 2026-09-08)";

type Argv = { commit: boolean; settlements: string[] | null };
function parseArgv(): Argv {
  let commit = false;
  let settlements: string[] | null = null;
  for (const a of process.argv.slice(2)) {
    if (a === "--commit") commit = true;
    else if (a.startsWith("--settlements=")) {
      settlements = a
        .slice("--settlements=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return { commit, settlements };
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function discoverScope(client: pg.PoolClient): Promise<string[]> {
  const res = await client.query<{ settlement_id: string }>(
    `SELECT settlement_id::text
       FROM driver_finance.payrun_gl_runs
      WHERE operating_company_id = $1::uuid AND status = 'posted'
      ORDER BY settlement_id`,
    [OPCO]
  );
  return res.rows.map((r) => r.settlement_id);
}

type Row = {
  settlement_id: string;
  display_id: string | null;
  result: string;
  reversal_je: string | null;
  advances_restored: number;
  escrow_reversed_cents: number;
  lines_voided: number;
  bank_unmatched: boolean;
};

async function main() {
  const { commit, settlements: scopeOverride } = parseArgv();
  const url = process.env.REBUILD_DB_URL || process.env.REHEARSAL_DB_URL;
  if (!url) throw new Error("REBUILD_DB_URL (or REHEARSAL_DB_URL) required — point it at an ISOLATED Neon branch");
  assertNotProd(url); // hard, unconditional — runs before any connection is opened, no override
  const commitConfirmed = commit && process.env.REBUILD_I_UNDERSTAND === "yes";
  if (commit && !commitConfirmed) {
    throw new Error("--commit requires env REBUILD_I_UNDERSTAND=yes (and must target a branch, never prod, without owner+Claude GO)");
  }

  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const businessDate = currentBusinessDate();
  const reversedJeIds: string[] = [];
  const rows: Row[] = [];
  let manualFold: { reversed: boolean; reversal_je: string | null } = { reversed: false, reversal_je: null };

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    const scope = scopeOverride ?? (await discoverScope(client as unknown as pg.PoolClient));
    console.log(`\n=== USMCA SETTLEMENT REBUILD — PHASE 1 (REVERSAL) ===`);
    console.log(`mode: ${commitConfirmed ? "COMMIT (will persist)" : "PREVIEW (rollback)"}  |  scope: ${scope.length} settlement(s)\n`);

    // ── PHASE A — reverse each in-scope mis-grouped settlement, mirroring the live reverse route. ──────
    for (const settlementId of scope) {
      const engine = await reverseSettlementPayRunInClientTx(
        client as never,
        { operatingCompanyId: OPCO, settlementId, reason: REASON },
        { userId: ACTOR },
        businessDate
      );
      if (engine.reversal_journal_entry_id) reversedJeIds.push(engine.reversal_journal_entry_id);

      // Void the settlement's line items (void-never-delete: is_active=false + void register), exactly
      // as settlements.routes.ts does after its reversal engine call.
      const voided = await client.query(
        `UPDATE driver_finance.settlement_lines
            SET is_active = false,
                voided_at = COALESCE(voided_at, now()),
                void_reason = COALESCE(void_reason, $3),
                voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid),
                updated_at = now()
          WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid
            AND (is_active IS DISTINCT FROM false OR voided_at IS NULL)`,
        [settlementId, OPCO, REASON, ACTOR]
      );

      // Flip the header to 'cancelled' with the reversal register (idempotent guard: status <> cancelled).
      await client.query(
        `UPDATE driver_finance.driver_settlements
            SET status = 'cancelled', reversed_at = now(), reversed_by_user_id = $3::uuid,
                reversal_reason = $4, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'cancelled'`,
        [settlementId, OPCO, ACTOR, REASON]
      );

      // Unmatch the settlement's own bank txn pointer if any (records-only USMCA settlements usually
      // have none; guarded so it is a no-op when null). Reset inline to keep the script self-contained.
      const cur = await client.query<{ paid_via_bank_txn_id: string | null; display_id: string | null }>(
        `SELECT paid_via_bank_txn_id::text, display_id FROM driver_finance.driver_settlements
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [settlementId, OPCO]
      );
      let bankUnmatched = false;
      const paidTxn = cur.rows[0]?.paid_via_bank_txn_id ?? null;
      if (paidTxn) {
        await client.query(
          `UPDATE driver_finance.driver_settlements SET paid_via_bank_txn_id = NULL WHERE id = $1::uuid`,
          [settlementId]
        );
        bankUnmatched = true;
      }

      rows.push({
        settlement_id: settlementId,
        display_id: cur.rows[0]?.display_id ?? null,
        result: engine.result,
        reversal_je: engine.reversal_journal_entry_id,
        advances_restored: engine.advances_restored,
        escrow_reversed_cents: engine.escrow_reversed_cents,
        lines_voided: voided.rowCount ?? 0,
        bank_unmatched: bankUnmatched,
      });
    }

    // ── PHASE B — explicitly fold (reverse) the ONE standalone manual correction JE. ──────────────────
    const manualExists = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [MANUAL_CORRECTION_JE_ID, OPCO]
    );
    if (manualExists.rows[0]) {
      const jeRev = await reverseJournalEntryNoFlip(client as never, {
        operatingCompanyId: OPCO,
        journalEntryId: MANUAL_CORRECTION_JE_ID,
        reason: `${REASON} — fold standalone correction JE (CC-2 confirmed, tour 5796 / load 13541)`,
        actorUserId: ACTOR,
        currentBusinessDate: businessDate,
      });
      const revId = jeRev.reversal?.reversal_journal_entry_id ?? null;
      if (!revId) throw new Error(`manual correction JE ${MANUAL_CORRECTION_JE_ID} produced no reversing entry`);
      reversedJeIds.push(revId);
      manualFold = { reversed: true, reversal_je: revId };
    }

    // ── GLOBAL equal-and-opposite proof: every original JE we reversed + every reversal JE (incl. the
    //    manual fold) must net to ZERO at the (account, class, entity) grain. Own query, not the
    //    engine's internal one. ─────────────────────────────────────────────────────────────────────
    const originalJes = await client.query<{ je: string }>(
      `SELECT DISTINCT journal_entry_id::text je FROM driver_finance.payrun_gl_runs
        WHERE operating_company_id = $1::uuid AND settlement_id = ANY($2::uuid[]) AND journal_entry_id IS NOT NULL`,
      [OPCO, scope]
    );
    const allJeIds = [
      ...originalJes.rows.map((r) => r.je),
      ...(manualFold.reversed ? [MANUAL_CORRECTION_JE_ID] : []),
      ...reversedJeIds,
    ];
    const proof = await client.query<{ nonzero_dims: number; residual_cents: number; je_count: number }>(
      `WITH sel AS (
         SELECT account_id, class_id, entity_uuid,
                CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END s
         FROM accounting.journal_entry_postings
         WHERE operating_company_id=$1::uuid AND journal_entry_uuid = ANY($2::uuid[])
       )
       SELECT COUNT(*) FILTER (WHERE r <> 0)::int nonzero_dims,
              COALESCE(SUM(ABS(r)),0)::bigint residual_cents,
              (SELECT COUNT(DISTINCT journal_entry_uuid)::int
                 FROM accounting.journal_entry_postings
                WHERE operating_company_id=$1::uuid AND journal_entry_uuid = ANY($2::uuid[])) je_count
       FROM (SELECT SUM(s) r FROM sel GROUP BY account_id, class_id, entity_uuid) d`,
      [OPCO, allJeIds]
    );
    const p = proof.rows[0];

    // ── Report. ───────────────────────────────────────────────────────────────────────────────────
    console.log("settlement            | display  | result             | adv | escrow¢ | lines | bank");
    console.log("----------------------+----------+--------------------+-----+---------+-------+-----");
    for (const r of rows) {
      console.log(
        `${r.settlement_id.slice(0, 8)}…          | ${(r.display_id ?? "").padEnd(8)} | ${r.result.padEnd(18)} | ${String(r.advances_restored).padStart(3)} | ${String(r.escrow_reversed_cents).padStart(7)} | ${String(r.lines_voided).padStart(5)} | ${r.bank_unmatched ? "yes" : "no"}`
      );
    }
    console.log(`\nmanual JE 15e0887f fold: ${manualFold.reversed ? `reversed -> ${manualFold.reversal_je}` : "NOT FOUND (skipped)"}`);
    console.log(
      `\n=== GLOBAL EQUAL-AND-OPPOSITE PROOF ===\n  journals=${p?.je_count} nonzero_dims=${p?.nonzero_dims} residual_cents=${p?.residual_cents}` +
        `  (both nonzero_dims and residual_cents MUST be 0)`
    );
    const proofOk = Number(p?.nonzero_dims ?? -1) === 0 && Number(p?.residual_cents ?? -1) === 0;
    if (!proofOk) throw new Error("GLOBAL PROOF FAILED — reversed set does not net to zero; aborting (transaction will roll back)");

    if (commitConfirmed) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED. (Ensure this is a branch, or that Claude GO + owner yes were given.)");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPREVIEW ONLY — ROLLED BACK. Nothing persisted. Re-run with --commit + REBUILD_I_UNDERSTAND=yes on a branch to persist.");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLED BACK — orchestration threw:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest(): void {
  // Real prod host, real pooled host, and a project-qualified variant — all must be refused.
  const prodVariants = [
    "postgres://user:pass@ep-broad-block-akykk7bw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require",
    "postgres://user:pass@ep-broad-block-akykk7bw-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require",
    "postgres://user:pass@some-host/neondb?options=project%3Dtiny-field-89581227",
  ];
  for (const url of prodVariants) {
    try {
      assertNotProd(url);
      throw new Error(`selftest FAILED: prod-like URL was NOT refused: ${url}`);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("REFUSING TO RUN")) throw e;
    }
  }
  // A real rehearsal-branch-shaped URL must NOT be refused.
  const branchUrl = "postgres://user:pass@ep-royal-grass-ak4y2evz.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
  assertNotProd(branchUrl); // throws (and fails the selftest) if it wrongly matches
  console.log("[rebuild-usmca-settlements-orchestration --selftest] PASS — prod endpoint hard-blocked, branch URL unaffected");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
