#!/usr/bin/env -S npx tsx
/**
 * AUTH-140 -- ROUND 285.2.1-R: execute the classification (REVERSE 36 / REINSTATE 5) for the 41
 * factoring_advances records, per docs/audit/GUARD-WORKORDERS.md's FACTORING-41-LIVE-DOUBLE-COUNT
 * finding. See that finding and AUTH-140 for the full evidence; this script only executes it.
 *
 * REVERSE: postVoidReversal (entityType:'factoring_advance') -- one transaction per record. These
 *   36 currently have a LIVE TWIN elsewhere already correctly posting the same cash; reversing
 *   removes the duplicate, leaves the twin standing alone.
 * REINSTATE: reinstateDocument(type:'factoring_advance', restoreStatus:'advanced') -- these 5 have
 *   NO live twin anywhere; the void flag is the lie, the live posting is the only (correct)
 *   representation of real cash Faro's own export confirms arrived.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth140-classify-execute-41-factoring-advances.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-140";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const REVERSE_IDS: Array<{ id: string; display_id: string; date: string }> = [
  { id: "3deb5c6b-ede5-4ef1-99a8-14c4e28a4093", display_id: "FAC-2026-00047", date: "2026-09-03" },
  { id: "c4135326-0d17-49a0-a529-494e21ae4229", display_id: "FAC-2026-00049", date: "2026-09-04" },
  { id: "715871cd-8792-4d42-bd71-67786f690ef4", display_id: "FAC-2026-00050", date: "2026-09-04" },
  { id: "12ed0f66-e912-4987-9af8-f42ecd5bcd98", display_id: "FAC-2026-00051", date: "2026-09-08" },
  { id: "a3d02d96-0c3e-4a4a-a5c2-ff924485bab3", display_id: "FAC-2026-00052", date: "2026-09-08" },
  { id: "848b0038-c151-4ca4-b938-e44ee863e3ab", display_id: "FAC-2026-00053", date: "2026-09-08" },
  { id: "13df2248-64fc-49c9-a756-007a08f4958b", display_id: "FAC-2026-00054", date: "2026-09-08" },
  { id: "3b68e8e7-14ab-4936-b92c-19332231b2c3", display_id: "FAC-2026-00055", date: "2026-09-08" },
  { id: "afa05f35-b653-41ac-92a0-25feb3fca802", display_id: "FAC-2026-00056", date: "2026-09-10" },
  { id: "3fb5ed8b-2e05-446f-bc98-a5234947e1d6", display_id: "FAC-2026-00057", date: "2026-09-10" },
  { id: "9d0cf33f-9cbf-4eed-9ee0-51ef072f539a", display_id: "FAC-2026-00058", date: "2026-09-11" },
  { id: "89e88642-353c-4c69-a03e-6145560d34af", display_id: "FAC-2026-00059", date: "2026-09-11" },
  { id: "ddfd1b8c-a20c-460f-b42b-768d0d9ba421", display_id: "FAC-2026-00060", date: "2026-09-11" },
  { id: "187d0386-b1e1-4181-9d02-4760478c4f0a", display_id: "FAC-2026-00061", date: "2026-09-11" },
  { id: "cba06b11-612d-41e6-a1ea-ddd14f005eb0", display_id: "FAC-2026-00062", date: "2026-09-11" },
  { id: "83b34f22-f36e-45c4-b259-39f1c56b09a3", display_id: "FAC-2026-00066", date: "2026-09-14" },
  { id: "bbc2597b-e740-472d-837d-8fae9935d89c", display_id: "FAC-2026-00067", date: "2026-09-14" },
  { id: "3f679023-18a8-4343-847d-e557e49bb6e9", display_id: "FAC-2026-00068", date: "2026-09-14" },
  { id: "134ed807-5cc9-41a7-8a43-71998d520c25", display_id: "FAC-2026-00069", date: "2026-09-14" },
  { id: "ebf46cea-03a3-498c-982f-fcf15007bfbf", display_id: "FAC-2026-00070", date: "2026-09-14" },
  { id: "e409769c-a618-4233-aa16-6788abfa5cca", display_id: "FAC-2026-00071", date: "2026-09-17" },
  { id: "b49e47b1-e057-4f96-9626-df9ea2acc6a1", display_id: "FAC-2026-00072", date: "2026-09-17" },
  { id: "51a844cb-0985-44ff-a2df-49fda17f5373", display_id: "FAC-2026-00073", date: "2026-09-18" },
  { id: "fe658d97-002c-4754-bf0a-53cfbee560b3", display_id: "FAC-2026-00074", date: "2026-09-18" },
  { id: "52d17900-c8d5-4c36-ac82-921a4fc4e573", display_id: "FAC-2026-00076", date: "2026-09-18" },
  { id: "eb05c290-4de9-4b47-b9dd-2b50b885cc53", display_id: "FAC-2026-00077", date: "2026-09-18" },
  { id: "779d5e2d-c4c6-45de-9024-104ffea55344", display_id: "FAC-2026-00078", date: "2026-09-18" },
  { id: "dce6834c-624c-40aa-b485-ccb1bcf74c2e", display_id: "FAC-2026-00079", date: "2026-09-18" },
  { id: "86d9a162-5835-4395-864b-e02ba3ad0c6f", display_id: "FAC-2026-00080", date: "2026-09-21" },
  { id: "5038df26-f95b-434f-8f57-4b1ab7364b5c", display_id: "FAC-2026-00081", date: "2026-09-21" },
  { id: "280b0225-eae8-4e35-ba73-d4984c3eba2a", display_id: "FAC-2026-00083", date: "2026-09-04" },
  { id: "5e38e177-02b5-4d39-841c-b7492781eb9f", display_id: "FAC-2026-00084", date: "2026-09-03" },
  { id: "d0cdf081-f964-4e6d-87db-27f2ecffd120", display_id: "FAC-2026-00086", date: "2026-09-21" },
  { id: "27862cbc-9ed8-4ea3-a883-ab9df789b32e", display_id: "FAC-2026-00087", date: "2026-09-21" },
  { id: "449b660c-9c75-4d29-903f-25d4f9e08abf", display_id: "FAC-2026-00088", date: "2026-09-21" },
  { id: "94f29401-8c4f-4321-b1ad-20bccf99a87e", display_id: "FAC-2026-00089", date: "2026-09-21" },
  // RE-CLASSIFIED just before execution (2026-09-30, ~05:00 UTC): FAC-2026-00090's twin,
  // FAC-2026-00097, was VOIDED with 0 live lines at classification time (correctly REINSTATE then)
  // -- but CC-1's AUTH-144 (consumed minutes later, same session) reposted FAC-2026-00097 for real
  // reasons unrelated to this round (load 13619's true Faro identity), flipping it to
  // status='advanced' with 4 live lines. Reinstating FAC-2026-00090 now would create a NEW live
  // double-count against that freshly-live twin -- re-verified live immediately before this
  // execution, moved from REINSTATE to REVERSE to match every other twin-having record's rule.
  { id: "75e07f0c-5e10-4b92-a0c0-7e0b2de80099", display_id: "FAC-2026-00090", date: "2026-09-08" },
];

const REINSTATE_IDS: Array<{ id: string; display_id: string }> = [
  { id: "43bf2fc5-4984-4b56-8d13-7eeaf244d080", display_id: "FAC-2026-00048" },
  { id: "7b2da4bc-fcf0-4649-a3a6-ebbac086666c", display_id: "FAC-2026-00063" },
  { id: "5c44b184-aecc-4132-8247-7543f14e618a", display_id: "FAC-2026-00064" },
  { id: "e9f9df8a-a91c-46b4-a5bf-0dced674b933", display_id: "FAC-2026-00082" },
];

async function sums(client: pg.Client) {
  const r = await client.query(
    `SELECT a.account_number,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
       FROM catalogs.accounts a
       LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
       LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
      WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '2150', '6300', '6400')
      GROUP BY a.account_number ORDER BY a.account_number`,
    [USMCA]
  );
  return r.rows;
}

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
  const { reinstateDocument } = await import(path.join(ROOT, "apps/backend/src/accounting/reinstate-document.service.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  console.log("BEFORE:", await sums(client));

  let reversedOk = 0, reinstatedOk = 0;
  const failures: Array<{ id: string; op: string; error: string }> = [];

  for (const rec of REVERSE_IDS) {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE neondb_owner");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const reversal = await (postVoidReversal as any)(
        client,
        {
          operatingCompanyId: USMCA,
          entityType: "factoring_advance",
          entityId: rec.id,
          originalDate: rec.date,
          memo: `ROUND 285.2.1-R: reverse duplicate live posting on voided factoring advance ${rec.display_id} -- a live twin already correctly represents this cash (see docs/audit/GUARD-WORKORDERS.md FACTORING-41-LIVE-DOUBLE-COUNT)`,
        },
        { userId: ACTOR_USER_ID }
      );
      const liveAfter = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM accounting.journal_entry_postings jep
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          WHERE jep.source_transaction_type = 'factoring_advance' AND jep.source_transaction_id = $1::text
            AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
        [rec.id]
      );
      if (Number(liveAfter.rows[0].n) !== 0) throw new Error(`live count did not reach 0 (after=${liveAfter.rows[0].n})`);
      console.log(`REVERSE ${rec.display_id}: live -> 0, reversal_je=${reversal.reversal_journal_entry_id}`);
      if (APPLY) await client.query("COMMIT"); else await client.query("ROLLBACK");
      reversedOk++;
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`FAILED REVERSE ${rec.display_id}: ${e.message}`);
      failures.push({ id: rec.id, op: "reverse", error: e.message });
    }
  }

  for (const rec of REINSTATE_IDS) {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE neondb_owner");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const result = await (reinstateDocument as any)(client, {
        operatingCompanyId: USMCA,
        type: "factoring_advance",
        id: rec.id,
        reason: `ROUND 285.2.1-R: no live twin exists anywhere for ${rec.display_id}; Faro's own payment-report export confirms a real same-day, same-amount invoice payment -- the void flag was the error, the live posting is real (see docs/audit/GUARD-WORKORDERS.md FACTORING-41-LIVE-DOUBLE-COUNT)`,
        actor: { userId: ACTOR_USER_ID },
        restoreStatus: "advanced",
      });
      const check = await client.query<{ status: string; voided_at: string | null }>(
        `SELECT status, voided_at::text FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [rec.id, USMCA]
      );
      if (check.rows[0]?.status !== "advanced" || check.rows[0]?.voided_at !== null) {
        throw new Error(`unexpected post-reinstate state: ${JSON.stringify(check.rows[0])}`);
      }
      // NOTE: reinstateDocument's own contract says the caller "MUST void reinstatedFromVoidJeId
      // via voidJournalEntry when non-null" -- deliberately NOT done here. For these 5 records,
      // findVoidReversalJournalEntryId's own lookup (same "picks a stale historical JE regardless
      // of liveness" shape as the void.service.ts bug fixed in this same PR) returns the reversal
      // of an OLD, unrelated, already-dead historical JE for this source (verified: these ids
      // predate the record's own live posting and were never live themselves) -- not a reversal of
      // anything actually connected to the live posting this reinstate is correcting. Voiding it
      // would incorrectly resurrect that dead original as if live again. The document-level
      // metadata (status/voided_at) is exactly what needed correcting and is now correct; the
      // stored reinstated_from_void_je_id is an inert breadcrumb column with no live-constraint
      // consequence either way. Named here, not silently skipped -- a 3rd latent bug in the same
      // family, out of scope for this pass (zero financial impact from leaving it as-is).
      console.log(`REINSTATE ${rec.display_id}: status -> advanced, voided_at cleared, result=${JSON.stringify(result)}`);
      if (APPLY) await client.query("COMMIT"); else await client.query("ROLLBACK");
      reinstatedOk++;
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`FAILED REINSTATE ${rec.display_id}: ${e.message}`);
      failures.push({ id: rec.id, op: "reinstate", error: e.message });
    }
  }

  console.log(
    `\n${reversedOk}/${REVERSE_IDS.length} reversed, ${reinstatedOk}/${REINSTATE_IDS.length} reinstated, ${failures.length} failed (${APPLY ? "applied" : "dry-run, all rolled back"})`
  );
  if (failures.length) console.log("FAILURES:", JSON.stringify(failures, null, 2));

  console.log("AFTER:", await sums(client));

  await client.end();
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
