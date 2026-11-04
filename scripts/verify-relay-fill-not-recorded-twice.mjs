#!/usr/bin/env node
/**
 * ACCT-F11105 — ONE PURCHASE, ONE RECORD: a Relay fill never carries live fuel records while another rail (a DREAMLINE /
 * WEX settlement row) already records the same purchase on ANY truck.
 *
 * Root cause measured 2026-11-04 (prod, USMCA, bypass_rls): the ENG-65 sweep (#28457) at 12:00Z wrote 59 Relay-at-receipt
 * rows ($15,371.65, 45 fills). 18 rows / 13 fills ($5,111.47 recorded) were second records of purchases already printed on
 * DREAMLINE settlement rows: identical metered gallons (e.g. 49.244, 118.097, 128.325), same day ±1, and the settlement
 * ticket's total equal to Relay's retail to the cent (13 of 13) — but on another truck than the one keyed at the Relay pump,
 * so ENG-65's "no record" test (no row tied by relay_fuel_transaction_id) and the 443.133 same-truck cross-rail check both
 * missed them. verify-fuel-transactions-per-load went red (29 unsourced; 16 of them these).
 *
 * Static: fuel/relay-fill-other-rail-ticket.ts exports the one rule; crossRailFuelRowsForRelayFill includes it (the poster
 * and ENG-65 refuse by it); ensureRelayFillFuelRecords asks it BEFORE writing and refuses
 * (relay_fill_recorded_on_other_rail); the receipt writer's marker is the one verify-fuel-transactions-per-load proves.
 * Live (fails closed): 0 Relay fills with live fuel rows whose purchase another rail records — measured with the engine's
 * own SQL text. --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { otherRailTicketSql, receiptRecordProblems, OTHER_RAIL_PATH, RECEIPT_WRITER_PATH, RELAY_ROWS_ENGINE_PATH } from "./verify-fuel-transactions-per-load.mjs";

export const REQUIRES_LIVE_DB = "live-data money guard (one purchase, one record across fuel rails); fails closed via requireLiveDbOrExit";
const LABEL = "verify-relay-fill-not-recorded-twice";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LINK_PATH = "apps/backend/src/fuel/relay-fill-link.service.ts";
const read = (rel) => { try { return readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };

/** Pure: the live result -> failures. rows: [{relay_txn, ref, card, fuel_id}] (one per other-rail row of a recorded fill). */
export function evaluate(rows) {
  const byFill = new Map();
  for (const r of rows) byFill.set(r.relay_txn, [...(byFill.get(r.relay_txn) ?? []), r]);
  return [...byFill.entries()].map(([txn, rs]) =>
    `Relay ${txn} has live fuel records AND ticket ${[...new Set(rs.map((x) => x.ref))].join(", ")} records it on ${[...new Set(rs.map((x) => x.card ?? "no card"))].join("/")} (${rs.map((x) => String(x.fuel_id).slice(0, 8)).join(", ")})`);
}

function staticProblems(src) {
  return receiptRecordProblems(src.other, src.link, src.rows, src.writer);
}

async function live() {
  const sql = otherRailTicketSql(read(OTHER_RAIL_PATH), "r");
  if (!sql) { console.error(`${LABEL}: LIVE FAIL — ${OTHER_RAIL_PATH} has no OTHER_RAIL_TICKET_ROWS_SQL`); process.exit(1); }
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const fills = await client.query(
      `SELECT count(DISTINCT r.id)::int AS n FROM integrations.relay_fuel_transactions r
         JOIN fuel.fuel_transactions f ON f.relay_fuel_transaction_id = r.id AND f.operating_company_id = r.operating_company_id
                                      AND f.voided_at IS NULL AND f.archived_at IS NULL
        WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const res = await client.query(
      `SELECT r.transaction_id AS relay_txn, q.transaction_reference AS ref, q.id::text AS fuel_id,
              (SELECT ct.code FROM catalogs.fuel_card_types ct WHERE ct.id = q.fuel_card_id) AS card
         FROM integrations.relay_fuel_transactions r
         CROSS JOIN LATERAL (${sql}) q
        WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
          AND EXISTS (SELECT 1 FROM fuel.fuel_transactions f WHERE f.relay_fuel_transaction_id = r.id
                       AND f.operating_company_id = r.operating_company_id AND f.voided_at IS NULL AND f.archived_at IS NULL)
        ORDER BY 1, 2, 3`,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");
    const n = fills.rows[0]?.n ?? 0;
    if (n === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 Relay fills with live fuel records for USMCA; an empty result is an instrument claim, not a real zero`);
      process.exit(1);
    }
    const failures = evaluate(res.rows);
    for (const f of failures) console.error(`  ✗ ${f}`);
    if (failures.length) {
      console.error(`${LABEL}: LIVE FAIL — ${failures.length} of ${n} recorded Relay fill(s) are also recorded on another rail`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${n} Relay fills carry live fuel records; 0 of them recorded on another rail too`);
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const real = { other: read(OTHER_RAIL_PATH), link: read(LINK_PATH), rows: read(RELAY_ROWS_ENGINE_PATH), writer: read(RECEIPT_WRITER_PATH) };
  const cases = [
    ["the real sources pass", staticProblems(real).length, 0],
    ["planted: the rule file lost its SQL", staticProblems({ ...real, other: "export const X = 1;" }).length > 0 ? 1 : 0, 1],
    ["planted: the cross-rail check is same-truck only again",
      staticProblems({ ...real, link: (real.link ?? "").replace('CROSS JOIN LATERAL (${OTHER_RAIL_TICKET_ROWS_SQL("r")}) q', "") }).length > 0 ? 1 : 0, 1],
    ["planted: ENG-65 writes before asking",
      staticProblems({ ...real, rows: (real.rows ?? "").replace('"relay_fill_recorded_on_other_rail"', '"x"') }).length > 0 ? 1 : 0, 1],
    ["planted: one recorded fill also on DREAMLINE fails", evaluate([{ relay_txn: "txn_24Adnp8eJXPyUo", ref: "99671555", card: "DREAMLINE", fuel_id: "aaaaaaaa-1" }]).length, 1],
    ["planted: two rows of one ticket are one failure", evaluate([
      { relay_txn: "txn_9j7QyJuFxmaWTP", ref: "99037285", card: "DREAMLINE", fuel_id: "a" },
      { relay_txn: "txn_9j7QyJuFxmaWTP", ref: "99037285", card: "DREAMLINE", fuel_id: "b" }]).length, 1],
    ["no other-rail rows pass", evaluate([]).length, 0],
  ];
  let bad = 0;
  for (const [name, got, want] of cases) {
    console.log(`${got === want ? "ok  " : "FAIL"} ${name} (${got}, want ${want})`);
    if (got !== want) bad++;
  }
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const sp = staticProblems({ other: read(OTHER_RAIL_PATH), link: read(LINK_PATH), rows: read(RELAY_ROWS_ENGINE_PATH), writer: read(RECEIPT_WRITER_PATH) });
  for (const p of sp) console.error(`  ✗ static: ${p}`);
  if (sp.length) { console.error(`${LABEL}: STATIC FAIL — ${sp.length} problem(s)`); process.exit(1); }
  await live();
}
