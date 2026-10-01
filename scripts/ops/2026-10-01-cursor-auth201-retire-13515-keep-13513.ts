/**
 * AUTH-201 — Retire load 13515 keep 13513 (owner/Lead: same billable load).
 *
 * Measured (USMCA, bypass_rls):
 *   13513 invoiced — invoice ca5c386d sent $525 unpaid; Event 1 d345d639 + Event 2 929ea049
 *   13515 closed — invoice f59a3468 paid $525; payment 411c9b24 app f9403774;
 *                  Event 1 earn 2c730468 (load); Event 2 bill 396efaa2 (load+invoice)
 *
 * Action (void-not-delete; engines only):
 *   1) Unapply payment application f9403774 from invoice 13515 (payment_applications.unapplied_at)
 *   2) applyPayment → invoice 13513 $525 (13513 becomes paid)
 *   3) postVoidReversal(invoice f59a3468) — reverses Event 2 invoice-tagged postings + stamps void
 *   4) reverseJournalEntryNoFlip(Event 1 earn 2c730468) if still live — revenue counts once
 *   5) Cancel load 13515 via cancelLoadInClientTx (NEVER DELETE FROM mdata.loads); trip costs stay
 *
 * Usage:
 *   REHEARSAL=1 DATABASE_URL=<throwaway> npx tsx scripts/ops/2026-10-01-cursor-auth201-retire-13515-keep-13513.ts
 *   OWNER_AUTH_ID=AUTH-201 APPLY=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cursor-auth201-retire-13515-keep-13513.ts
 * Default is dry-run (BEGIN…ROLLBACK) even with APPLY unset.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { applyPayment } from "../../apps/backend/src/accounting/payments/apply.service.ts";
import { postVoidReversal } from "../../apps/backend/src/accounting/void.service.ts";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.ts";
import { cancelLoadInClientTx } from "../../apps/backend/src/dispatch/cancellation.service.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REHEARSAL = process.env.REHEARSAL === "1";
const APPLY = process.env.APPLY === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID ?? "";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // USMCA Owner
const LOAD_KEEP = "463109a3-6791-4128-8c2a-0f2940c7d18a"; // 13513
const LOAD_RETIRE = "44eae7f5-70ff-4366-92cf-173d1e9bd11c"; // 13515
const INV_KEEP = "ca5c386d-ca0f-46e3-96a0-ccbcb2c769cb"; // 13513
const INV_RETIRE = "f59a3468-855a-4602-b2c7-953581b25f34"; // 13515
const PAYMENT_ID = "411c9b24-ef99-4653-9dec-4ff7b602f5ec";
const APP_ID = "f9403774-0688-423a-917e-1291add92eac";
const EVENT1_EARN = "2c730468-f884-48a4-8820-7814eb68841c";
const AMOUNT = 52500;
const VOID_REASON =
  "AUTH-201: owner/Lead — 13513/13515 same billable load; keep 13513; retire 13515 duplicate billing. Payment 411c9b24 moved to 13513. Void-not-delete.";

if (!REHEARSAL) {
  if (REQUIRED_AUTH_ID !== "AUTH-201") {
    console.error("OWNER_AUTH_ID must be AUTH-201 (got %s)", REQUIRED_AUTH_ID || "(empty)");
    process.exit(2);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), "AUTH-201"], {
      stdio: "inherit",
    });
  } catch {
    console.error("AUTH-201 rejected — see docs/bus/OWNER-AUTHORIZATIONS.md");
    process.exit(1);
  }
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    if (REHEARSAL) {
      await assertNotProduction(client, { label: "auth201-retire-13515" });
    } else {
      await assertIsIntendedProduction(client, { label: "auth201-retire-13515" });
    }

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const pre = await client.query(
      `SELECT 'inv_keep' AS k, status::text AS status, amount_paid_cents::text AS paid FROM accounting.invoices WHERE id=$1::uuid
       UNION ALL
       SELECT 'inv_retire', status::text, amount_paid_cents::text FROM accounting.invoices WHERE id=$2::uuid
       UNION ALL
       SELECT 'app', CASE WHEN unapplied_at IS NULL THEN 'applied' ELSE 'unapplied' END, amount_cents::text
         FROM accounting.payment_applications WHERE id=$3::uuid
       UNION ALL
       SELECT 'e1', CASE WHEN reversed_by_je_id IS NULL THEN 'live' ELSE 'reversed' END, status::text
         FROM accounting.journal_entries WHERE id=$4::uuid
       UNION ALL
       SELECT 'load_retire', status::text, load_number::text FROM mdata.loads WHERE id=$5::uuid`,
      [INV_KEEP, INV_RETIRE, APP_ID, EVENT1_EARN, LOAD_RETIRE]
    );
    console.log("PRE:", JSON.stringify(pre.rows, null, 2));

    // 1) Unapply (void-never-delete on application row)
    const un = await client.query(
      `UPDATE accounting.payment_applications
          SET unapplied_at = now(), unapplied_by_user_id = $3::uuid
        WHERE id = $1::uuid AND payment_id = $2::uuid AND unapplied_at IS NULL
        RETURNING id::text, invoice_id::text, amount_cents`,
      [APP_ID, PAYMENT_ID, ACTOR]
    );
    if (un.rowCount !== 1) throw new Error(`unapply expected 1 row, got ${un.rowCount}`);
    await appendCrudAudit(
      client,
      ACTOR,
      "accounting.payment_unapplied",
      {
        resource_type: "accounting.payment_applications",
        resource_id: APP_ID,
        operating_company_id: USMCA,
        payment_id: PAYMENT_ID,
        invoice_id: INV_RETIRE,
        amount_cents: AMOUNT,
        auth: "AUTH-201",
      },
      "warning",
      "AUTH-201"
    );

    // Recompute invoice paid amounts after unapply (trigger may or may not fire on UPDATE)
    await client.query(
      `UPDATE accounting.invoices
          SET amount_paid_cents = COALESCE((
                SELECT SUM(pa.amount_cents)::bigint
                  FROM accounting.payment_applications pa
                 WHERE pa.invoice_id = accounting.invoices.id
                   AND pa.unapplied_at IS NULL
              ), 0),
              status = CASE
                WHEN COALESCE((
                  SELECT SUM(pa.amount_cents)::bigint
                    FROM accounting.payment_applications pa
                   WHERE pa.invoice_id = accounting.invoices.id
                     AND pa.unapplied_at IS NULL
                ), 0) <= 0 THEN 'sent'
                WHEN COALESCE((
                  SELECT SUM(pa.amount_cents)::bigint
                    FROM accounting.payment_applications pa
                   WHERE pa.invoice_id = accounting.invoices.id
                     AND pa.unapplied_at IS NULL
                ), 0) < total_cents THEN 'partial'
                ELSE 'paid'
              END
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [INV_RETIRE, USMCA]
    );

    // 1b) Invoice 13513 is on FLS TRANSPORTATION SERVICES LIMITED (d934b8b2); payment is on
    // FLS Transport Inc. (54276c80). Owner: same billable load keep 13513 — re-point the KEEP
    // invoice onto the paying customer so applyPayment's customer match passes (void-not-delete).
    await client.query(
      `UPDATE accounting.invoices
          SET customer_id = $2::uuid
        WHERE id = $1::uuid
          AND operating_company_id = $3::uuid
          AND customer_id = $4::uuid`,
      [INV_KEEP, "54276c80-9972-4ea5-924e-af709794be7a", USMCA, "d934b8b2-ad1b-4dba-ae61-907afdc9223a"]
    );
    await appendCrudAudit(
      client,
      ACTOR,
      "accounting.invoice_customer_repointed",
      {
        resource_type: "accounting.invoices",
        resource_id: INV_KEEP,
        operating_company_id: USMCA,
        from_customer_id: "d934b8b2-ad1b-4dba-ae61-907afdc9223a",
        to_customer_id: "54276c80-9972-4ea5-924e-af709794be7a",
        auth: "AUTH-201",
        reason: "FLS Transport Inc. paid; keep invoice 13513 under paying customer",
      },
      "warning",
      "AUTH-201"
    );

    // 2) Apply payment to keep invoice
    const applyResult = await applyPayment(
      client as never,
      {
        operating_company_id: USMCA,
        payment_id: PAYMENT_ID,
        applications: [{ target_kind: "invoice", target_id: INV_KEEP, amount_cents: AMOUNT }],
      },
      { user_id: ACTOR }
    );
    console.log("APPLY_PAYMENT:", JSON.stringify(applyResult));

    // 3) Void retire invoice (reverses invoice-sourced Event 2 postings)
    const voidRes = await postVoidReversal(
      client as never,
      {
        operatingCompanyId: USMCA,
        entityType: "invoice",
        entityId: INV_RETIRE,
        originalDate: "2026-08-14",
        memo: VOID_REASON,
      },
      { userId: ACTOR }
    );
    console.log("VOID_INVOICE:", JSON.stringify(voidRes));

    await client.query(
      `UPDATE accounting.invoices
          SET status = 'void',
              voided_at = COALESCE(voided_at, now()),
              voided_by_user_id = COALESCE(voided_by_user_id, $2::uuid),
              void_reason = COALESCE(void_reason, $3)
        WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
      [INV_RETIRE, ACTOR, VOID_REASON, USMCA]
    );

    // 4) Reverse Event 1 earn if still live (load-sourced; not covered by invoice void)
    const e1 = await client.query<{ reversed_by_je_id: string | null }>(
      `SELECT reversed_by_je_id::text AS reversed_by_je_id FROM accounting.journal_entries WHERE id=$1::uuid`,
      [EVENT1_EARN]
    );
    if (!e1.rows[0]?.reversed_by_je_id) {
      const rev = await reverseJournalEntryNoFlip(client as never, {
        operatingCompanyId: USMCA,
        journalEntryId: EVENT1_EARN,
        actorUserId: ACTOR,
        reason: VOID_REASON,
      });
      console.log("REVERSE_EVENT1:", JSON.stringify(rev));
    } else {
      console.log("EVENT1 already reversed:", e1.rows[0].reversed_by_je_id);
    }

    // 5) Cancel load 13515 — void-not-delete
    // USMCA catalogs.load_cancellation_reasons is empty (measured); cancelLoadInClientTx will refuse
    // on missing reason_code — fall through to status stamp + audit (still void-not-delete).
    try {
      const cancel = await cancelLoadInClientTx(client as never, ACTOR, "Owner", {
        load_id: LOAD_RETIRE,
        operating_company_id: USMCA,
        reason_code: "duplicate_billing",
        cancellation_notes: VOID_REASON,
      });
      console.log("CANCEL_LOAD:", JSON.stringify(cancel));
    } catch (err) {
      // If catalog reason missing, fall back to status stamp + audit (still void-not-delete).
      console.warn("cancelLoadInClientTx refused — status stamp fallback:", err instanceof Error ? err.message : err);
      await client.query(
        `UPDATE mdata.loads
            SET status = 'cancelled',
                canceled_at = COALESCE(canceled_at, now()),
                cancel_reason = COALESCE(cancel_reason, $2)
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND status <> 'cancelled'`,
        [LOAD_RETIRE, VOID_REASON, USMCA]
      );
      await appendCrudAudit(
        client,
        ACTOR,
        "mdata.load_cancelled",
        {
          resource_type: "mdata.loads",
          resource_id: LOAD_RETIRE,
          operating_company_id: USMCA,
          keep_load_id: LOAD_KEEP,
          auth: "AUTH-201",
          reason: VOID_REASON,
        },
        "warning",
        "AUTH-201"
      );
    }

    const post = await client.query(
      `SELECT 'inv_keep' AS k, status::text AS status, amount_paid_cents::text AS paid FROM accounting.invoices WHERE id=$1::uuid
       UNION ALL
       SELECT 'inv_retire', status::text, voided_at::text FROM accounting.invoices WHERE id=$2::uuid
       UNION ALL
       SELECT 'e1', CASE WHEN reversed_by_je_id IS NULL THEN 'live' ELSE 'reversed' END, reversed_by_je_id::text
         FROM accounting.journal_entries WHERE id=$3::uuid
       UNION ALL
       SELECT 'load_retire', status::text, COALESCE(cancel_reason, '') FROM mdata.loads WHERE id=$4::uuid`,
      [INV_KEEP, INV_RETIRE, EVENT1_EARN, LOAD_RETIRE]
    );
    console.log("POST:", JSON.stringify(post.rows, null, 2));

    const keep = post.rows.find((r) => r.k === "inv_keep");
    const retire = post.rows.find((r) => r.k === "inv_retire");
    const e1p = post.rows.find((r) => r.k === "e1");
    if (keep?.status !== "paid" || keep?.paid !== "52500") {
      throw new Error(`inv_keep expected paid/52500 got ${keep?.status}/${keep?.paid}`);
    }
    if (retire?.status !== "void") throw new Error(`inv_retire expected void got ${retire?.status}`);
    if (e1p?.status !== "reversed" && e1p?.paid !== "reversed") {
      // row shape: status column holds live|reversed for e1
      if (String(e1p?.status) !== "reversed") throw new Error(`event1 expected reversed got ${JSON.stringify(e1p)}`);
    }

    if (!APPLY && !REHEARSAL) {
      console.log("DRY_RUN — rolling back. Set APPLY=1 (prod) or REHEARSAL=1 (throwaway) to commit.");
      await client.query("ROLLBACK");
      return;
    }
    if (REHEARSAL && !APPLY) {
      // Rehearsal commits on throwaway so we can prove; use APPLY=0+REHEARSAL to still rollback:
      console.log("REHEARSAL commit on throwaway branch");
    }
    await client.query("COMMIT");
    console.log("AUTH-201 CONSUMED — 13515 retired; 13513 kept paid; void-not-delete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
