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
// RULE 2 (443.136, ACCT-F4431371): Relay can list ONE pump purchase under two transaction ids (same truck, same Relay
// location, same products at the same volumes, same paid, within 24h). The receipt identity keys on the transaction id, so
// both copies posted. No two live Relay fills with that one purchase signature may BOTH carry a live fuel_event posting —
// the poster refuses the second (relay_fill_duplicate_purchase) and POST /api/v1/fuel/relay-duplicates/void-later voids
// the later copy. RULE 2B (static): the Relay poster calls the duplicate-purchase rule before it posts.
//
// `node scripts/verify-no-fuel-purchase-booked-twice.mjs --selftest` runs the pure grouping logic
// (findDuplicatePairs, findRelayTwinPairs) and the static check against planted-red and clean fixtures — the "planted-red
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

// RULE 2 — every live Relay fill of the company with its purchase signature and whether it carries a live posting.
const RELAY_SQL = `
  SELECT r.id::text,
         COALESCE(r.matched_unit_id::text, 'n:' || btrim(r.matched_unit_number)) AS truck,
         COALESCE(r.location_id, lower(btrim(coalesce(r.location_city, ''))) || '|' || lower(btrim(coalesce(r.location_state, '')))) AS place,
         r.total_amount_paid_cents::text AS paid,
         extract(epoch FROM COALESCE(r.relay_created_at, (r.raw_payload->>'created_at')::timestamptz))::float8 AS at,
         (SELECT string_agg(lower(coalesce(l.fuel_type, '')) || ':' || to_char(l.volume, 'FM999999990.000'), ',' ORDER BY lower(coalesce(l.fuel_type, '')), l.volume)
            FROM integrations.relay_fuel_transaction_lines l
           WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND l.volume IS NOT NULL) AS items,
         EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                  WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text
                    AND p.operating_company_id = r.operating_company_id
                    AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL) AS posted
    FROM integrations.relay_fuel_transactions r
   WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL`;

/** Pure — no DB. Two POSTED fills with the same truck, place, products+volumes and paid, within 24h, are one purchase
 * booked twice. Exported for --selftest. */
export function findRelayTwinPairs(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.posted || !r.items) continue;
    const key = `${r.truck} ${r.place} ${r.paid} ${r.items}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }
  const pairs = [];
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (Math.abs(Number(bucket[i].at) - Number(bucket[j].at)) < 86400) pairs.push([bucket[i].id, bucket[j].id].sort());
      }
    }
  }
  return pairs;
}

const POSTER_PATH = path.join(ROOT, "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts");
/** Static — the Relay poster asks the duplicate-purchase rule BEFORE postFuelExpenseOnClient and refuses by name. */
export function relayPosterChecksTwins(src) {
  const fn = src.indexOf("async function postRelayFuelFill");
  if (fn < 0) return "postRelayFuelFill not found";
  const body = src.slice(fn);
  const twin = body.indexOf("postedRelayTwinsOf(");
  const post = body.indexOf("postFuelExpenseOnClient(");
  if (twin < 0) return "postRelayFuelFill never calls postedRelayTwinsOf";
  if (post >= 0 && twin > post) return "postRelayFuelFill posts before it checks for a Relay twin";
  if (!body.slice(twin, post >= 0 ? post : undefined).includes('"relay_fill_duplicate_purchase"')) return "no relay_fill_duplicate_purchase refusal between the twin check and the post";
  return null;
}

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

  // RULE 2 — Relay twins.
  const relayClean = [
    { id: "r1", truck: "U1", place: "loc1", paid: "17104", items: "diesel:31.204", at: 0, posted: true },
    { id: "r2", truck: "U1", place: "loc1", paid: "17104", items: "diesel:31.204", at: 5160, posted: false }, // refused copy
    { id: "r3", truck: "U1", place: "loc1", paid: "17104", items: "diesel:31.205", at: 6000, posted: true }, // other volume
    { id: "r4", truck: "U1", place: "loc1", paid: "17104", items: "diesel:31.204", at: 200000, posted: true }, // > 24h later
    { id: "r5", truck: "U2", place: "loc1", paid: "17104", items: "diesel:31.204", at: 100, posted: true }, // other truck
  ];
  const relayCleanPairs = findRelayTwinPairs(relayClean);
  if (relayCleanPairs.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — Relay clean fixture reported ${JSON.stringify(relayCleanPairs)}, expected 0`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest Relay green fixture — 0 twin pairs (expected 0). PASS`);
  const relayPlanted = relayClean.map((r) => (r.id === "r2" ? { ...r, posted: true } : r));
  const relayPlantedPairs = findRelayTwinPairs(relayPlanted);
  if (JSON.stringify(relayPlantedPairs) !== JSON.stringify([["r1", "r2"]])) {
    console.error(`${LABEL}: SELFTEST FAIL — Relay planted-red fixture did not flag exactly r1+r2 (got ${JSON.stringify(relayPlantedPairs)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest Relay planted-red fixture — 1 twin pair flagged (r1+r2, expected). red→green PASS`);

  // RULE 2B — static.
  const good = `async function postRelayFuelFill(){ const twins = await postedRelayTwinsOf(c); if (twins.length) throw new E("relay_fill_duplicate_purchase", "x"); await postFuelExpenseOnClient(c); }`;
  const missing = `async function postRelayFuelFill(){ await postFuelExpenseOnClient(c); }`;
  const late = `async function postRelayFuelFill(){ await postFuelExpenseOnClient(c); const twins = await postedRelayTwinsOf(c); throw new E("relay_fill_duplicate_purchase"); }`;
  if (relayPosterChecksTwins(good) !== null || relayPosterChecksTwins(missing) === null || relayPosterChecksTwins(late) === null) {
    console.error(`${LABEL}: SELFTEST FAIL — static Relay poster check: good=${relayPosterChecksTwins(good)} missing=${relayPosterChecksTwins(missing)} late=${relayPosterChecksTwins(late)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest static check — good passes, missing + post-before-check flagged. red→green PASS`);
}

async function live() {
  const gate = readGate();
  const staticFail = relayPosterChecksTwins(fs.readFileSync(POSTER_PATH, "utf8"));
  if (staticFail) {
    console.error(`${LABEL}: STATIC FAIL — ${staticFail} (${path.relative(ROOT, POSTER_PATH)})`);
    process.exit(1);
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(SQL, [USMCA_COMPANY_ID])).rows;
    const relayRows = (await client.query(RELAY_SQL, [USMCA_COMPANY_ID])).rows;
    await client.query("COMMIT");

    const duplicates = findDuplicatePairs(rows);
    const twins = findRelayTwinPairs(relayRows);
    if (duplicates.length === 0 && twins.length === 0) {
      console.log(`${LABEL}: LIVE PASS — ${rows.length} live USMCA load-linked expense(s) checked, 0 fuel-purchase-booked-twice groups; ${relayRows.length} live Relay fill(s) checked, 0 purchases posted twice; Relay poster checks for twins.`);
      return;
    }

    if (duplicates.length) console.error(`${LABEL}: ${duplicates.length} load+amount group(s) have a card fuel expense duplicated by a regular expense:`);
    for (const d of duplicates.slice(0, 20)) {
      console.error(`  ✗ load=${d.cardFuel[0].load_id} amount=$${(Number(d.cardFuel[0].total_amount_cents) / 100).toFixed(2)} card_fuel=[${d.cardFuel.map((r) => r.id).join(",")}] regular=[${d.regular.map((r) => r.id).join(",")}]`);
    }
    if (twins.length) console.error(`${LABEL}: ${twins.length} Relay purchase(s) posted twice (same truck, place, products, volume, paid, within 24h) — POST /api/v1/fuel/relay-duplicates/void-later:`);
    for (const [a, b] of twins.slice(0, 20)) console.error(`  ✗ relay fills ${a} + ${b}`);

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
