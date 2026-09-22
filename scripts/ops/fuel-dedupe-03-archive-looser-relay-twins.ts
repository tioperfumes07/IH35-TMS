#!/usr/bin/env tsx
// ROUND 43 FOLLOW-UP, item 1 of 4 (Lead, 2026-09-22, second wave): "THE 33 RELAY LINES THAT DO
// HAVE A TWIN... Your exact-match dedupe missed them. LOOSER TEST: same unit OR card OR driver,
// date +-1 day, gallons +-1 OR cost +-$2. Per pair: confirm from the source document -> archive +
// reverse the RELAY-minted row -> then MATCH the Relay bank line to the STATEMENT expense... ANY
// PAIR THE RULE DOES NOT DECIDE -> FILE IT."
//
// Applied the looser rule live (excluding already-archived rows on BOTH sides -- the raw SQL
// candidate pool from fuel-dedupe-01 stayed in scope, which produced several false "still needs
// archiving" hits against rows I had already correctly archived in that earlier pass). Found 17
// live candidate pairs (not the Lead's own 23 -- reported honestly, not forced to match by
// loosening the rule further). Of those 17, cross-referenced each against the AlwaysTrack
// ground-truth fuel_purchases entries (same evidence source fuel-dedupe-01 used) -- 8 resolve with
// an EXACT dollar match confirming the STATEMENT-side row as the real purchase and the RELAY-side
// ('other' source) row as the duplicate. 2 of the 8 (4c05947a, 96abcc58) additionally reveal a
// real mis-link: the relay row claims a DIFFERENT load (13597) than where AlwaysTrack actually
// attributes the purchase (13580 / 13589) -- archiving removes both defects at once.
//
// The remaining 9 of 17 have NO AlwaysTrack ground-truth entry for either candidate load, and no
// Dreamline CSV coverage exists for their date range (2026-09-03 through 2026-09-11 is a confirmed
// gap in the CSV for the affected units -- checked directly, not assumed) -- undecidable from any
// source document on hand. FILED, not archived, per the ruling's own explicit instruction.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

type ArchiveEntry = { archive_id: string; survivor_id: string; evidence: string };

const ARCHIVE_LIST: ArchiveEntry[] = [
  { archive_id: "363f7560-1a6d-4138-bc76-02bdffae7a0c", survivor_id: "6e4be202-f4e5-4840-940c-ee45de8f77f6", evidence: "AlwaysTrack 13557: invoice 99462408, actual=840.00 exact match on survivor; relay row 146.879gal @ $722.85 has no ground-truth home." },
  { archive_id: "1b4b3c52-c077-4dac-8f55-e84a4aff56ba", survivor_id: "466b5c13-fefc-4ec5-8337-e7bcfcab3db7", evidence: "AlwaysTrack 13551: invoice 2245936, actual=390.00 exact match on survivor; relay row (unlinked, no load_id) 71.573gal @ $373.36 is the duplicate." },
  { archive_id: "7db90583-8f9d-4316-921a-16279e918e7a", survivor_id: "a63db45a-364c-41e7-9fe5-6537019c9680", evidence: "AlwaysTrack 13561: invoice 2886913, actual=340.41 exact match on survivor; relay row 62.016gal @ $306.57 has no ground-truth home." },
  { archive_id: "e05bee5e-4bd7-4621-877b-77e4657cdd7b", survivor_id: "945934c6-c50c-4bf1-b2cf-ec2cc7bab2da", evidence: "AlwaysTrack 13575: invoice 99858171, actual=390.00 exact match on survivor; relay row 64.05gal @ $341.34 has no ground-truth home." },
  { archive_id: "fd7df9d4-418a-4fd9-9fee-e2c41b66f42d", survivor_id: "e7db2549-01f1-49da-b3fc-f2cd32510ac8", evidence: "AlwaysTrack 13574: invoice 99036374, actual=790.00 exact match on survivor; relay row 132.795gal @ $692.99 has no ground-truth home." },
  { archive_id: "ba1817a6-2021-442d-8cf4-979d56b37539", survivor_id: "32401b36-ecff-47af-96b7-50f7d2a576b4", evidence: "AlwaysTrack 13589: invoice 99186757, actual=759.89 exact match on survivor; relay row 119.409gal @ $655.61 has no ground-truth home." },
  { archive_id: "4c05947a-116b-43df-9672-9e3ab5c314c0", survivor_id: "c1a49720-221f-4353-9cb9-7535bf009bce", evidence: "AlwaysTrack 13580: invoice 99519143, actual=340.00 exact match on survivor (already-linked to 13580, confirmed in fuel-dedupe-01's own archive list); relay row MIS-LINKED to a different load (13597) -- archiving corrects both the duplicate and the mis-link." },
  { archive_id: "96abcc58-adc6-40e1-893d-87d4cb30152b", survivor_id: "0fe6303e-f099-487c-9b8d-082ae9b78e2e", evidence: "AlwaysTrack 13589: invoice 99055485, actual=490.00 exact match on survivor; relay row MIS-LINKED to a different load (13597) -- same correction as above." },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");
  const dryRun = !process.argv.includes("--execute");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  console.log(`fuel-dedupe-03: ${dryRun ? "DRY RUN" : "EXECUTE"} -- ${ARCHIVE_LIST.length} rows targeted for archival`);

  let archivedCount = 0;
  let archivedCents = 0;
  for (const entry of ARCHIVE_LIST) {
    const row = await client.query<{ id: string; archived_at: string | null; total_cost: string; notes: string | null }>(
      `SELECT id::text, archived_at::text, total_cost::text, notes FROM fuel.fuel_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [entry.archive_id, USMCA_COMPANY_ID]
    );
    const r = row.rows[0];
    if (!r) {
      console.error(`  SKIP ${entry.archive_id}: not found`);
      continue;
    }
    if (r.archived_at) {
      console.log(`  SKIP ${entry.archive_id}: already archived at ${r.archived_at}`);
      continue;
    }
    const note = `FUEL-DEDUPE-03 (2026-09-22, Round 43 follow-up item 1): archived as a duplicate of survivor ${entry.survivor_id}. Evidence: ${entry.evidence}`;
    const combinedNotes = r.notes ? `${r.notes}\n${note}` : note;
    console.log(`  ${dryRun ? "WOULD ARCHIVE" : "ARCHIVING"} ${entry.archive_id} ($${r.total_cost}) -- survivor ${entry.survivor_id}`);
    archivedCount += 1;
    archivedCents += Math.round(Number(r.total_cost) * 100);
    if (!dryRun) {
      await client.query(
        `UPDATE fuel.fuel_transactions SET archived_at = now(), notes = $2, updated_at = now() WHERE id = $1::uuid`,
        [entry.archive_id, combinedNotes]
      );
    }
  }

  console.log(`\nfuel-dedupe-03: ${archivedCount} row(s) ${dryRun ? "would be" : ""} archived, $${(archivedCents / 100).toFixed(2)} total.`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
