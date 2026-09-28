#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r182-fuel-location-backfill.ts — ROUND 182 item 5.
 *
 * The 450 settlement-import fuel.fuel_transactions rows have a corrupted location_city: raw
 * AlwaysTrack scrape text with a street number jammed against the street name and, sometimes, the
 * city jammed against THAT with zero delimiter ("21548FM471SNATALIA,TX"), or -- when the source
 * spreadsheet's Location cell was empty -- the product/category name leaking in instead
 * ("Fuel-DEF-Diesel Exhaust Fluid", "DEF"). location_state was never populated at all (NULL on
 * all 450). Same sanitizeFuelLocation() logic as the writer fix in
 * apps/backend/src/feed/seed-settlement-document.service.ts, applied retroactively to each row's
 * OWN currently-stored (corrupted) location_city text -- the only source available for a row-level
 * backfill at this scale without re-reading hundreds of individual settlement PDFs.
 *
 * Recovers location_state where a clean trailing ", XX" code exists (real, low-risk -- state codes
 * are never ambiguous the way a jammed street/city boundary is). Sets location_city to NULL
 * everywhere the stored text starts with a digit or matches a known product term -- an honest NULL
 * beats a fabricated city. Leaves untouched any row whose stored text does NOT start with a digit
 * and is not a product term (already looks like a real city).
 *
 * Idempotent: only touches rows where the CURRENT location_city still matches a known-bad shape;
 * a re-run is a no-op on rows already cleaned.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r182-fuel-location-backfill.ts            # dry-run
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r182-fuel-location-backfill.ts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_LOCATION_PRODUCT_TERMS = ["fuel", "def", "diesel", "reefer", "lumper", "scale", "tire", "washout"];
const APPLY = process.argv.includes("--apply");
// AUTH-109 (docs/bus/OWNER-AUTHORIZATIONS.md) authorized this script's one-time run, already
// executed and closed 2026-09-28. Added retroactively (ROUND 133 P0) so a bare --apply re-run
// correctly refuses now that AUTH-109 is closed, rather than silently re-running unauthorized.
const AUTH_ID = "AUTH-109";

function sanitizeFuelLocation(raw: string | null): { city: string | null; state: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { city: null, state: null };
  const lower = text.toLowerCase();
  if (KNOWN_LOCATION_PRODUCT_TERMS.some((term) => lower.includes(term))) return { city: null, state: null };
  if (/^\d/.test(text)) {
    const stateMatch = text.match(/,\s*([A-Za-z]{2})\s*,?\s*$/);
    return { city: null, state: stateMatch ? stateMatch[1].toUpperCase() : null };
  }
  const stateMatch = text.match(/^(.*?),\s*([A-Za-z]{2})\s*,?\s*$/);
  if (stateMatch) return { city: stateMatch[1].trim() || null, state: stateMatch[2].toUpperCase() };
  return { city: text, state: null };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`ROUND 133 P0: ${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
      process.exit(1);
    }
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const rows = await client.query<{ id: string; location_city: string | null; location_state: string | null }>(
      `SELECT id::text, location_city, location_state
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND source = 'import'
          AND voided_at IS NULL
          AND location_city IS NOT NULL`,
      [USMCA]
    );
    console.log(`Found ${rows.rows.length} non-null location_city rows to evaluate.`);

    let nulled = 0;
    let stateRecovered = 0;
    let unchanged = 0;
    const updates: Array<{ id: string; city: string | null; state: string | null }> = [];

    for (const r of rows.rows) {
      const { city, state } = sanitizeFuelLocation(r.location_city);
      const cityChanged = city !== r.location_city;
      const stateChanged = state !== r.location_state;
      if (!cityChanged && !stateChanged) {
        unchanged += 1;
        continue;
      }
      if (city === null && r.location_city !== null) nulled += 1;
      if (state !== null && r.location_state === null) stateRecovered += 1;
      updates.push({ id: r.id, city, state });
    }

    console.log(`Would null out corrupted city on ${nulled} rows.`);
    console.log(`Would recover a real location_state on ${stateRecovered} rows.`);
    console.log(`Unchanged (already clean or not a recognizable state pattern with no digit prefix): ${unchanged}.`);

    if (!APPLY) {
      console.log("\nDRY RUN ONLY -- no rows changed. Re-run with --apply to write the above.");
      await client.query("ROLLBACK");
      return;
    }

    for (const u of updates) {
      await client.query(
        `UPDATE fuel.fuel_transactions SET location_city = $2, location_state = $3, updated_at = now()
          WHERE id = $1::uuid`,
        [u.id, u.city, u.state]
      );
    }
    await client.query("COMMIT");
    console.log(`\nAPPLIED: ${updates.length} rows updated (${nulled} city-nulled, ${stateRecovered} state-recovered).`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
