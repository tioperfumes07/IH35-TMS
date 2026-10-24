#!/usr/bin/env tsx
/**
 * scripts/seed-faro-advance-bank-wire-repost-cc1.ts — CC-1 (443.346)
 *
 * Sets bank_wire_cents on 4 USMCA factoring advances where Faro wired less than the full net advance,
 * then voids and reposts the funding JE so 1090 reflects the actual BofA wire, not the advance amount.
 *
 * Advances:
 *   FAC-2026-00018 (76151d0c)  advance=547050  wire=367050  gap=180000
 *   FAC-2026-00012 (a0a1ee56)  advance=981124  wire=437024  gap=544100
 *   FAC-2026-00020 (26c604f6)  advance=2608300 wire=2108300 gap=500000
 *   FAC-2026-00025 (07e69345)  advance=2318270 wire=0       (no BofA wire arrived)
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/seed-faro-advance-bank-wire-repost-cc1.ts          # dry-run
 *   DATABASE_URL=<prod> npx tsx scripts/seed-faro-advance-bank-wire-repost-cc1.ts --apply
 */
import pg from "pg";
import { reverseFactoringAdvanceEvent } from "../apps/backend/src/accounting/factoring-posting/poster.service.js";
import { postFactoringAdvanceEvent } from "../apps/backend/src/accounting/factoring-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const FIXES: Array<{ id: string; display_id: string; bank_wire_cents: number }> = [
  { id: "76151d0c-5248-4616-87b5-7a8b084c1940", display_id: "FAC-2026-00018", bank_wire_cents: 367050 },
  { id: "a0a1ee56-ce76-41d1-81a2-ca2876599d70", display_id: "FAC-2026-00012", bank_wire_cents: 437024 },
  { id: "26c604f6-857b-4b94-a048-3a03183c5d04", display_id: "FAC-2026-00020", bank_wire_cents: 2108300 },
  { id: "07e69345-6da2-4e61-af55-73b3695b60bb", display_id: "FAC-2026-00025", bank_wire_cents: 0 },
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  // Resolve real IDs from the database (partial UUIDs in FIXES above are placeholders)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    // Resolve actual UUIDs by display_id
    const res = await client.query(
      `SELECT id, display_id, advance_amount_cents, bank_wire_cents
       FROM accounting.factoring_advances
       WHERE operating_company_id = $1
         AND voided_at IS NULL
         AND display_id = ANY($2)`,
      [USMCA, FIXES.map(f => f.display_id)]
    );

    if (res.rows.length !== FIXES.length) {
      const found = res.rows.map((r: any) => r.display_id);
      const missing = FIXES.filter(f => !found.includes(f.display_id)).map(f => f.display_id);
      console.error(`ERROR: could not find advances: ${missing.join(", ")}`);
      process.exit(1);
    }

    for (const adv of res.rows) {
      const fix = FIXES.find(f => f.display_id === adv.display_id)!;
      console.log(
        `${adv.display_id} (${adv.id}): advance=${adv.advance_amount_cents} ` +
        `current_wire=${adv.bank_wire_cents ?? "NULL"} → setting wire=${fix.bank_wire_cents}`
      );
    }

    if (!apply) {
      console.log("\nDRY RUN — pass --apply to execute");
      return;
    }

    for (const adv of res.rows) {
      const fix = FIXES.find(f => f.display_id === adv.display_id)!;

      // 1. Set bank_wire_cents
      await client.query(
        `UPDATE accounting.factoring_advances SET bank_wire_cents = $1 WHERE id = $2`,
        [fix.bank_wire_cents, adv.id]
      );

      // 2. Void the existing funding JE
      const reverseResult = await reverseFactoringAdvanceEvent({
        operating_company_id: USMCA,
        factoring_advance_id: adv.id,
        actor_user_id: ACTOR,
        reason: `443.346: repost with bank_wire_cents=${fix.bank_wire_cents} (gap to 1230)`,
      });
      console.log(`  ${adv.display_id} reverse:`, reverseResult);

      // 3. Repost
      const postResult = await postFactoringAdvanceEvent({
        operating_company_id: USMCA,
        factoring_advance_id: adv.id,
        actor_user_id: ACTOR,
      });
      console.log(`  ${adv.display_id} post:`, postResult);
    }

    console.log("\nDone.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
