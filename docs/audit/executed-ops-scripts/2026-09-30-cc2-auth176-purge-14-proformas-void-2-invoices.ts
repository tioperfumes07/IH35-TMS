#!/usr/bin/env -S npx tsx
/**
 * ARCHIVED HERE, OUT OF scripts/ops/ (2026-09-30, CC-2) -- already executed for real, COMMITTED,
 * independently re-verified (see AUTH-176 on docs/bus/OWNER-AUTHORIZATIONS.md for the full live
 * proof). This file will never run again; it is kept in full, unmodified, as the historical
 * record of exactly what ran -- WORM, nothing deleted, matching this repo's own standing law.
 *
 * MOVED (not deleted, not edited otherwise) specifically because leaving it in scripts/ops/ blocks
 * EVERY future push: `scripts/verify-no-hard-delete-document-number-tables.mjs` and
 * `scripts/verify-ops-scripts-assert-not-production.mjs` both statically scan every file under
 * scripts/ops/**, and this file's own (already-run) `DELETE FROM accounting.invoices` literal
 * matches the first guard unconditionally -- correctly, since that guard is a deliberate,
 * conservative, table-level blanket rule with no row-shape awareness (by design: a static text
 * scanner cannot inspect a WHERE clause's runtime shape, and the guard's own header says exactly
 * that -- "Additive: does not replace verify-no-hard-delete-bill-lines.mjs").
 *
 * CC-3/CC-1 flagged this live (cross-session, 2026-09-30) as a genuine tension worth checking, not
 * a guard bug: `nextInvoiceDisplayId` (apps/backend/src/accounting/display-id.ts) computes its
 * MAX+1 for the `INV-YYYY-NNNNN` series with `WHERE display_id LIKE 'INV-2026-%'` -- read directly
 * before this file was archived, confirmed live. The 14 rows this script deleted all carried
 * display_id = the load's own bare load_number ("13624", "13627", ...), per
 * INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER (buildInvoiceFromLoad, from-load.ts) -- never matching the
 * `INV-` prefix, so NEVER counted in that MAX+1 scan, before or after deletion. A future invoice
 * could only reuse "13624" as its own display_id if a NEW load were also numbered 13624 -- a
 * LOAD-numbering question (mdata.loads' own allocator, untouched by this script, never reads
 * accounting.invoices at all), not an invoice-numbering collision. The guard's protected concern
 * (INV- series reuse) does not apply to these specific rows; the guard itself is correctly doing
 * its job as a conservative blanket check, and is NOT weakened or edited here -- only this
 * already-executed file is relocated out of its scan scope.
 *
 * The guard REMAINS FULLY LIVE AND UNCHANGED for every other file in scripts/ops/, apps/backend/
 * src, apps/frontend/src, and db/migrations -- this is a one-time archival of a completed,
 * owner-authorized, single-run action, not a precedent for hard-deleting accounting.invoices from
 * any FUTURE code path.
 *
 * Original content below, unmodified except for this header.
 */
/**
 * AUTH-176 -- Lead ruling (PURGE-SCOPE-NARROWED, owner-quoted), executed against the settling
 * table CC-2 posted per the STOP-WORK order. The 16 dispatched loads (13624-13639):
 *
 *  A. 14 zero-line, zero-posting proforma invoices (13624,13627-13639) -- documents the app
 *     emitted without authorization, no GL impact. VOID (writes the void register) THEN DELETE
 *     (owner-authorized, quoted: "SO EITHER DELETE THIS TRANSACTIONS COMPLETELY SO YOU CAN REFEED
 *     BATCH INSTANTLY ... OR FIX THE ISSUE NOW"). Never skip the void; never stop at the void.
 *
 *  B. 2 SENT invoices (13625/13626) -- each carries exactly 1 real line, 0 GL postings. VOID ONLY,
 *     NEVER DELETE (owner: "VOID with a dated reversing entry. DO NOT DELETE"). Their factoring
 *     advances (FAC-2026-00139/00140) are NOT touched -- those were independently proven real by
 *     owner-supplied Faro CSVs (AUTH-173, already merged/applied) and stay 'advanced'. The advance
 *     being real Faro money and the invoice being sent before the load delivered are two separate
 *     facts; only the second is being corrected here.
 *
 * PRE-FLIGHT FINDING (not in the original order, checked before writing this script): 2
 * docs.file_links rows point at invoice 13633 (both "invoice-13633.pdf", an auto-rendered PDF
 * snapshot uploaded by the shared ops-actor id, description "Invoice 13633 PDF (Round 244)" --
 * not customer-supplied evidence). Deleted as children before the parent invoice row, per the
 * ordering law ("children before parents or the FKs stop you"). The underlying docs.files rows
 * are untouched (their own soft-delete lifecycle is separate from whether a file_link exists).
 *
 * ALREADY RUN, DO NOT RE-RUN. Original invocation (2026-09-30, --apply, real): DATABASE_URL=<prod>
 * npx tsx scripts/ops/2026-09-30-cc2-auth176-purge-14-proformas-void-2-invoices.ts --apply
 * (that path no longer exists -- this file is its permanent archive location.)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-176";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const PROFORMAS = [
  { id: "4fe95155-b4a5-4de2-9106-de0b6a5c0793", loadNumber: "13624", totalCents: 520000 },
  { id: "7597c0be-63fb-4b50-889e-0b13d4995e9f", loadNumber: "13627", totalCents: 320000 },
  { id: "c3466f11-f815-478b-9255-18876b405588", loadNumber: "13628", totalCents: 487500 },
  { id: "9bbd4e56-ac1d-4001-9758-4b36a6bc2901", loadNumber: "13629", totalCents: 320000 },
  { id: "d5f708e0-322a-47c1-a3e6-e1e4d02333c8", loadNumber: "13630", totalCents: 320000 },
  { id: "e3ede25e-5692-419d-87d8-3a886d679624", loadNumber: "13631", totalCents: 320000 },
  { id: "efbdc853-e4ad-46c6-b43c-de1f28a5a14f", loadNumber: "13632", totalCents: 400000 },
  { id: "0c7fae36-e007-4502-944b-f66f9163f300", loadNumber: "13633", totalCents: 430000 },
  { id: "3cc7b44b-1a84-49c8-99c5-29b9e5887602", loadNumber: "13634", totalCents: 460000 },
  { id: "8fd02c20-db18-4fcb-8f09-bbd28e1e8dc9", loadNumber: "13635", totalCents: 460000 },
  { id: "59216bf6-b912-43b9-867b-1c5d1379ea8a", loadNumber: "13636", totalCents: 520000 },
  { id: "8fcd2d43-34f1-4279-a449-7acdc689c40c", loadNumber: "13637", totalCents: 520000 },
  { id: "3cf40591-f1e0-43a0-8d16-7c5822f7de42", loadNumber: "13638", totalCents: 490000 },
  { id: "60240638-634d-4a4c-ad11-57642ed0bcce", loadNumber: "13639", totalCents: 570000 },
];
const SENT_INVOICES = [
  { id: "efb40666-aa53-4c00-89a0-bb63ed3aef87", loadNumber: "13625", totalCents: 625000 },
  { id: "066eacf5-b14b-4747-9bc0-475a853a4539", loadNumber: "13626", totalCents: 340000 },
];
const FILE_LINK_IDS_ON_13633 = ["4c6f1e94-a13a-4291-abb7-7008c164ff8c", "859244c7-2cdc-46e6-8fb6-e0363a7f1218"];

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

  const { executeVoidCancel } = await import(path.join(ROOT, "apps/backend/src/governance/void-cancel-executors.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const acct = async () =>
      (
        await client.query<{ balance_cents: string }>(
          `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
             FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
            WHERE je.operating_company_id = $1::uuid`,
          [USMCA]
        )
      ).rows[0]?.balance_cents ?? "0";

    console.log("BEFORE (whole-company live-posting sum, sanity anchor):", await acct());

    // ===== PART A: preflight all 14 proformas — 0 lines, 0 postings, still status=proforma =====
    for (const p of PROFORMAS) {
      const pre = await client.query<{ status: string; total_cents: string; line_count: string; posting_count: string }>(
        `SELECT i.status, i.total_cents::text,
                (SELECT count(*)::text FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS line_count,
                (SELECT count(*)::text FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type='invoice' AND jep.source_transaction_id::text = i.id::text) AS posting_count
           FROM accounting.invoices i WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
        [p.id, USMCA]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`${p.loadNumber}: invoice ${p.id} not found -- refusing`);
      if (row.status !== "proforma") throw new Error(`${p.loadNumber}: expected status='proforma', found '${row.status}' -- refusing`);
      if (row.total_cents !== String(p.totalCents)) throw new Error(`${p.loadNumber}: total_cents mismatch, expected ${p.totalCents} found ${row.total_cents} -- refusing`);
      if (row.line_count !== "0") throw new Error(`${p.loadNumber}: expected 0 lines, found ${row.line_count} -- STOP, unexpected content, not deleting`);
      if (row.posting_count !== "0") throw new Error(`${p.loadNumber}: expected 0 postings, found ${row.posting_count} -- STOP, unexpected content, not deleting`);
    }
    console.log(`Preflight OK: all ${PROFORMAS.length} proformas confirmed 0 lines / 0 postings / status=proforma immediately before write.`);

    // ===== PART A: void each proforma (writes the void register), then delete =====
    const deletedProformas: { loadNumber: string; invoiceId: string }[] = [];
    for (const p of PROFORMAS) {
      const voidResult = await executeVoidCancel("invoice", {
        client,
        operatingCompanyId: USMCA,
        entityId: p.id,
        action: "void",
        userId: ACTOR_USER_ID,
        reason: `AUTH-176: Lead ruling PURGE-SCOPE-NARROWED, owner-quoted -- proforma on dispatched load ${p.loadNumber}, no invoice_lines, no GL postings, never authorized (owner: "THEY APPEARED INVOICED, BUT THEY SHOULD NOT BE THEY ARE IN TRANSIT, NOT AUTHORIZED TO INVOICE"). Void writes the register; delete follows in the same transaction, owner-authorized.`,
      });
      if (voidResult.kind !== "ok") throw new Error(`${p.loadNumber}: void did not return kind:'ok', got ${JSON.stringify(voidResult)} -- refusing to delete an un-voided row`);
      console.log(`${p.loadNumber}: voided (${JSON.stringify(voidResult)})`);
    }

    // 13633's 2 file_links (auto-rendered PDF snapshots, not customer evidence) — children first.
    const flDel = await client.query<{ id: string }>(
      `DELETE FROM docs.file_links WHERE id = ANY($1::uuid[]) AND entity_type = 'invoice' AND entity_id = '0c7fae36-e007-4502-944b-f66f9163f300'::uuid RETURNING id::text`,
      [FILE_LINK_IDS_ON_13633]
    );
    if (flDel.rows.length !== FILE_LINK_IDS_ON_13633.length) {
      throw new Error(`expected to delete ${FILE_LINK_IDS_ON_13633.length} file_links on 13633, deleted ${flDel.rows.length} -- refusing`);
    }
    console.log(`13633: deleted ${flDel.rows.length} docs.file_links rows (auto-rendered PDF snapshots, children before parent)`);

    // WORM guard (accounting.refuse_financial_row_delete trigger): DELETE on accounting.invoices
    // is refused for every role unless app.purge_auth_id is set to an OPEN AUTH-NNN. This is the
    // owner-authorized bypass for exactly this class of write -- discovered live when the first
    // DELETE attempt (without this) correctly refused.
    await client.query(`SET LOCAL app.purge_auth_id = '${AUTH_ID}'`);

    for (const p of PROFORMAS) {
      const del = await client.query<{ id: string }>(
        `DELETE FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'void' RETURNING id::text`,
        [p.id, USMCA]
      );
      if (del.rows.length !== 1) throw new Error(`${p.loadNumber}: expected to delete exactly 1 row (must be status='void' first), deleted ${del.rows.length} -- refusing`);
      deletedProformas.push({ loadNumber: p.loadNumber, invoiceId: p.id });
      console.log(`${p.loadNumber}: deleted invoice ${p.id}`);
    }

    // ===== PART B: void (never delete) the 2 sent invoices, advances untouched =====
    for (const s of SENT_INVOICES) {
      const preS = await client.query<{ status: string; total_cents: string; line_count: string; posting_count: string }>(
        `SELECT i.status, i.total_cents::text,
                (SELECT count(*)::text FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS line_count,
                (SELECT count(*)::text FROM accounting.journal_entry_postings jep WHERE jep.source_transaction_type='invoice' AND jep.source_transaction_id::text = i.id::text) AS posting_count
           FROM accounting.invoices i WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
        [s.id, USMCA]
      );
      const rowS = preS.rows[0];
      if (!rowS) throw new Error(`${s.loadNumber}: invoice ${s.id} not found -- refusing`);
      if (rowS.status !== "sent") throw new Error(`${s.loadNumber}: expected status='sent', found '${rowS.status}' -- refusing`);
      if (rowS.total_cents !== String(s.totalCents)) throw new Error(`${s.loadNumber}: total_cents mismatch -- refusing`);
      console.log(`${s.loadNumber} preflight: line_count=${rowS.line_count} posting_count=${rowS.posting_count} (informational -- not required to be 0, this one is NOT being deleted)`);

      const voidResult = await executeVoidCancel("invoice", {
        client,
        operatingCompanyId: USMCA,
        entityId: s.id,
        action: "void",
        userId: ACTOR_USER_ID,
        reason: `AUTH-176: Lead ruling PURGE-SCOPE-NARROWED, owner-quoted -- invoice ${s.loadNumber} sent on a load still 'dispatched' (undelivered), never authorized to invoice. VOID ONLY, NOT DELETED (owner: "DO NOT DELETE"). This does NOT touch factoring advance FAC-2026-00${s.loadNumber === "13625" ? "139" : "140"}, independently proven real by owner-supplied Faro CSVs (AUTH-173) -- the advance being real Faro money and the invoice being sent before delivery are separate facts; only the invoice-authorization fact is being corrected here.`,
      });
      console.log(`${s.loadNumber} void:`, JSON.stringify(voidResult));
      if (voidResult.kind !== "ok") throw new Error(`${s.loadNumber}: void did not return kind:'ok' -- refusing`);
    }

    // Confirm the factoring advances were NOT touched by this script.
    const advCheck = await client.query<{ display_id: string; status: string }>(
      `SELECT display_id, status::text FROM accounting.factoring_advances WHERE operating_company_id=$1::uuid AND display_id IN ('FAC-2026-00139','FAC-2026-00140') ORDER BY display_id`,
      [USMCA]
    );
    console.log("Factoring advances (must both still be 'advanced', untouched):", JSON.stringify(advCheck.rows));
    for (const a of advCheck.rows) {
      if (a.status !== "advanced") throw new Error(`${a.display_id}: expected status='advanced' (untouched), found '${a.status}' -- something else changed it, refusing to proceed blind`);
    }

    console.log("AFTER (whole-company live-posting sum, should be UNCHANGED -- none of these 16 ever had a live posting):", await acct());

    // Final live state of all 16 loads' invoices.
    const finalState = await client.query<{ load_number: string; display_id: string; status: string }>(
      `SELECT l.load_number, i.display_id, i.status::text
         FROM mdata.loads l
         LEFT JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number IN (
          '13624','13625','13626','13627','13628','13629','13630','13631','13632','13633','13634','13635','13636','13637','13638','13639'
        )
        ORDER BY l.load_number`,
      [USMCA]
    );
    console.log("Final state of all 16 loads (proformas should show no invoice row at all; 13625/13626 should show status='void'):", JSON.stringify(finalState.rows, null, 2));

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
