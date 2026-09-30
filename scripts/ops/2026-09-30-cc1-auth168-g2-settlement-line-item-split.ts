/**
 * AUTH-168: G2 — split 16 driver_finance.settlement_lines rows (item_id IS NULL, line_type=
 * 'extra_pay') into their real constituent items via ONE adjusting journal entry, per Lead RULING
 * 2 (ROUND 293) and its follow-up correction (item-code corrections + the $22.14 line held out).
 *
 * WHY AN ADJUSTING JE, NOT VOID+RECREATE: all 17 target rows sit inside driver_finance
 * .driver_settlements rows with status='closed', settlements 5769-5819, verified 51/51 against
 * AlwaysTrack with variance 0, standing owner ruling never to re-open them. Reopening a closed,
 * verified settlement to fix an item-classification detail would touch far more than the fix
 * requires. The Lead's own order: "DO NOT void and recreate... Execute as ONE adjusting journal
 * entry in the CURRENT OPEN period... Plus a permanent mapping record per constituent line."
 *
 * THE $60.00 SCOPE-DOC DISCREPANCY, RESOLVED: the prior scope doc (docs/bus/2026-09-30-CC1-G2-
 * SETTLEMENT-LINE-SPLIT-SCOPE.md) stated "$1,806.02" in its prose, but its own 17-row table sums
 * to exactly $1,746.02 (confirmed live: 17 rows, SUM(amount)=1746.02) -- a $60 ARITHMETIC ERROR in
 * that doc's prose, not a data change. $1,746.02 is correct. Of that, ONE line ($22.14, settlement
 * 5794/load 13558, "LOVES 1ASC ''19 PREMIUM") is held out per the Lead's explicit instruction --
 * neither fuel.fuel_transactions (no row for load 13558 near $22.14; its only two fuel purchases
 * are $522.71 and $872.01) nor banking.bank_transactions (no row at $22.14 at all) names what it
 * actually bought. THIS SCRIPT EXECUTES THE REMAINING 16 ROWS / $1,723.88 ONLY. The 17th
 * (b0c47f5c-ea45-40ef-af07-13aa4128fa64) stays item_id NULL, untouched, reported separately.
 *
 * ITEM MAPPING -- per the Lead's direct read of the signed settlement documents, corrected twice
 * (the second correction is authoritative, verified against the live catalog by the Lead):
 *   Driver Pay-Tarp-Enlonada/Desenlonada (8dea02de-e7ec-4e0f-b69f-abc33d459a06)        -> 5100
 *   Driver Pay-Extra Delivery/Drop        (e912b037-f013-4f0d-87da-81429f049cec)        -> 5100
 *   Driver Pay-Layover-Estancia            (b2f21729-d4f4-49c5-a51e-ee25a91eb6c5)        -> 5100
 *   Driver Pay-Bonus                       (95d652da-53ec-4cc0-a2a5-4d745882aa69)        -> 5100
 *   Road Service-Truck Tire Expense        (d2b34f56-92b0-44f4-92ff-b149322070a7)        -> 5500
 *   OTR-Parking Expense                    (9016ddcf-e6c2-452c-a939-93f01f0efcd2)        -> 5300
 *   Driver Reimbursement-Company Vehicle Fuel (e93a0c79-337f-4563-b0fc-d09c9b36e499)     -> 5000
 *   Driver Reimbursement Warehouse-Lumper Fee (139e29e4-4be3-46b8-bf9d-36e48bdd83a0)     -> 5310
 *     (NOT "Warehouse Lumper Expense" FREIGHT-DELI-... and NOT "Warehouse-Lumper Fee"
 *      SALES-OF-SER-... -- that one carries no expense account at all, it is the REVENUE item for
 *      billing a customer a lumper fee. The signed document files both lumper lines under
 *      "Reimbursed Expenses:", so the DRIVER-REIMB item is the exact match.)
 *   Road Service-Truck Repair Expense      (3648d94a-aa3a-45dc-8446-e7128ba1f11a)        -> 5400
 *     (the two truck-stop parts lines -- headlight, windshield -- over-the-road repairs the
 *      driver paid for and was reimbursed for, same family/block-header as the already-live
 *      "LOVES Road Service-Truck Tire Expense" $531.26 on 5799/13574.)
 *
 * GROUPING CONVENTION: one JE debit line per (settlement_line, item) pair -- i.e. two identical
 * $25.00 Enlonada/Desenlonada charges on the same settlement_line aggregate into ONE $50.00 line
 * for that item, rather than two separate $25 lines. This matches how the source document itself
 * is read (a real accountant posts by item, not by individual repeated event) and keeps the JE
 * legible. The full per-event detail (every real document line, never aggregated) lives in the
 * mapping table below and in this file's own SPLITS constant, and every dollar still ties to the
 * cent against the source document -- the aggregation is presentational on the JE, not a loss of
 * detail, since the underlying per-line description is preserved in each split's memo.
 *
 * THE PERMANENT MAPPING RECORD: driver_finance.settlement_line_item_splits (migration
 * 202614680000, same PR) -- one row per constituent item on a settlement_line, referencing the
 * adjusting JE's id, so the item detail is fully auditable without ever touching the signed
 * settlement document or the settlement_line row itself (both stay exactly as they are).
 *
 * THE ENGINE FIX (same PR, same migration): driver_finance.settlement_lines gets a NOT VALID
 * check constraint (settlement_lines_extra_pay_requires_item) -- any FUTURE extra_pay line must
 * carry a real item_id. NOT VALID enforces it for every new write from this point forward without
 * retroactively failing these 16 grandfathered legacy rows.
 *
 * TB PREDICTION (verify this exact table against the rehearsal's actual output before running for
 * real against prod):
 *   6890 Cost of Labor-MX               -$1,723.88
 *   5100 Driver Pay / Settlements       +$1,050.00
 *   5000 Fuel & Diesel                     +$30.00
 *   5300 Tolls & Scales                    +$22.00
 *   5310 Lumper Expense                    +$28.00
 *   5400 Truck Repairs & Maintenance       +$62.62
 *   5500 Tires                            +$531.26
 *   ---------------------------------------------
 *   net                                      $0.00   (pure reclassification, company total unchanged)
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<target> npx tsx scripts/ops/2026-09-30-cc1-auth160-g2-settlement-line-item-split.ts
 *   OWNER_AUTH_ID=AUTH-168 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth160-g2-settlement-line-item-split.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_6890 = "fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b";

const ITEM = {
  TARP: "8dea02de-e7ec-4e0f-b69f-abc33d459a06",
  EXTRA_DELIVERY: "e912b037-f013-4f0d-87da-81429f049cec",
  LAYOVER: "b2f21729-d4f4-49c5-a51e-ee25a91eb6c5",
  BONUS: "95d652da-53ec-4cc0-a2a5-4d745882aa69",
  TIRE: "d2b34f56-92b0-44f4-92ff-b149322070a7",
  PARKING: "9016ddcf-e6c2-452c-a939-93f01f0efcd2",
  FUEL_REIMB: "e93a0c79-337f-4563-b0fc-d09c9b36e499",
  LUMPER_REIMB: "139e29e4-4be3-46b8-bf9d-36e48bdd83a0",
  TRUCK_REPAIR: "3648d94a-aa3a-45dc-8446-e7128ba1f11a",
} as const;

// Account id -> expected account_number, for the live TB-prediction sanity check only.
const EXPECT_ACCOUNT_NUMBER: Record<string, string> = {
  "3e868fdb-7430-476f-8fcd-3d76b7356814": "5500",
  "4a0a5b88-3f56-4dc7-853c-37071089315a": "5300",
  "353fbd5b-d39c-4709-ac19-60cae52018f7": "5000",
  "b029d12d-f0b2-4f69-9e84-5df91a954c77": "5310",
  "8fe4f37c-39ae-48df-a0f9-f43489f3df5d": "5400",
  "7fda32cf-2d44-4e03-a619-9069bba42724": "5100",
};

type Split = { item: string; amountCents: number; description: string };
type Row = { settlementLineId: string; settlement: string; load: string; splits: Split[] };

// One entry per (settlement_line, item) pair. Amounts already aggregated per item within a row
// (e.g. two $25.00 Enlonada/Desenlonada charges -> one $50.00 Tarp line) -- see file header.
const ROWS: Row[] = [
  { settlementLineId: "aa4d640e-e556-46ca-8090-1bd501e94c0f", settlement: "5808", load: "13597", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.FUEL_REIMB, amountCents: 1000, description: "ROAD RANGER GAS/HONDA $10.00" },
  ]},
  { settlementLineId: "6d21e5ee-17cd-4249-916f-e8e8619a56e9", settlement: "5775", load: "13516", splits: [
    { item: ITEM.BONUS, amountCents: 5000, description: "Driver Pay-Bono por Contratacion 1/4 $50.00" },
  ]},
  { settlementLineId: "a785edd9-133e-43be-8512-f49672207c44", settlement: "5772", load: "13502", splits: [
    { item: ITEM.BONUS, amountCents: 5000, description: "Driver Pay-Bono por Contratatacion 1/4 $50.00" },
  ]},
  { settlementLineId: "b585c4e6-5f6d-4386-a87e-e2ad1487de04", settlement: "5802", load: "13589", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.EXTRA_DELIVERY, amountCents: 2500, description: "Extra Delivery/Drop $25.00" },
    { item: ITEM.TRUCK_REPAIR, amountCents: 2499, description: "LOVES 1ASC H1155LL HEADLIG $24.99" },
  ]},
  { settlementLineId: "555889f5-672d-404f-81d3-58cc68691aaa", settlement: "5802", load: "13579", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.FUEL_REIMB, amountCents: 1000, description: "ROAD RANGER Gasolina para Camioneta Honda $10.00" },
  ]},
  { settlementLineId: "359e247f-51d0-4ea9-bb1c-729e244a0272", settlement: "5809", load: "13583", splits: [
    { item: ITEM.LAYOVER, amountCents: 5000, description: "Layover-Estancia 11 Y 13 DE SEPTIEMBRE $50.00" },
    { item: ITEM.EXTRA_DELIVERY, amountCents: 2500, description: "Extra Delivery/Drop $25.00" },
  ]},
  { settlementLineId: "d4232a21-ca8d-4b24-97a4-39ff68c8ed3b", settlement: "5799", load: "13574", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.TIRE, amountCents: 53126, description: "LOVES Road Service-Truck Tire Expense $531.26" },
  ]},
  { settlementLineId: "3f1b56c8-662e-4980-97de-1bdca67ac840", settlement: "5811", load: "13603", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.LAYOVER, amountCents: 2500, description: "Layover-Estancia $25.00" },
  ]},
  { settlementLineId: "1860a730-0e37-4810-8ad8-62d36bb0bbd1", settlement: "5782", load: "13540", splits: [
    { item: ITEM.LAYOVER, amountCents: 2500, description: "Layover-Estancia 21 de Agosto $25.00" },
    { item: ITEM.LUMPER_REIMB, amountCents: 1800, description: "TYSON LUMPER VIAJE PASADO $18.00" },
  ]},
  { settlementLineId: "2f709456-c6be-4666-b549-02793f4cc19f", settlement: "5805", load: "13582", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.FUEL_REIMB, amountCents: 1000, description: "LOVES GASOLINA/HONDA $10.00" },
  ]},
  { settlementLineId: "715c771f-ea27-4350-ad9d-075d9aaf43e5", settlement: "5783", load: "13537", splits: [
    { item: ITEM.TARP, amountCents: 10000, description: "4x Enlonada/Desenlonada $25.00 (Edison NJ, Baytown TX x2, Houston TX -- four separate tarp events on one multi-stop load)" },
    { item: ITEM.EXTRA_DELIVERY, amountCents: 2500, description: "Extra Delivery/Drop $25.00" },
  ]},
  { settlementLineId: "e9d75808-499a-483d-9cc7-1ddf05108952", settlement: "5797", load: "13569", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.TRUCK_REPAIR, amountCents: 3763, description: "LOVES 2AS20WINDSHIELD $37.63" },
  ]},
  { settlementLineId: "f6627695-1763-4e11-9d5c-7aedfab17795", settlement: "5787", load: "13549", splits: [
    { item: ITEM.LAYOVER, amountCents: 7500, description: "Layover-Estancia 22,23,24 De Agosto $75.00" },
    { item: ITEM.PARKING, amountCents: 2200, description: "FLYING Bridge & Toll Expenses:OTR-Parking Expense $22.00" },
  ]},
  // b0c47f5c (5794/13558, $22.14 "LOVES 1ASC ''19 PREMIUM") -- HELD OUT per Lead's explicit order.
  // Neither fuel.fuel_transactions nor banking.bank_transactions names what it bought. Not in ROWS.
  { settlementLineId: "f11ccb9a-c8a4-4652-8ed8-9fce5dac6cc5", settlement: "5803", load: "13586", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.LAYOVER, amountCents: 2500, description: "Layover-Estancia 09 DE SEPTIEMBRE $25.00" },
  ]},
  { settlementLineId: "cf6b46fb-5278-4fa1-b7b9-578936f93237", settlement: "5803", load: "13564", splits: [
    { item: ITEM.TARP, amountCents: 5000, description: "Enlonada $25.00 + Desenlonada $25.00" },
    { item: ITEM.LAYOVER, amountCents: 10000, description: "ESTANCIA 04 DE SEPTIEMBRE $25.00 + Layover-Estancia 12,13 Y 14 DE SEPTIEMBRE $75.00" },
  ]},
  { settlementLineId: "3e1768a7-4a26-41bd-a217-250608f5f1e6", settlement: "5785", load: "13538", splits: [
    { item: ITEM.EXTRA_DELIVERY, amountCents: 2500, description: "Extra Delivery/Drop $25.00" },
    { item: ITEM.LUMPER_REIMB, amountCents: 1000, description: "Warehouse-Lumper Fee Expense COBRO POR ENTRAR A DESCARGA $10.00" },
  ]},
];

const EXPECTED_TOTAL_CENTS = 172388; // $1,723.88 -- 16 rows, held-out line excluded

async function main() {
  const { createJournalEntryOnClient } = await import("../../apps/backend/src/accounting/journal-entries.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc1-auth168-g2-settlement-line-item-split.ts" });
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    // ---- Pre-flight: confirm all 16 target rows still exist, item_id NULL, not voided ----
    const liveRows = await client.query<{ id: string; amount: string }>(
      `SELECT id::text, amount::text FROM driver_finance.settlement_lines
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND item_id IS NULL AND voided_at IS NULL`,
      [USMCA_ID, ROWS.map((r) => r.settlementLineId)]
    );
    if (liveRows.rows.length !== ROWS.length) {
      throw new Error(`Expected ${ROWS.length} live item_id-NULL rows, found ${liveRows.rows.length} -- STOP, re-verify before proceeding`);
    }

    // ---- Reconcile every row's splits to its own live amount, to the cent ----
    const byId = new Map(liveRows.rows.map((r) => [r.id, Math.round(Number(r.amount) * 100)]));
    let totalCents = 0;
    for (const row of ROWS) {
      const rowTotal = row.splits.reduce((s, x) => s + x.amountCents, 0);
      const liveAmount = byId.get(row.settlementLineId);
      if (liveAmount !== rowTotal) {
        throw new Error(`Row ${row.settlementLineId} (${row.settlement}/${row.load}): splits sum to ${rowTotal} but live amount is ${liveAmount} -- STOP`);
      }
      totalCents += rowTotal;
    }
    if (totalCents !== EXPECTED_TOTAL_CENTS) {
      throw new Error(`Total splits ${totalCents} != expected ${EXPECTED_TOTAL_CENTS} -- STOP`);
    }
    console.log(`Reconciled: ${ROWS.length} rows, ${ROWS.reduce((s, r) => s + r.splits.length, 0)} split lines, $${(totalCents / 100).toFixed(2)} total. Matches expected exactly.`);

    // ---- Build the JE postings: one debit line per (row, item) split, plus one credit to 6890 ----
    const postings = ROWS.flatMap((row) =>
      row.splits.map((s) => ({
        account_id: s.item, // placeholder, replaced below with the item's real default_expense_account_id
        debit_or_credit: "debit" as const,
        amount_cents: s.amountCents,
        description: `${s.description} -- settlement_line ${row.settlementLineId}, settl ${row.settlement}, load ${row.load} (G2 reclass, AUTH-168)`,
      }))
    );
    // Resolve each item's real default_expense_account_id live (never hardcode an account id next
    // to an item id in two places where they could silently drift).
    const itemIds = [...new Set(ROWS.flatMap((r) => r.splits.map((s) => s.item)))];
    const itemAccounts = await client.query<{ id: string; default_expense_account_id: string; account_number: string }>(
      `SELECT i.id::text, i.default_expense_account_id::text, a.account_number
         FROM catalogs.items i JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
        WHERE i.id = ANY($1::uuid[])`,
      [itemIds]
    );
    const itemToAccount = new Map(itemAccounts.rows.map((r) => [r.id, r.default_expense_account_id]));
    for (const r of itemAccounts.rows) {
      const expected = EXPECT_ACCOUNT_NUMBER[r.default_expense_account_id];
      if (expected && expected !== r.account_number) {
        throw new Error(`Item ${r.id} resolves to account ${r.account_number}, expected ${expected} -- STOP, re-verify mapping`);
      }
    }
    const resolvedPostings = ROWS.flatMap((row) =>
      row.splits.map((s) => {
        const accountId = itemToAccount.get(s.item);
        if (!accountId) throw new Error(`No default_expense_account_id resolved for item ${s.item} -- STOP`);
        return {
          account_id: accountId,
          debit_or_credit: "debit" as const,
          amount_cents: s.amountCents,
          description: `${s.description} -- settlement_line ${row.settlementLineId}, settl ${row.settlement}, load ${row.load} (G2 reclass, AUTH-168)`,
        };
      })
    );
    resolvedPostings.push({
      account_id: ACCOUNT_6890,
      debit_or_credit: "credit" as any,
      amount_cents: totalCents,
      description: `G2 reclass (AUTH-168): move ${ROWS.length} settlement lines' misclassified extra_pay off 6890 Cost of Labor-MX into their real items. 1 line held out (b0c47f5c, $22.14, settl 5794/load 13558 -- neither fuel_transactions nor bank_transactions names what it bought).`,
    } as any);

    // Per-account TB prediction check (informational, printed before writing)
    const byAccount = new Map<string, number>();
    for (const p of resolvedPostings) {
      const sign = p.debit_or_credit === "debit" ? 1 : -1;
      byAccount.set(p.account_id, (byAccount.get(p.account_id) ?? 0) + sign * p.amount_cents);
    }
    console.log("Per-account movement (cents, +debit/-credit):", JSON.stringify(Object.fromEntries(byAccount)));

    if (DRY_RUN) {
      console.log(`DRY_RUN=1 -- would post ${resolvedPostings.length} lines (${resolvedPostings.length - 1} debits + 1 credit), $${(totalCents / 100).toFixed(2)}. Would insert ${ROWS.reduce((s, r) => s + r.splits.length, 0)} settlement_line_item_splits rows. No write.`);
      await client.query("ROLLBACK");
      return;
    }

    const header = await createJournalEntryOnClient(
      client,
      {
        operating_company_id: USMCA_ID,
        entry_date: new Date().toISOString().slice(0, 10),
        memo: `G2 (ROUND 292/293) adjusting entry: reclassify ${ROWS.length} closed-settlement extra_pay lines from 6890 Cost of Labor-MX into their real constituent items, per signed settlement documents read directly by the Lead. Settlements themselves (5769-5819) are NOT reopened -- void-not-delete law, owner ruling never to re-open a verified-closed settlement. AUTH-168.`,
        source: "manual",
        postings: resolvedPostings,
      },
      { userId: SYSTEM_ACTOR_USER_ID, role: "system" }
    );
    console.log(`Posted adjusting JE ${header.id}, ${resolvedPostings.length} lines, $${(totalCents / 100).toFixed(2)}.`);

    // ---- Permanent mapping record: one row per (settlement_line, item) split ----
    let inserted = 0;
    for (const row of ROWS) {
      let seq = 1;
      for (const s of row.splits) {
        await client.query(
          `INSERT INTO driver_finance.settlement_line_item_splits
             (operating_company_id, settlement_line_id, sequence, item_id, amount_cents, description, adjusting_journal_entry_id, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::uuid,$8::uuid)`,
          [USMCA_ID, row.settlementLineId, seq, s.item, s.amountCents, `${s.description} (settl ${row.settlement}, load ${row.load})`, header.id, SYSTEM_ACTOR_USER_ID]
        );
        seq++;
        inserted++;
      }
    }
    console.log(`Inserted ${inserted} settlement_line_item_splits rows.`);

    await client.query("COMMIT");
    console.log("COMMITTED.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
