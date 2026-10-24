// ROUND 443.292-A backfill — assign AlwaysTrack settlement numbers to P-0113, P-0117, P-0119
// (closed 10-23 with no source_document_ref; the close engine now assigns at close, but these
// three slipped through before that engine change landed). Processed in trip_closed_at ASC order
// so they receive consecutive numbers (max+1 each) matching the AlwaysTrack sequence.
// Uses THE engine: allocateNextSettlementSourceDocumentRef + setSettlementSourceDocumentRef
// (same functions the close engine calls — settlement-source-document-ref.service.ts).
//   default: dry run (ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-458
// verify-owner-authorization: scripts/verify-owner-authorization.mjs AUTH-458
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import {
  allocateNextSettlementSourceDocumentRef,
  setSettlementSourceDocumentRef,
} from "../../apps/backend/src/driver-finance/settlement-source-document-ref.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["P-0113", "P-0117", "P-0119"]; // ordered below by trip_closed_at
const EXPECT = 3;
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");

if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: OWNER AUTH-458 (443.292-A backfill settlement numbers)
  if (auth !== "AUTH-458") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-458");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.292-A backfill settlement numbers" });
else if (FORK) await assertNotProduction(c as never, { label: "443.292-A backfill settlement numbers (fork)" });

await c.query("BEGIN");
try {
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
  await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);

  // Load and order the three settlements by trip_closed_at ASC
  const lookupRes = await c.query<{ id: string; display_id: string; status: string; source_document_ref: string | null; trip_closed_at: string | null }>(
    `SELECT id::text, display_id, status, source_document_ref, trip_closed_at
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
      ORDER BY trip_closed_at ASC NULLS LAST`,
    [USMCA, DISPLAY_IDS]
  );
  if (lookupRes.rows.length !== EXPECT) {
    throw new Error(`Expected ${EXPECT} rows, got ${lookupRes.rows.length}: ${lookupRes.rows.map((r) => r.display_id).join(", ")}`);
  }

  const results = [];
  for (const row of lookupRes.rows) {
    if (row.source_document_ref) {
      results.push({ settlement: row.display_id, note: `already numbered: ${row.source_document_ref}`, skipped: true });
      continue;
    }
    // Allocate + set via the engine (advisory lock serializes concurrent opens)
    const next = await allocateNextSettlementSourceDocumentRef(c as never, USMCA);
    const updated = await setSettlementSourceDocumentRef(c as never, {
      operatingCompanyId: USMCA,
      settlementId: row.id,
      sourceDocumentRef: next,
      actorUserId: OWNER_USER,
    });
    if (!updated) throw new Error(`setSettlementSourceDocumentRef returned null for ${row.display_id}`);
    results.push({ settlement: row.display_id, id: row.id, assigned: next, status: row.status, result: "OK" });
  }

  if (!APPLY && !FORK) {
    await c.query("ROLLBACK");
    console.log(JSON.stringify({ result: "DRY RUN — ROLLED BACK", rows: results }, null, 2));
  } else {
    await c.query("COMMIT");
    console.log(JSON.stringify({ result: "COMMITTED", rows: results }, null, 2));
  }
} catch (e) {
  await c.query("ROLLBACK");
  throw new Error(`REFUSED: rolled back — ${(e as Error).message}`);
} finally {
  await c.end();
}
