#!/usr/bin/env tsx
// IFTA-GALLONS-03 (Lead assignment, 2026-09-22): 28,635.54 gal (61% of all diesel gallons) carry
// NO jurisdiction (fuel.fuel_transactions.location_state NULL). location_city holds the STREET
// ADDRESS, not a city, and many carry the state embedded in it (e.g. "135HWY44ENCINAL,TX, TX",
// "6716 Hwy 171 Malvern AR"). Never a regex GUESS at which document a row belongs to -- but an
// ALREADY-EMBEDDED state code in the row's own data is not a guess, it is a read. Three tiers, in
// order of confidence, each one leaving the row untouched (NULL, reported) if it cannot resolve:
//
//   TIER 1 -- embedded state code already IN THE ROW's own location_city text (comma- or
//   space-terminated, validated against the real 50-state abbreviation list -- rejects false
//   positives like "...ROAD" -> "AD" or "...WAY" -> "AY"/"RD"/"DR"/"FT"/"ST"). This is reading data
//   already present on the row, not matching against an external document.
//
//   TIER 2 -- match the row against the Dreamline fuel-card statement CSV (which carries a real,
//   independent State column) on date + unit + quantity + amount -- the SAME matching key the
//   Dreamline stamp/create ingestion already used. Never a name/regex guess alone.
//
//   TIER 3 -- match against the Love's 604-store seed via an embedded store number in
//   location_city, resolving store_no -> state directly.
//
// A row that resolves via NONE of the three tiers is left NULL and counted in the residual report.
// A wrong state is worse than a missing one (moves tax between jurisdictions) -- this script never
// picks a low-confidence guess to close the residual.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

const DREAMLINE_CSV = path.join(
  process.env.HOME!,
  "Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv"
);
const LOVES_SEED_CSV = path.join(
  process.env.HOME!,
  "Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv"
);

type CsvRow = Record<string, string>;
function parseCsv(text: string): CsvRow[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: CsvRow = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

function extractEmbeddedState(locationCity: string | null): string | null {
  if (!locationCity) return null;
  const commaMatch = locationCity.match(/,\s*([A-Z]{2})\s*,?\s*$/);
  const spaceMatch = locationCity.match(/\s([A-Z]{2})$/);
  const candidate = commaMatch?.[1] ?? spaceMatch?.[1] ?? null;
  if (candidate && VALID_STATES.has(candidate)) return candidate;
  return null;
}

function extractLovesStoreNumber(locationCity: string | null): string | null {
  if (!locationCity) return null;
  const m = locationCity.match(/LOVE'?S\s*#?\s*(\d{3,4})/i);
  return m?.[1] ?? null;
}

type Row = {
  id: string;
  transaction_at: string;
  unit_number: string | null;
  gallons: string;
  total_cost: string;
  location_city: string | null;
};

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const dreamlineRows = parseCsv(fs.readFileSync(DREAMLINE_CSV, "utf8"));
  const lovesRows = parseCsv(fs.readFileSync(LOVES_SEED_CSV, "utf8"));
  const lovesByStore = new Map(lovesRows.map((r) => [r.store_no, r.state]));

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const rowsRes = await client.query<Row>(
    `SELECT ft.id::text, ft.transaction_at::text, u.unit_number, ft.gallons::text, ft.total_cost::text, ft.location_city
       FROM fuel.fuel_transactions ft
       LEFT JOIN mdata.units u ON u.id = ft.unit_id
      WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL
        AND (ft.location_state IS NULL OR TRIM(ft.location_state) = '')`,
    [USMCA_COMPANY_ID]
  );

  let tier1 = 0, tier1Gal = 0;
  let tier2 = 0, tier2Gal = 0;
  let tier3 = 0, tier3Gal = 0;
  let residual = 0, residualGal = 0;
  const updates: Array<{ id: string; state: string; tier: number }> = [];

  for (const r of rowsRes.rows) {
    const gal = Number(r.gallons);
    const tier1State = extractEmbeddedState(r.location_city);
    if (tier1State) {
      updates.push({ id: r.id, state: tier1State, tier: 1 });
      tier1++;
      tier1Gal += gal;
      continue;
    }

    // TIER 2: match against the Dreamline statement on date + unit + quantity + amount.
    let tier2State: string | null = null;
    if (r.unit_number) {
      const txnDate = r.transaction_at.slice(0, 10);
      const match = dreamlineRows.find(
        (d) =>
          d["Transaction Date"] === txnDate &&
          d["Unit Number"] === r.unit_number &&
          Math.abs(Number(d.Quantity) - Number(r.gallons)) < 0.05 &&
          Math.abs(Number(d.Amount) - Number(r.total_cost)) < 0.5
      );
      if (match?.State) tier2State = match.State;
    }
    if (tier2State) {
      updates.push({ id: r.id, state: tier2State, tier: 2 });
      tier2++;
      tier2Gal += gal;
      continue;
    }

    // TIER 3: Love's store number embedded in location_city.
    const storeNo = extractLovesStoreNumber(r.location_city);
    const tier3State = storeNo ? lovesByStore.get(storeNo) ?? null : null;
    if (tier3State) {
      updates.push({ id: r.id, state: tier3State, tier: 3 });
      tier3++;
      tier3Gal += gal;
      continue;
    }

    residual++;
    residualGal += gal;
  }

  console.log(`Scanned ${rowsRes.rows.length} NULL-jurisdiction rows.`);
  console.log(`  TIER 1 (embedded state code): ${tier1} rows / ${tier1Gal.toFixed(3)} gal`);
  console.log(`  TIER 2 (Dreamline statement match): ${tier2} rows / ${tier2Gal.toFixed(3)} gal`);
  console.log(`  TIER 3 (Love's store seed match): ${tier3} rows / ${tier3Gal.toFixed(3)} gal`);
  console.log(`  RESIDUAL (unresolved, left NULL): ${residual} rows / ${residualGal.toFixed(3)} gal`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made. Re-run with --execute to apply.");
    return;
  }

  let applied = 0;
  for (const u of updates) {
    await client.query(
      `UPDATE fuel.fuel_transactions SET location_state = $1, updated_at = now(), updated_by_user_id = $2::uuid
         WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
      [u.state, OWNER_USER_ID, u.id, USMCA_COMPANY_ID]
    );
    applied++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${applied} rows updated.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
