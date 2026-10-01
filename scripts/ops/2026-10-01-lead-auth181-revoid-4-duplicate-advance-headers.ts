#!/usr/bin/env -S npx tsx
/**
 * AUTH-181 (Lead, 2026-10-01) -- re-void the HEADERS of four duplicate factoring advances whose
 * GL is already clean. Header-only; executeVoidCancel must find NOTHING live to reverse.
 *
 * MEASURED LIVE 2026-10-01 (USMCA):
 *   FAC-2026-00048 (Faro inv 52, 9/4,  $6,115, load 13570)  twin FAC-2026-00094 live, inv 52 set
 *   FAC-2026-00063 (Faro inv 69, 9/11, $4,150, load 13589)  twin FAC-2026-00110 live, inv 69 set
 *   FAC-2026-00064 (Faro inv 70, 9/14, $4,120, load 13587)  twin FAC-2026-00111 live, inv 70 set
 *   FAC-2026-00082 (Faro inv 91, 9/21, $3,200, load 13611)  twin FAC-2026-00129 live, inv 91 set
 * History of each: funded 09-24 20:4x -> voided 09-24 22:50 (REPAIR-VOID-ZERO-ADV, twin re-created
 * REPAIR-OK) -> AUTH-140 re-posted a funding JE 09-30 01:16 -> R-191-UNIVERSAL-UNVOID flipped the
 * HEADER to live 09-30 05:28 ("no live twin" -- its check keyed on faro_invoice_number, NULL on the
 * voided copies) -> AUTH-165 reversed the AUTH-140 JE 09-30 09:11 ("real live twin FAC-2026-00094
 * already carries this") but never re-voided the header. Result: status='advanced', voided_at NULL,
 * 0 live tagged postings. verify-feed-is-whole counts headers -> 4 purchase days one invoice over
 * the manifest ($17,585), red for every migration PR. The owner's own 09-30 reconciliation lists
 * one Faro row per invoice 52/69/70/91.
 *
 * WRITES: header void via the sanctioned engine (executeVoidCancel 'factoring_advance', action
 * 'void') for exactly these 4 ids. Refuses if any of them has a live tagged posting (then it is
 * not header-only and the script is wrong, not the data), if the twin is not live, or if the
 * header is already voided. No deletes, no JE beyond what the engine itself writes (expected none).
 *
 * Run (dry run, refused on prod by design):  DATABASE_URL=<branch> npx tsx <this>
 * Apply:  OWNER_AUTH_ID=AUTH-181 DATABASE_URL=<prod> npx tsx <this> --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-181";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const DUPES = [
  { display: "FAC-2026-00048", id: "43bf2fc5-4984-4b56-8d13-7eeaf244d080", twin: "FAC-2026-00094", inv: "52", day: "2026-09-04", total: "611500" },
  { display: "FAC-2026-00063", id: "7b2da4bc-fcf0-4649-a3a6-ebbac086666c", twin: "FAC-2026-00110", inv: "69", day: "2026-09-11", total: "415000" },
  { display: "FAC-2026-00064", id: "5c44b184-aecc-4132-8247-7543f14e618a", twin: "FAC-2026-00111", inv: "70", day: "2026-09-14", total: "412000" },
  { display: "FAC-2026-00082", id: "e9f9df8a-a91c-46b4-a5bf-0dced674b933", twin: "FAC-2026-00129", inv: "91", day: "2026-09-21", total: "320000" },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    if (process.env.OWNER_AUTH_ID !== AUTH_ID) throw new Error(`OWNER_AUTH_ID must be ${AUTH_ID} for --apply`);
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  }
  const { executeVoidCancel } = await import(path.join(ROOT, "apps/backend/src/governance/void-cancel-executors.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, {
    label: "scripts/ops/2026-10-01-lead-auth181-revoid-4-duplicate-advance-headers.ts",
  });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const results: unknown[] = [];
    for (const d of DUPES) {
      const pre = (
        await client.query<{ status: string; voided_at: string | null; invoice_total_cents: string; faro_purchase_date: string; faro_invoice_number: string | null }>(
          `SELECT status, voided_at::text, invoice_total_cents::text, faro_purchase_date::date::text AS faro_purchase_date, faro_invoice_number
             FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [d.id, USMCA]
        )
      ).rows[0];
      if (!pre || pre.voided_at || pre.status !== "advanced" || pre.invoice_total_cents !== d.total || pre.faro_purchase_date !== d.day) {
        throw new Error(`${d.display}: preflight mismatch ${JSON.stringify(pre)} -- refusing`);
      }
      const live = (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
            WHERE jep.source_transaction_type='factoring_advance' AND jep.source_transaction_id::text=$1
              AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
          [d.id]
        )
      ).rows[0];
      if (live.n !== "0") throw new Error(`${d.display}: ${live.n} live tagged posting(s) -- NOT header-only, refusing (re-measure)`);
      const twin = (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM accounting.factoring_advances
            WHERE operating_company_id=$1::uuid AND display_id=$2 AND voided_at IS NULL AND status='advanced'
              AND faro_invoice_number=$3 AND invoice_total_cents=$4::bigint AND faro_purchase_date::date=$5::date`,
          [USMCA, d.twin, d.inv, d.total, d.day]
        )
      ).rows[0];
      if (twin.n !== "1") throw new Error(`${d.display}: live twin ${d.twin} (inv ${d.inv}) not found exactly once -- refusing`);

      const res = await executeVoidCancel("factoring_advance", {
        client,
        operatingCompanyId: USMCA,
        entityId: d.id,
        action: "void",
        userId: ACTOR_USER_ID,
        reason: `${AUTH_ID}: duplicate header of ${d.twin} (Faro inv ${d.inv}, ${d.day}); GL already clean since AUTH-165 reversed the AUTH-140 re-post; R-191-UNIVERSAL-UNVOID flipped only the header live because its twin check keyed on faro_invoice_number (NULL on this copy). Header-only void; owner's 09-30 reconciliation lists one Faro row for inv ${d.inv}.`,
      });
      if (res.kind !== "ok") throw new Error(`${d.display}: void engine returned ${JSON.stringify(res)} -- refusing`);
      if (res.reversing_entry_ref) throw new Error(`${d.display}: engine produced a reversal (${res.reversing_entry_ref}) but GL was measured clean -- refusing, re-measure`);
      results.push({ display: d.display, twin: d.twin, inv: d.inv, result: res });
    }
    const after = (
      await client.query<{ day: string; n: string; total: string }>(
        `SELECT faro_purchase_date::date::text AS day, count(*)::text AS n, sum(invoice_total_cents)::text AS total
           FROM accounting.factoring_advances WHERE operating_company_id=$1::uuid AND voided_at IS NULL
            AND faro_purchase_date::date IN ('2026-09-04','2026-09-11','2026-09-14','2026-09-21') GROUP BY 1 ORDER BY 1`,
        [USMCA]
      )
    ).rows;
    if (APPLY) { await client.query("COMMIT"); } else { await client.query("ROLLBACK"); }
    console.log(JSON.stringify({ result: APPLY ? "COMMITTED" : "DRY RUN -- rolled back", voided: results, after_by_day: after }, null, 2));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
