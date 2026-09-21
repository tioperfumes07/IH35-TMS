#!/usr/bin/env tsx
// ROUND 28 STEP 3 PHASE 1 — settlement repoint for documents 5804-5815.
//
// SOURCE OF TRUTH: ~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx DRIVER_PAY_LINES sheet —
// the authoritative load->document map for every settlement in this range (verified against the
// sheet's own per-load loaded/empty mile rows, never re-derived). Cross-checked live before writing
// this file: MANY of the 23 loads Step 1 just created auto-linked (via bookLoad's own presettlement
// auto-link, which this file's own resolveTripLinkage triggers by passing trip_type/tour_id) onto
// ad-hoc settlements that do NOT match the real AlwaysTrack document numbers — e.g. settlement 5810's
// shell currently holds loads 13585/13587, which per DRIVER_PAY_LINES actually belong to 5807; 5804's
// shell holds nothing of its own but 5808's shell wrongly holds 13576/13594 (real 5804 loads).
// document 5811-5814's OWN "shells" (by legacy display_id S-2026-0023/0031/0029/0022) hold loads that
// belong to OTHER documents entirely (0023 holds 13573, which is actually a 5800/Vicente load).
//
// MECHANISM: the SAME established, already-shipped primitive from ROUND 23.3 B5
// (settlement-load-reassignment.service.ts) — reassignLoadToSettlementInClientTx moves a load's
// settlement_lines/deductions/reimbursements/bills together in one transaction and recomputes both
// settlements' headers via the existing aggregateSettlementTotals/driver_bills-direct formula, no new
// GL math. For 5811-5814 the CURRENT settlement holding that source_document_ref is itself wrong
// (contaminated with a different document's loads) — its source_document_ref is cleared (one column,
// disclosed, no dollar field touched; no sanctioned function exists to null this field, see
// settlement-source-document-ref.service.ts's own non-empty guard) and a fresh shell is minted via
// createBareSettlementForDocument (the same B5 primitive that seeds every other document's shell).
//
// THIS IS PHASE 1 ONLY: repoints loads onto the CORRECT settlement. It does NOT correct wrong dollar
// amounts already sitting on lines that move (several are visibly wrong, e.g. 13585's live earnings
// line reads $598.90 against DRIVER_PAY_LINES' authoritative $541.31) and does NOT create the
// still-missing additional-pay/reimbursement/deduction lines the ADDITIONAL_PAY/DRIVER_REIMBURSEMENTS/
// DEDUCTIONS sheets carry for this range. That is Phase 2, a separate, disclosed follow-up — not
// silently folded in here.
//
// NO REVERSES (owner law 2026-09-13). Nothing voided at the settlement level; reassignLoadToSettlementInClientTx
// itself never deletes, only re-homes.
//
// Usage:
//   DATABASE_URL=<neon prod> npx tsx scripts/ops/round28-step3-settlement-repoint.ts --dry-run
//   DATABASE_URL=<neon prod> npx tsx scripts/ops/round28-step3-settlement-repoint.ts --apply
import pg from "pg";
import {
  reassignLoadToSettlementInClientTx,
  createBareSettlementForDocument,
} from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// Documents whose EXISTING settlement row (by source_document_ref) is itself correct and just needs
// its real loads moved onto it.
const EXISTING_SHELL_TARGETS: Record<string, string> = {
  "5804": "48341005-1ac9-4a32-bd7b-f78479782a99",
  "5805": "6a8ecf55-c321-4648-bb05-17fada8881a4",
  "5806": "f5305500-726f-4650-ab1c-ebef26db4c31",
  "5807": "89c90396-28b3-46cd-8920-2c496e499b2f",
  "5808": "63a8333b-8446-4426-bd34-4277997608ec",
  "5809": "4db66351-c523-43a4-b949-bd4d9c42e5a2",
  "5810": "f074c0c9-266c-4fc6-9c1e-446d702ced49",
  "5815": "00027149-1c90-4bc1-b213-0a6d6d614ac6",
};

// Documents whose current source_document_ref holder is CONTAMINATED (holds a different document's
// loads) — clear its ref, mint a fresh, correctly-numbered shell, same B5 pattern every other
// document's shell was seeded with.
const WRONG_HOLDER_TO_CLEAR: Record<string, { wrongSettlementId: string; period_start: string; period_end: string; driverId: string }> = {
  "5811": { wrongSettlementId: "2ed4116a-ad7a-4cf8-86dc-66c0f7b13426", period_start: "2026-09-11", period_end: "2026-09-15", driverId: "5dd518ff-db91-429f-b651-a71b5f0db672" }, // Leonel Antonio Morales
  "5812": { wrongSettlementId: "9bdfa86e-4e91-4d15-86dc-45b1f977516d", period_start: "2026-09-14", period_end: "2026-09-18", driverId: "4ff53886-41cc-434f-ae23-a36a0e3ec8e2" }, // Luis Armando Sosa Perez
  "5813": { wrongSettlementId: "9fc96d89-c263-4f6a-8757-ab81400223c5", period_start: "2026-09-15", period_end: "2026-09-18", driverId: "93be328f-ba1b-4175-adaf-bb619c1c51f2" }, // Fernando Mecor Hernandez
  "5814": { wrongSettlementId: "035cbd68-e76b-42a6-9f5a-c7ab7cf6328a", period_start: "2026-09-16", period_end: "2026-09-18", driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d" }, // Jorge Luis Infante Corona
};

// doc -> [load_number, ...] straight off DRIVER_PAY_LINES.csv, verified against CONTROL TOTALS
// (Salary column ties exactly for every one of these 12 documents before this file was written).
const DOC_LOADS: Record<string, string[]> = {
  "5804": ["13576", "13594"],
  "5805": ["13582", "13592"],
  "5806": ["13581", "13591"],
  "5807": ["13578", "13585", "13587"],
  "5808": ["13597", "13601"],
  "5809": ["13583", "13598", "13606"],
  "5810": ["13590", "13599"],
  "5811": ["13596", "13603"],
  "5812": ["13588", "13600"],
  "5813": ["13602", "13607"],
  "5814": ["13604", "13608"],
  "5815": ["13605", "13611"],
};

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const report: string[] = [];
  const log = (s: string) => { report.push(s); console.log(s); };
  log(`# ROUND 28 STEP 3 PHASE 1 — settlement repoint (${dryRun ? "DRY RUN" : "EXECUTE"}, ${new Date().toISOString()})`);

  const targets: Record<string, string> = { ...EXISTING_SHELL_TARGETS };

  for (const [doc, info] of Object.entries(WRONG_HOLDER_TO_CLEAR)) {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
      const cur = await client.query<{ source_document_ref: string | null }>(
        `SELECT source_document_ref FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
        [info.wrongSettlementId]
      );
      if (cur.rows[0]?.source_document_ref !== doc) {
        log(`- ${doc} SKIP clear/create — holder ${info.wrongSettlementId} source_document_ref is '${cur.rows[0]?.source_document_ref}', not '${doc}' (already fixed or drifted, not touching blind)`);
        // still need a target — look up whichever settlement now holds this doc
        const now = await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL`,
          [USMCA_COMPANY_ID, doc]
        );
        if (now.rows[0]) targets[doc] = now.rows[0].id;
        continue;
      }
      if (dryRun) {
        log(`- ${doc} DRY-RUN — would clear source_document_ref off ${info.wrongSettlementId}, mint a fresh shell, driver ${info.driverId}`);
        continue;
      }
      await client.query(
        `UPDATE driver_finance.driver_settlements SET source_document_ref = NULL, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [info.wrongSettlementId, USMCA_COMPANY_ID]
      );
      const { settlement_id, display_id } = await createBareSettlementForDocument(client as unknown as DbClient, {
        operating_company_id: USMCA_COMPANY_ID,
        driver_id: info.driverId,
        period_start: info.period_start,
        period_end: info.period_end,
        source_document_ref: doc,
        actor_user_id: OWNER_USER_ID,
        is_sample_data: false,
        status: "closed",
      });
      targets[doc] = settlement_id;
      log(`- ${doc} CLEARED ${info.wrongSettlementId}'s ref, minted fresh shell ${settlement_id} (${display_id})`);
    } finally {
      client.release();
    }
  }

  for (const [doc, loadNumbers] of Object.entries(DOC_LOADS)) {
    const targetSettlementId = targets[doc];
    if (!targetSettlementId) {
      log(`- ${doc} ABORT — no target settlement resolved`);
      continue;
    }
    for (const loadNumber of loadNumbers) {
      const client = await pool.connect();
      try {
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
        const loadRes = await client.query<{ id: string; presettlement_link_id: string | null }>(
          `SELECT id::text, presettlement_link_id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
          [USMCA_COMPANY_ID, loadNumber]
        );
        const load = loadRes.rows[0];
        if (!load) { log(`- ${doc}/${loadNumber} NOT FOUND`); continue; }
        if (load.presettlement_link_id === targetSettlementId) {
          log(`- ${doc}/${loadNumber} already on target — no-op`);
          continue;
        }
        if (dryRun) {
          log(`- ${doc}/${loadNumber} DRY-RUN — would move from ${load.presettlement_link_id ?? "NULL"} -> ${targetSettlementId}`);
          continue;
        }
        await client.query("BEGIN");
        const result = await reassignLoadToSettlementInClientTx(client as unknown as DbClient, {
          operating_company_id: USMCA_COMPANY_ID,
          load_id: load.id,
          target_settlement_id: targetSettlementId,
          actor_user_id: OWNER_USER_ID,
          reason: `ROUND 28 STEP 3 PHASE 1: load ${loadNumber} belongs to AlwaysTrack document ${doc} per DRIVER_PAY_LINES.csv (owner-authoritative reconciliation); the app had it on a different settlement (auto-linked at booking or a legacy-numbered contaminated shell).`,
        });
        await client.query("COMMIT");
        log(`- ${doc}/${loadNumber} moved: ${JSON.stringify(result)}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        log(`- ${doc}/${loadNumber} BLOCKED — ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
  }

  await pool.end();
  if (!apply) log("\nDRY RUN ONLY — no writes made. Re-run with --apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
