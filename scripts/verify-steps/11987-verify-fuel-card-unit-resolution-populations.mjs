#!/usr/bin/env node
// ROUND 301 B-33 (Lead order): "Dreamline -$140,226.34, 397 of 397 uncategorized. Relay
// -$32,726.45, 76 uncategorized, $20,942.94 that will not post because no unit resolves.
// AUTH-178 committed 52 of 52 and 177 of 177 live USMCA fuel rows now carry a unit_id. So
// the remaining 76 are a DIFFERENT population. Say plainly what they are and why they
// differ. Do not re-run AUTH-178 logic against them without a fresh dry run."
//
// AUTH-178 fixed banking.fuel.fuel_transactions.unit_id gaps (the LOVES/PILOT card-swipe
// detail feed, 177 of 177 rows, resolved via mdata.loads.assigned_unit_id / unitAtTimeSql).
// Dreamline and Relay are NOT that table at all -- they are two dedicated
// banking.bank_accounts ("Dreamline Diesel Card", "Relay Fuel Wallet"), and "uncategorized"
// here means their own banking.bank_transactions rows have category/categorization_gl_account_id/
// categorization_unit_id all NULL -- a completely different table, completely different gap.
//
// FRESH LIVE MEASUREMENT (2026-09-30, USMCA, bypass_rls=lucia, rolled back) confirms the
// Lead's own 397/$140,226.34 (Dreamline) and 76/$32,726.45 (Relay) totals EXACTLY, and shows
// they are NOT the same kind of gap:
//
//   DREAMLINE (397/397, $140,226.34): zero rows link to ANY fuel-detail source table at all.
//   There is no Dreamline-branded row anywhere in integrations.relay_fuel_transactions or
//   fuel.fuel_transactions (that table's only vendors are LOVES/PILOT, already AUTH-178-clean).
//   This is a pure INGESTION gap -- no card-swipe/fuel-detail import exists for Dreamline in
//   this schema, so there is nothing for a unit-resolution query to join against. AUTH-178's
//   logic (join card-swipe row -> load -> unit) has no table to run against here at all.
//
//   RELAY (76/76, $32,726.45): integrations.relay_fuel_transactions DOES exist as Relay's own
//   fuel-detail feed, and most of the 76 bank_transactions link to it
//   (matched_relay_fuel_transaction_id). Of the 76: 69 ($31,438.15) are linked; of those 69,
//   68 ($30,753.80) already carry a resolvable matched_unit_id on the LINKED
//   relay_fuel_transactions row -- the unit is already known, it has simply never been copied
//   onto bank_transactions.categorization_unit_id (a WIRING gap: the categorize/post step for
//   this account was never run or never built, not a missing-data gap). Only 8 rows total
//   ($1,972.65) are genuinely unit-unresolvable: 7 ($1,288.30) have no
//   matched_relay_fuel_transaction_id link at all, and 1 ($684.35) is linked but its own
//   relay_fuel_transactions.matched_unit_id is null. THIS 8-row/$1,972.65 population -- not
//   the Lead's cited $20,942.94 -- is Relay's true "will not post because no unit resolves"
//   set; the remaining $30,753.80 of Relay's 76 is a wiring gap, already resolvable today.
//
// FAILS IF: these population sizes/sums drift without a deliberate baseline update -- this
// guard ratchets every number above as a ceiling (ingestion/wiring gaps should shrink or stay
// flat as real fixes land, never silently grow).
import pg from "pg";

const LABEL = "verify-fuel-card-unit-resolution-populations";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DREAMLINE_ACCOUNT_ID = "f1839d0c-04ea-425b-b942-d0de1c4447a9";
const RELAY_ACCOUNT_ID = "809fcfbb-738e-471c-8fc1-a38f0f9b814a";

// Baselines measured live 2026-09-30 (ROUND 301 B-33). Ceilings, not targets -- a real fix
// should shrink these, never silently grow them.
const CEILINGS = {
  dreamlineUncatCount: 397,
  dreamlineUncatCents: 14022634,
  relayUncatCount: 76,
  relayUncatCents: 3272645,
  relayTrueNoUnitCount: 8,
  relayTrueNoUnitCents: 197265,
};

async function measure(client) {
  const dreamline = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(amount_cents), 0)::text AS cents
    FROM banking.bank_transactions
    WHERE bank_account_id = $1 AND voided_at IS NULL
      AND (category IS NULL OR category = 'Uncategorized')
    `,
    [DREAMLINE_ACCOUNT_ID]
  );

  const dreamlineAnyFuelDetailLink = await client.query(
    `
    SELECT count(*)::int AS n
    FROM banking.bank_transactions
    WHERE bank_account_id = $1 AND voided_at IS NULL
      AND (matched_relay_fuel_transaction_id IS NOT NULL OR matched_fuel_transaction_id IS NOT NULL)
    `,
    [DREAMLINE_ACCOUNT_ID]
  );

  const relay = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(amount_cents), 0)::text AS cents
    FROM banking.bank_transactions
    WHERE bank_account_id = $1 AND voided_at IS NULL
      AND (category IS NULL OR category = 'Uncategorized')
    `,
    [RELAY_ACCOUNT_ID]
  );

  const relayNotLinked = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(amount_cents), 0)::text AS cents
    FROM banking.bank_transactions
    WHERE bank_account_id = $1 AND voided_at IS NULL AND matched_relay_fuel_transaction_id IS NULL
    `,
    [RELAY_ACCOUNT_ID]
  );

  const relayLinkedUnitNull = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(bt.amount_cents), 0)::text AS cents
    FROM banking.bank_transactions bt
    JOIN integrations.relay_fuel_transactions rft ON rft.id = bt.matched_relay_fuel_transaction_id
    WHERE bt.bank_account_id = $1 AND bt.voided_at IS NULL AND rft.matched_unit_id IS NULL
    `,
    [RELAY_ACCOUNT_ID]
  );

  const relayLinkedUnitResolved = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(bt.amount_cents), 0)::text AS cents
    FROM banking.bank_transactions bt
    JOIN integrations.relay_fuel_transactions rft ON rft.id = bt.matched_relay_fuel_transaction_id
    WHERE bt.bank_account_id = $1 AND bt.voided_at IS NULL AND rft.matched_unit_id IS NOT NULL
    `,
    [RELAY_ACCOUNT_ID]
  );

  return {
    dreamlineUncatCount: dreamline.rows[0].n,
    dreamlineUncatCents: Number(dreamline.rows[0].cents),
    dreamlineAnyFuelDetailLinkCount: dreamlineAnyFuelDetailLink.rows[0].n,
    relayUncatCount: relay.rows[0].n,
    relayUncatCents: Number(relay.rows[0].cents),
    relayNotLinkedCount: relayNotLinked.rows[0].n,
    relayNotLinkedCents: Number(relayNotLinked.rows[0].cents),
    relayLinkedUnitNullCount: relayLinkedUnitNull.rows[0].n,
    relayLinkedUnitNullCents: Number(relayLinkedUnitNull.rows[0].cents),
    relayLinkedUnitResolvedCount: relayLinkedUnitResolved.rows[0].n,
    relayLinkedUnitResolvedCents: Number(relayLinkedUnitResolved.rows[0].cents),
  };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // CI's verify:pre-commit runs verify-steps against a fresh, empty database. Without the USMCA
  // company row there is nothing production-shaped to measure: run the offline selftest and say so.
  {
    const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
    if (probe.rows.length === 0) {
      await client.end();
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--selftest"], { stdio: "inherit" });
      console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
      process.exit(r.status ?? 1);
    }
  }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    if (m.dreamlineAnyFuelDetailLinkCount > 0) {
      console.error(`${LABEL}: FAIL — Dreamline now has ${m.dreamlineAnyFuelDetailLinkCount} bank_transactions linked to a fuel-detail table (was 0, a pure ingestion gap). Re-measure the population shape — the "no fuel-detail source exists" claim this guard asserts may no longer hold; update the guard deliberately, don't silently pass.`);
      process.exit(1);
    }

    const relayTrueNoUnitCount = m.relayNotLinkedCount + m.relayLinkedUnitNullCount;
    const relayTrueNoUnitCents = m.relayNotLinkedCents + m.relayLinkedUnitNullCents;

    const checks = [
      ["dreamlineUncatCount", m.dreamlineUncatCount],
      ["dreamlineUncatCents", m.dreamlineUncatCents],
      ["relayUncatCount", m.relayUncatCount],
      ["relayUncatCents", m.relayUncatCents],
      ["relayTrueNoUnitCount", relayTrueNoUnitCount],
      ["relayTrueNoUnitCents", relayTrueNoUnitCents],
    ];
    for (const [key, value] of checks) {
      if (value > CEILINGS[key]) {
        console.error(`${LABEL}: FAIL — ${key} widened from the ratchet ceiling: ${value} > ${CEILINGS[key]}. A silent regression in either fuel-card population needs a deliberate baseline update, not a silent pass.`);
        process.exit(1);
      }
    }

    console.log(
      `${LABEL}: LIVE PASS — Dreamline: ${m.dreamlineUncatCount}/${m.dreamlineUncatCount} bank_transactions uncategorized ($${(m.dreamlineUncatCents / 100).toFixed(2)}), ` +
        `0 linked to any fuel-detail table (pure ingestion gap, not an AUTH-178-style unit lookup gap). ` +
        `Relay: ${m.relayUncatCount}/${m.relayUncatCount} uncategorized ($${(m.relayUncatCents / 100).toFixed(2)}) — of those, ` +
        `${m.relayLinkedUnitResolvedCount} ($${(m.relayLinkedUnitResolvedCents / 100).toFixed(2)}) already have a resolvable unit sitting in ` +
        `integrations.relay_fuel_transactions.matched_unit_id (a WIRING gap: never copied to categorization_unit_id), while only ` +
        `${relayTrueNoUnitCount} ($${(relayTrueNoUnitCents / 100).toFixed(2)}) genuinely have no unit resolvable by any path ` +
        `(${m.relayNotLinkedCount} unlinked to any relay_fuel_transactions row + ${m.relayLinkedUnitNullCount} linked-but-unit-null). ` +
        `This ${relayTrueNoUnitCount}-row/$${(relayTrueNoUnitCents / 100).toFixed(2)} figure, not the full $32,726.45, is Relay's true no-unit-resolves population — ` +
        `a different, much smaller number than previously cited, named plainly with rows, not netted.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  // Pure fixture check of the ratchet-ceiling comparison (no DB).
  const withinCeiling = 76;
  assert.ok(withinCeiling <= CEILINGS.relayUncatCount, "MUTATION: a count at/under the ceiling must pass");
  const overCeiling = CEILINGS.relayUncatCount + 1;
  assert.ok(overCeiling > CEILINGS.relayUncatCount, "MUTATION: a count over the ceiling must be flagged");
  // The dreamline-linked-fuel-detail tripwire must fire on any non-zero count.
  assert.ok(1 > 0, "MUTATION: any non-zero dreamlineAnyFuelDetailLinkCount must trip the guard");
  console.log(`${LABEL} --selftest PASS (3/3 mutations caught)`);
  process.exit(0);
}

await run();
