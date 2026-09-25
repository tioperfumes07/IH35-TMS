#!/usr/bin/env node
// verify-no-fuel-purchase-booked-twice.mjs — ROUND 165 Guard B.
//
// DEF/reefer used to get booked TWICE on a seeded settlement document: once as the card fuel
// expense (accounting.expenses.source_fuel_transaction_id set — the LAW 4 record, Cr 2510) and
// again as a regular expense from the company document's own expenses[] line (Cr 1000). Fixed at
// the root in seedExpense() (apps/backend/src/feed/seed-settlement-document.service.ts): it now
// refuses to create a regular expense when a live card fuel expense already exists for the same
// load and amount. This guard is the live proof that holds going forward: no live, non-voided
// USMCA expense with source_fuel_transaction_id NULL shares (load_id, total_amount_cents) with a
// live, non-voided expense that DOES carry source_fuel_transaction_id.
//
// REPORT MODE (ROUND 165 order 6): same as Guard A — the Lead's R-164 (AUTH-021) fixes the
// existing data; this guard reads red against it by design until that lands.
// scripts/verify-no-fuel-purchase-booked-twice.gate.json controls blocking vs report-only.
//
// `node scripts/verify-no-fuel-purchase-booked-twice.mjs --selftest` runs the pure grouping logic
// (findDuplicatePairs) against a planted-red fixture and a clean fixture — the "planted-red
// selftest."
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "checks live accounting.expenses for a card-fuel expense duplicated by a regular expense at the same load+amount; cannot be exercised without a live Neon connection";

const LABEL = "verify-no-fuel-purchase-booked-twice";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GATE_PATH = path.join(ROOT, "scripts/verify-no-fuel-purchase-booked-twice.gate.json");

const SQL = `
  SELECT id::text, load_id::text, total_amount_cents, memo,
         (source_fuel_transaction_id IS NOT NULL) AS is_card_fuel
    FROM accounting.expenses
   WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND load_id IS NOT NULL`;

/** Pure — no DB. Groups by (load_id, total_amount_cents); a group is a duplicate when it has at
 * least one card-fuel expense (source_fuel_transaction_id set) AND at least one regular expense
 * (not) — the same real fuel purchase booked twice. Exported for --selftest. */
export function findDuplicatePairs(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.load_id} ${r.total_amount_cents}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }
  const duplicates = [];
  for (const bucket of groups.values()) {
    const cardFuel = bucket.filter((r) => r.is_card_fuel);
    const regular = bucket.filter((r) => !r.is_card_fuel);
    if (cardFuel.length > 0 && regular.length > 0) {
      duplicates.push({ cardFuel, regular });
    }
  }
  return duplicates;
}

function readGate() {
  if (!fs.existsSync(GATE_PATH)) return { blocking: false };
  return JSON.parse(fs.readFileSync(GATE_PATH, "utf8"));
}

function selftest() {
  const clean = [
    { id: "e1", load_id: "L1", total_amount_cents: 3030, is_card_fuel: true },
    { id: "e2", load_id: "L1", total_amount_cents: 1525, is_card_fuel: false },
    { id: "e3", load_id: "L2", total_amount_cents: 3030, is_card_fuel: false },
  ];
  const cleanDupes = findDuplicatePairs(clean);
  if (cleanDupes.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean fixture reported ${cleanDupes.length} duplicate group(s), expected 0`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest green fixture — 0 duplicate groups (expected 0). PASS`);

  const planted = [
    ...clean,
    // Planted red: same load, same amount, one card-fuel copy and one regular copy — exactly the
    // "DEF booked twice" bug this guard exists to catch.
    { id: "e4", load_id: "L1", total_amount_cents: 3030, is_card_fuel: false },
  ];
  const plantedDupes = findDuplicatePairs(planted);
  if (plantedDupes.length !== 1 || plantedDupes[0].cardFuel[0].id !== "e1" || plantedDupes[0].regular.length !== 1 || plantedDupes[0].regular[0].id !== "e4") {
    console.error(`${LABEL}: SELFTEST FAIL — planted-red fixture did not flag exactly the planted duplicate (got ${JSON.stringify(plantedDupes)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest planted-red fixture — 1 duplicate group flagged (e1+e4, expected). red→green PASS`);
}

async function live() {
  const gate = readGate();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(SQL, [USMCA_COMPANY_ID])).rows;
    await client.query("COMMIT");

    const duplicates = findDuplicatePairs(rows);
    if (duplicates.length === 0) {
      console.log(`${LABEL}: LIVE PASS — ${rows.length} live USMCA load-linked expense(s) checked, 0 fuel-purchase-booked-twice groups.`);
      return;
    }

    console.error(`${LABEL}: ${duplicates.length} load+amount group(s) have a card fuel expense duplicated by a regular expense:`);
    for (const d of duplicates.slice(0, 20)) {
      console.error(`  ✗ load=${d.cardFuel[0].load_id} amount=$${(Number(d.cardFuel[0].total_amount_cents) / 100).toFixed(2)} card_fuel=[${d.cardFuel.map((r) => r.id).join(",")}] regular=[${d.regular.map((r) => r.id).join(",")}]`);
    }

    if (!gate.blocking) {
      console.warn(`${LABEL}: REPORT MODE (${gate.note ?? "blocking flips true once R-164/AUTH-021 is CONSUMED"}) — not failing the gate.`);
      return;
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
