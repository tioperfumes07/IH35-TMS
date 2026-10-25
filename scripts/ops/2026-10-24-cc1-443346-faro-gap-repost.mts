#!/usr/bin/env tsx
/**
 * 443.346b — Faro bank_wire_cents + gap-account seed and repost
 *
 * Faro wired less than the full net advance to USMCA's BofA account on 3 advances.
 * The gap either stayed in USMCA's Faro reserve (1230) or was transferred internally
 * to IH35 Transportation's reserve (8000 Inter-company).
 *
 * Rule (docs/reconciliation/2026-09-22-faro-reserve-1230-correction-preview.md):
 *   gap → 8000 when Faro ran a Faro→IH35 reserve transfer (money moved to TRANSP, not USMCA)
 *   gap → 1230 when Faro kept it in USMCA's own reserve account
 *
 * Advances covered:
 *   FAC-2026-00018  wire=367050  gap=180000 → 8000  bank-line 99ee0ead (2026-08-13 exact)
 *   FAC-2026-00012  wire=437024  gap=544100 → 8000  bank-line 4cded6ac (2026-08-14 exact)
 *   FAC-2026-00020  wire=2108300 gap=500000 → 1230  bank-line a2a8e6f9 (2026-08-28 exact)
 *   FAC-2026-00025  UNEXPLAINED — no bank-line match; no posting; owner resolves manually
 *
 * Usage:
 *   tsx scripts/ops/2026-10-24-cc1-443346-faro-gap-repost.mts          # dry-run (default)
 *   tsx scripts/ops/2026-10-24-cc1-443346-faro-gap-repost.mts --apply  # requires AUTH + fork rehearsal
 */

import { execSync } from "child_process";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Account IDs (USMCA, verified live 2026-10-24)
const ACCT_1230 = "165cc317-5c8b-4296-8aab-f5101f4a6815"; // Factoring Reserves
const ACCT_8000 = "b1bc0529-20cd-46ea-a2e6-12d6792a45c5"; // Inter-company - IH35 Transportation

interface AdvanceFix {
  id: string;
  display_id: string;
  bank_wire_cents: number;
  gap_account_id: string | null; // null = keep gap in 1230 (existing behaviour)
  bank_line_id: string;
  bank_line_amount_cents: number;
  bank_line_date: string;
  gap_rationale: string;
}

const FIXES: AdvanceFix[] = [
  {
    id: "76151d0c-5248-4616-87b5-7a8b084c1940",
    display_id: "FAC-2026-00018",
    bank_wire_cents: 367050,
    gap_account_id: ACCT_8000,
    bank_line_id: "99ee0ead-498a-476f-8ece-6bb36f86055f",
    bank_line_amount_cents: 367050,
    bank_line_date: "2026-08-13",
    gap_rationale: "Faro→IH35 reserve transfer: gap posts to 8000 Inter-company",
  },
  {
    id: "a0a1ee56-ce76-41d1-81a2-ca2876599d70",
    display_id: "FAC-2026-00012",
    bank_wire_cents: 437024,
    gap_account_id: ACCT_8000,
    bank_line_id: "4cded6ac-8b24-4d41-9b09-3b935c0fdf36",
    bank_line_amount_cents: 437024,
    bank_line_date: "2026-08-14",
    gap_rationale: "Faro→IH35 reserve transfer: gap posts to 8000 Inter-company",
  },
  {
    id: "26c604f6-857b-4b94-a048-3a03183c5d04",
    display_id: "FAC-2026-00020",
    bank_wire_cents: 2108300,
    gap_account_id: null,
    bank_line_id: "a2a8e6f9-46a1-4621-a61f-2afa43247df6",
    bank_line_amount_cents: 2108300,
    bank_line_date: "2026-08-28",
    gap_rationale: "Faro kept in USMCA CCG reserve: gap stays in 1230 (NULL = default behaviour)",
  },
];

const UNEXPLAINED = {
  id: "07e69345-6da2-4e61-af55-73b3695b60bb",
  display_id: "FAC-2026-00025",
  advance_amount_cents: 2318270,
  reason:
    "No matching Faro bank wire found for advance_at=2026-09-04. The same-day wire ($16,785.54) " +
    "matches FAC-2026-00024 exactly. Source document required from Lead before posting. SKIP.",
};

async function main() {
  if (APPLY) {
    console.log("[AUTH CHECK] Verifying owner authorization...");
    try {
      execSync("node scripts/verify-owner-authorization.mjs AUTH-443346-GAP", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
    } catch {
      console.error("AUTH check failed — owner must open AUTH-443346-GAP on main before applying.");
      process.exit(1);
    }
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // --- Read current state ---
    const rows = await pool.query<{
      id: string;
      display_id: string;
      advance_amount_cents: string;
      bank_wire_cents: string | null;
      bank_wire_gap_account_id: string | null;
      je_id: string | null;
      je_amount: string | null;
    }>(
      `SELECT a.id, a.display_id, a.advance_amount_cents, a.bank_wire_cents,
              a.bank_wire_gap_account_id,
              je.id AS je_id, je.total_debit_cents AS je_amount
         FROM accounting.factoring_advances a
         LEFT JOIN accounting.journal_entries je ON je.source_document_id = a.id
           AND je.source_document_type = 'factoring_advance'
           AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1
          AND a.id = ANY($2::uuid[])`,
      [USMCA, FIXES.map((f) => f.id)]
    );

    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

    console.log("\n=== DRY-RUN REPORT — 443.346 Faro gap-account seed ===");
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN (no writes)"}\n`);

    let bofaDebitBefore = 0;
    let bofaDebitAfter = 0;

    for (const fix of FIXES) {
      const cur = byId[fix.id];
      const advance = Number(cur?.advance_amount_cents ?? 0);
      const currentWire = cur?.bank_wire_cents != null ? Number(cur.bank_wire_cents) : null;
      const gap = advance - fix.bank_wire_cents;
      const gapAcctLabel = fix.gap_account_id ? "8000 Inter-company" : "1230 Factoring Reserves (NULL→default)";

      bofaDebitBefore += advance; // current: full advance assumed as BofA debit
      bofaDebitAfter += fix.bank_wire_cents; // after: only wire amount hits BofA

      console.log(`--- ${fix.display_id} (${fix.id.slice(0, 8)}) ---`);
      console.log(`  advance_amount_cents : ${advance} ($${(advance / 100).toFixed(2)})`);
      console.log(`  current bank_wire    : ${currentWire ?? "NULL"}`);
      console.log(`  → set bank_wire_cents: ${fix.bank_wire_cents} ($${(fix.bank_wire_cents / 100).toFixed(2)})`);
      console.log(`  gap                  : ${gap} ($${(gap / 100).toFixed(2)}) → ${gapAcctLabel}`);
      console.log(`  bank-line evidence   : ${fix.bank_line_id.slice(0, 8)} ${fix.bank_line_date} $${(fix.bank_line_amount_cents / 100).toFixed(2)}`);
      console.log(`  rationale            : ${fix.gap_rationale}`);
      console.log(`  current JE           : ${cur?.je_id?.slice(0, 8) ?? "NONE"} ($${(Number(cur?.je_amount ?? 0) / 100).toFixed(2)})`);
      console.log(`  action               : ${APPLY ? "void JE → set columns → re-post" : "[dry-run: would void+repost]"}`);
      console.log();
    }

    console.log(`--- ${UNEXPLAINED.display_id} (${UNEXPLAINED.id.slice(0, 8)}) ---`);
    console.log(`  advance_amount_cents : ${UNEXPLAINED.advance_amount_cents} ($${(UNEXPLAINED.advance_amount_cents / 100).toFixed(2)})`);
    console.log(`  STATUS               : UNEXPLAINED — ${UNEXPLAINED.reason}`);
    console.log(`  action               : SKIP (no write)\n`);

    console.log("=== BofA TIE-OUT ===");
    console.log(`  Before: BofA debit from 3 advances = $${(bofaDebitBefore / 100).toFixed(2)}`);
    console.log(`  After : BofA debit from 3 advances = $${(bofaDebitAfter / 100).toFixed(2)}`);
    console.log(`  Delta : BofA reduced by $${((bofaDebitBefore - bofaDebitAfter) / 100).toFixed(2)}`);
    console.log(`          Gap posted to 8000: $${((180000 + 544100) / 100).toFixed(2)}`);
    console.log(`          Gap posted to 1230: $${(500000 / 100).toFixed(2)}`);
    console.log(`          Total gap = $${((180000 + 544100 + 500000) / 100).toFixed(2)} (= BofA delta)\n`);

    if (!APPLY) {
      console.log("[DRY-RUN] No writes made. Re-run with --apply after AUTH + fork rehearsal.");
      process.exit(0);
    }

    // --- Apply ---
    // Import the engine dynamically to avoid loading it in dry-run
    const { reverseFactoringAdvanceEvent, postFactoringAdvanceEvent } = await import(
      "../apps/backend/src/accounting/factoring-posting/poster.service.js"
    );

    for (const fix of FIXES) {
      const cur = byId[fix.id];
      if (!cur?.je_id) {
        console.log(`[APPLY] ${fix.display_id}: no JE found, skipping void step`);
      } else {
        console.log(`[APPLY] ${fix.display_id}: reversing JE ${cur.je_id.slice(0, 8)}...`);
        await reverseFactoringAdvanceEvent({
          operating_company_id: USMCA,
          advance_id: fix.id,
          actor_user_id: process.env.OWNER_USER_ID ?? (() => { throw new Error("OWNER_USER_ID required"); })(),
          reason: `443.346: repost with bank_wire_cents=${fix.bank_wire_cents} (${fix.gap_rationale})`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE accounting.factoring_advances
              SET bank_wire_cents = $1, bank_wire_gap_account_id = $2
            WHERE id = $3 AND operating_company_id = $4`,
          [fix.bank_wire_cents, fix.gap_account_id, fix.id, USMCA]
        );
        await client.query("COMMIT");
        console.log(`[APPLY] ${fix.display_id}: columns set`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await postFactoringAdvanceEvent({
        operating_company_id: USMCA,
        advance_id: fix.id,
        actor_user_id: process.env.OWNER_USER_ID ?? (() => { throw new Error("OWNER_USER_ID required"); })(),
      });

      console.log(`[APPLY] ${fix.display_id}: reposted ✓`);
    }

    console.log("\n[APPLY] All 3 advances reposted. FAC-2026-00025 UNEXPLAINED — skipped.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
