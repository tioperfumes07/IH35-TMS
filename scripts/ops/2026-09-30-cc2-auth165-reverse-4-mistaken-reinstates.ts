#!/usr/bin/env -S npx tsx
/**
 * AUTH-165 -- reverse a real, live $17,057.44 double-count caused by my own AUTH-140
 * classification error, live-caught and reported by CC-1 (cross-session, 2026-09-30).
 *
 * ROOT CAUSE: AUTH-140's twin-detection matched candidate factoring_advances rows on
 * (invoice_total_cents, advance_amount_cents). At the time AUTH-140 ran, these 4 targets'
 * invoice_total_cents was still WRONG (the exact defect AUTH-160 fixed HOURS LATER: 590000 vs
 * the correct 611500, 412000 vs 415000, 400000 vs 412000, 370000 vs 320000). Because
 * target.invoice_total_cents != twin.invoice_total_cents at classification time, the twin search
 * never matched, so AUTH-140 classified these 4 as REINSTATE ("no live twin found") when a real,
 * live twin existed the whole time (FAC-2026-00094/110/111/129, each carrying the real
 * faro_invoice_number 52/69/70/91 and byte-identical FARO_FEES notes -- genuinely the same
 * real-world Faro invoice as its paired target). AUTH-140's reinstate then created a brand-new
 * live JE for each target, on top of the twin's own already-live JE -- the exact same real cash
 * counted twice: $593,154 + $402,550 + $399,640 + $310,400 = $17,057.44 (advance_amount_cents
 * component alone; full 4-line postings duplicated identically on both sides).
 *
 * FIX: reverse ONLY the JE my own AUTH-140 reinstate created for each of the 4 targets
 * (readOriginalGlPostings will find the currently-live one; the OLDER, already-reversed JE on
 * the same target from before AUTH-140 is correctly skipped -- it's already dead). The twin
 * (FAC-2026-00094/110/111/129) is untouched -- it remains the sole live record, exactly as it
 * should have been the whole time. Target headers (status='advanced', voided_at=NULL) are left
 * as-is, mirroring the exact historical shape already sitting on the same 4 records from their
 * own earlier (pre-AUTH-140) reversal -- a document whose GL nets to zero via reversal, not a
 * voided document.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth165-reverse-4-mistaken-reinstates.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-165";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS: { display_id: string; id: string; twin_display_id: string; twin_id: string; expected_je_id: string; expected_cents: number }[] = [
  { display_id: "FAC-2026-00048", id: "43bf2fc5-4984-4b56-8d13-7eeaf244d080", twin_display_id: "FAC-2026-00094", twin_id: "00d44d0f-98e2-4c61-bf25-997ac02f90b2", expected_je_id: "cecc3f64-d5a2-49e2-a097-44262c5d6731", expected_cents: 593154 },
  { display_id: "FAC-2026-00063", id: "7b2da4bc-fcf0-4649-a3a6-ebbac086666c", twin_display_id: "FAC-2026-00110", twin_id: "2a387aff-f8ad-48c9-8e9d-be2377d7c465", expected_je_id: "af3ba1e8-155d-493e-ada7-992a07dfc106", expected_cents: 402550 },
  { display_id: "FAC-2026-00064", id: "5c44b184-aecc-4132-8247-7543f14e618a", twin_display_id: "FAC-2026-00111", twin_id: "b8173686-1609-4f33-975f-55957d4164b6", expected_je_id: "c881194b-b380-4192-909f-3554a9f9d619", expected_cents: 399640 },
  { display_id: "FAC-2026-00082", id: "e9f9df8a-a91c-46b4-a5bf-0dced674b933", twin_display_id: "FAC-2026-00129", twin_id: "15b3a499-36f8-4ddc-9b9e-67ccc923756b", expected_je_id: "2f619306-7938-47af-94dc-faff03798366", expected_cents: 310400 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const { postVoidReversal } = await import(path.join(ROOT, "apps/backend/src/accounting/void.service.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const before = await client.query<{ account_number: string; balance_cents: string }>(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '2150', '6300', '6400')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("BEFORE:", before.rows);

    for (const t of TARGETS) {
      // Preflight: confirm the twin is still live (sole correct record) and the target's currently
      // live JE is exactly the one AUTH-140 created -- refuse on ANY mismatch, never guess.
      const twinCheck = await client.query<{ status: string; voided_at: string | null }>(
        `SELECT status, voided_at::text FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
        [t.twin_id, USMCA]
      );
      if (twinCheck.rows[0]?.status !== "advanced" || twinCheck.rows[0]?.voided_at) {
        throw new Error(`${t.display_id}: twin ${t.twin_display_id} is not live/advanced -- refusing, re-verify before reversing`);
      }
      const liveJe = await client.query<{ je_id: string; amount_cents: string }>(
        `SELECT DISTINCT je.id::text AS je_id, p.amount_cents::text
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
          WHERE p.source_transaction_type = 'factoring_advance' AND p.source_transaction_id::uuid = $1::uuid
            AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
            AND p.account_id = (SELECT id FROM catalogs.accounts WHERE operating_company_id=$2::uuid AND account_number='1090')
        `,
        [t.id, USMCA]
      );
      if (liveJe.rows.length !== 1 || liveJe.rows[0]!.je_id !== t.expected_je_id || Number(liveJe.rows[0]!.amount_cents) !== t.expected_cents) {
        throw new Error(`${t.display_id}: live JE mismatch, expected ${t.expected_je_id}/${t.expected_cents}, found ${JSON.stringify(liveJe.rows)} -- refusing`);
      }

      console.log(`Reversing ${t.display_id} (mistaken AUTH-140 reinstate, twin ${t.twin_display_id} is the correct live record)...`);
      const reversal = await postVoidReversal(
        client,
        {
          operatingCompanyId: USMCA,
          entityType: "factoring_advance",
          entityId: t.id,
          originalDate: "2026-09-30",
          memo: `AUTH-165: reverse mistaken AUTH-140 reinstate of ${t.display_id} -- real live twin ${t.twin_display_id} (faro_invoice_number set) already carries this Faro invoice's revenue; AUTH-140's twin-detection missed it because ${t.display_id}'s invoice_total_cents was still wrong at classification time (fixed later under AUTH-160). $17,057.44 double-count, live-caught by CC-1's new assertNoLiveFactoringTwin() guard (PR #23320).`,
        },
        { userId: ACTOR_USER_ID }
      );
      console.log(`  ${t.display_id}:`, JSON.stringify(reversal));
      if (!reversal.reversal_journal_entry_id) {
        throw new Error(`${t.display_id}: reversal produced no JE -- refusing, expected a real reversal`);
      }
    }

    const after = await client.query<{ account_number: string; balance_cents: string }>(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '2150', '6300', '6400')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("AFTER (this transaction, before commit):", after.rows);

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
