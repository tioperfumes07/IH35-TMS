#!/usr/bin/env npx tsx
/**
 * ENG-25b (Row 301) — Transportation diesel → 8000 Inter-company - IH35 Transportation
 *
 * Owner ruling 10-24 2:36 PM CT: fuel expenses in USMCA that belong to TRANSP loads (NOT on a
 * USMCA load per signed docs) are a loan to Transportation and must be classified under 8000
 * (intercompany_ih35, "Inter-company - IH35 Transportation") rather than 5000 Fuel & Diesel.
 *
 * Identification: USMCA fuel expense postings to account 5000/5005/5010 where
 *   the posting carries a load_id whose operating_company_id ≠ USMCA  (i.e., a TRANSP load).
 *   (Postings with no load_id require manual review per signed docs — not in scope here.)
 *
 * Engine: applyReclassifyOnClient (accounting/reclassify/reclassify.service.ts) with
 *         to_account_id = USMCA's 8000 intercompany_ih35 account.
 *
 * AUTH: requires AUTH-464. Run with:
 *   OWNER_AUTH_ID=AUTH-464 DATABASE_URL=... npx tsx scripts/ops/2026-11-12-cc3-eng25b-transp-diesel-reclass-to-8000.mts [--apply]
 *
 * Dry-run (default): prints affected postings + amounts. No writes.
 * verify-no-unauthorized-production-write.mjs: verify-owner-authorization
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const REQUIRED_AUTH = "AUTH-464";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const REASON = "ENG-25b: Transportation diesel on non-USMCA load = intercompany loan per signed docs (AUTH-464)";

if (APPLY) {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error(`ROUND 133 P0: OWNER_AUTH_ID env var is required for --apply (must be ${REQUIRED_AUTH}).`);
    process.exit(1);
  }
  if (authId !== REQUIRED_AUTH) {
    console.error(`ENG-25b: wrong auth (got ${authId}, need ${REQUIRED_AUTH}).`);
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${authId} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

type Row = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  debit_or_credit: string;
  amount_cents: string;
  account_number: string;
  account_name: string;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  source_transaction_line_id: string | null;
  load_id: string | null;
  load_number: string | null;
  load_company_id: string | null;
  unit_number: string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SET LOCAL app.current_entity_id = '${USMCA}'`);

    // Find USMCA's 8000 intercompany_ih35 account id
    const acct = await client.query<{ id: string; account_number: string; account_name: string }>(
      `SELECT id::text, account_number, account_name
         FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid
          AND system_purpose = 'intercompany_ih35'
          AND deactivated_at IS NULL
          AND is_postable = true
        LIMIT 1`,
      [USMCA],
    );
    if (!acct.rows.length) {
      console.error("ENG-25b: USMCA account 8000 (system_purpose=intercompany_ih35) not found — cannot proceed.");
      process.exit(1);
    }
    const toAccount = acct.rows[0];
    console.log(`[ENG-25b] Target account: ${toAccount.account_number} "${toAccount.account_name}" (${toAccount.id})`);

    // Find affected postings: USMCA fuel expense postings NOT on a USMCA load
    const result = await client.query<Row>(
      `SELECT p.id::text             AS posting_id,
              p.journal_entry_id::text AS journal_entry_id,
              je.entry_date::text,
              p.debit_or_credit,
              p.amount_cents::text,
              a.account_number,
              a.account_name,
              p.source_transaction_type,
              p.source_transaction_id::text,
              p.source_transaction_line_id::text,
              p.load_id::text,
              ml.load_number,
              ml.operating_company_id::text AS load_company_id,
              u.unit_number
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
                                            AND je.operating_company_id = $1::uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        LEFT JOIN mdata.loads ml    ON ml.id = p.load_id
        LEFT JOIN mdata.units u     ON u.id = p.unit_id
        WHERE p.operating_company_id = $1::uuid
          AND je.voided_at IS NULL
          AND p.voided_at IS NULL
          AND a.account_number IN ('5000', '5005', '5010')
          AND p.source_transaction_type = 'fuel_event'
          AND p.debit_or_credit = 'debit'
          AND p.load_id IS NOT NULL
          AND ml.operating_company_id IS DISTINCT FROM $1::uuid
        ORDER BY je.entry_date, p.amount_cents DESC`,
      [USMCA],
    );

    const rows = result.rows;

    if (!rows.length) {
      console.log("[ENG-25b] DRY RUN: 0 postings match the Transportation diesel criterion. Nothing to move.");
      await client.query("ROLLBACK");
      return;
    }

    const totalCents = rows.reduce((s, r) => s + Number(r.amount_cents), 0);
    console.log(`\n[ENG-25b] ${APPLY ? "APPLY" : "DRY RUN"}: ${rows.length} posting(s) → $${(totalCents / 100).toFixed(2)}`);
    console.log("─".repeat(100));
    for (const r of rows) {
      const loadInfo = r.load_id ? `load ${r.load_number ?? r.load_id.slice(0, 8)} (co ${r.load_company_id?.slice(0, 8)})` : "no load";
      console.log(
        `  ${r.entry_date} | ${r.account_number} ${r.account_name} → ${toAccount.account_number} | $${(Number(r.amount_cents) / 100).toFixed(2)} | ${loadInfo} | unit ${r.unit_number ?? "—"} | src ${r.source_transaction_type ?? "—"}:${r.source_transaction_id?.slice(0, 8) ?? "—"}`,
      );
    }
    console.log("─".repeat(100));
    console.log(`  TOTAL: $${(totalCents / 100).toFixed(2)} (${rows.length} line(s)) → ${toAccount.account_number} "${toAccount.account_name}"`);

    if (!APPLY) {
      console.log(`\n[ENG-25b] DRY RUN complete. Rerun with --apply + OWNER_AUTH_ID=${REQUIRED_AUTH} to execute.`);
      await client.query("ROLLBACK");
      return;
    }

    // APPLY — reclassify via applyReclassifyOnClient
    await client.query("ROLLBACK"); // end the read transaction
    const { applyReclassifyOnClient } = await import("../../apps/backend/src/accounting/reclassify/reclassify.service.js");
    const writeClient = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await writeClient.connect();
    try {
      await writeClient.query("BEGIN");
      await writeClient.query("SET LOCAL app.bypass_rls = 'lucia'");
      await writeClient.query(`SET LOCAL app.current_entity_id = '${USMCA}'`);
      const batch = await applyReclassifyOnClient(
        writeClient as Parameters<typeof applyReclassifyOnClient>[0],
        {
          operating_company_id: USMCA,
          posting_ids: rows.map((r) => r.posting_id),
          reason: REASON,
          to_account_id: toAccount.id,
        },
        { userId: SYSTEM_ACTOR_USER_ID, role: "Owner" },
      );
      await writeClient.query("COMMIT");
      console.log(`\n[ENG-25b] APPLIED: batch ${batch.batch_id} — ${batch.lines_applied} applied / ${batch.lines_refused} refused / $${(batch.amount_cents_moved / 100).toFixed(2)} moved`);
      for (const d of batch.documents) {
        const status = d.lines_applied > 0 ? "✓" : "✗";
        console.log(`  ${status} ${d.source_transaction_type ?? "JE"}:${d.source_transaction_id?.slice(0, 8) ?? d.reclass_journal_entry_id?.slice(0, 8)} lines_applied=${d.lines_applied} doc_updated=${d.document_updated} ${d.refusal_reason ?? d.document_update_note ?? ""}`);
      }
    } catch (e) {
      await writeClient.query("ROLLBACK");
      throw e;
    } finally {
      await writeClient.end();
    }
    return;
  } finally {
    if (APPLY) {
      /* write client handles its own lifecycle above */
    } else {
      await client.query("ROLLBACK");
    }
    await client.end();
  }
}

main().catch((e) => {
  console.error("[ENG-25b] FATAL:", e);
  process.exit(1);
});
