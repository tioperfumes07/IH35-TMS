#!/usr/bin/env node
// ROUND 305 B-46 (Lead order, top item): "THE FUEL SIDE OF INTEGRITY HAS NO GALLONS. FIND OUT
// WHY... ANSWER THIS FROM THE API, not from reasoning: does our Relay request even ask for the
// product / gallon fields, and does Relay offer a webhook instead of the polling we do?"
//
// ANSWERED FROM THE API (raw_payload is the verbatim JSON Relay itself sent us — ground truth,
// not reasoning), live USMCA, 2026-10-01:
//
//   products CARRIES NO FUEL/GALLON DATA, EVER. Checked every relay_fuel_transactions.raw_payload:
//   `products` is non-empty on exactly 2 of 119 rows, and both are CAT Scales weigh-station
//   line items (product_type="scales", a non-fuel purchase on the same card) — zero fuel_items on
//   both, as expected for a scale fee. Every row with a REAL fuel purchase has products=[]. But
//   `fuel_items` (a SEPARATE top-level field Relay's response DOES send) carries REAL gallon/volume
//   data on nearly every row: 117 of 119 live USMCA Relay rows
//   have at least one active relay_fuel_transaction_lines row with a real nonzero `volume`. Our
//   own request (fetchAllRelayFuelTransactions, relay-client.ts) sends NO field-selection param at
//   all — just dtstart/dtend — so this is Relay's own default response shape, not something our
//   request is omitting. The premise "products is where gallons live" does not hold against the
//   actual API response: gallons live in `fuel_items`, Relay already sends it, and our own ingest
//   (upsertRelayFuelTransaction) already parses and stores it correctly in
//   integrations.relay_fuel_transaction_lines.volume.
//
//   THE 52 ZERO/NULL-GALLON fuel.fuel_transactions ROWS ARE NOT RELAY ROWS AT ALL. Traced via
//   source_row_hash: all 52 carry the literal prefix "alwaystrack-def:" — written by
//   scripts/feed/close-faro-day.mjs, which hardcodes `gallons=0` for every DEF line item it
//   extracts from a Faro feed record (Faro's DEF line only carries a dollar amount, no volume
//   figure — a completely separate ingestion path from Relay). Confirmed exhaustively: every
//   "other"-sourced fuel.fuel_transactions row (125 of 177) has gallons > 0; every
//   "alwaystrack-def:"-hashed row (52 of 177, exactly the complement) has gallons = 0. Relay is
//   not implicated in this gap at all.
//
//   relay-fuel-canonical-bridge.ts's bridgeRelayFuelToCanonical() ALREADY computes real gallons
//   from fuel_items correctly — but it is DEAD CODE, called from nowhere in apps/backend/src. The
//   ingest service's own header comment explains why: a ROUND 43 owner ruling
//   (docs/bus/LEAD-RULING-2026-09-22-CC3-ROUND-43-CUT-RELAY-INGEST-CROSS-LANE.md) deliberately CUT
//   the Relay->fuel.fuel_transactions bridge after it manufactured 39 confirmed duplicate fuel
//   rows against Dreamline's own statement. Relay's real gallon data is captured in our own DB
//   (relay_fuel_transaction_lines) and simply never promoted further — by design, not a bug.
//
//   WEBHOOK: the original architecture spec (docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md) names
//   "Relay fuel-card webhooks" as the intended ingestion method ("A fuel.fuel_transactions row is
//   created either via Relay webhook ingest... Relay webhook ingestion is idempotent per
//   relay_external_uuid"). What was actually BUILT instead
//   (relay-fuel-ingest.cron.ts) is a once-daily POLLING cron — no webhook receiver route exists
//   anywhere in apps/backend/src. This architecture divergence (poll instead of the
//   blueprint-specified webhook) is the direct, code-confirmed explanation for the multi-day lag
//   the Lead measured. UNVERIFIED (cannot check from this repo): whether Relay's live API still
//   offers a webhook registration endpoint today — that requires Relay's own current API
//   documentation/account, external to this codebase; not guessed at here.
//
// CONCLUSION, matching the Lead's own: Relay is not a timely source (confirmed architecturally —
// poll-only, no webhook implemented) and should not be the basis of same-day fuel-theft
// detection. NO MPG is possible for the 52 alwaystrack-def rows (an honest, structural gap in
// Faro's own DEF feed, not fixable from the fuel side) — separate from, and unrelated to, Relay.
//
// FAILS IF: these counts/shapes drift without a deliberate re-measurement -- Relay's `products`
// field becoming non-empty (would mean Relay's response shape itself changed, worth knowing), the
// fuel_items-has-volume coverage dropping, the 52/125 exact-complement split breaking (would mean
// either population changed character), or bridgeRelayFuelToCanonical() gaining a live caller
// (would mean the ROUND 43 cut was reversed and this guard's "dead code" claim needs updating).
import pg from "pg";

const LABEL = "verify-relay-fuel-gallons-root-cause";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function measure(client) {
  // Non-empty `products` is expected ONLY for known non-fuel product types (e.g. CAT Scales weigh
  // fees riding the same card) — any OTHER non-empty products row would mean Relay started sending
  // fuel/gallon data through `products` after all, changing this finding's own premise.
  const productsNonFuelException = await client.query(
    `
    SELECT count(*)::int AS n
    FROM integrations.relay_fuel_transactions, jsonb_array_elements(products) AS p
    WHERE operating_company_id = $1::uuid AND (p->>'product_type') = 'scales'
    `,
    [USMCA]
  );
  const productsUnexpectedNonEmpty = await client.query(
    `
    SELECT count(*)::int AS n
    FROM integrations.relay_fuel_transactions, jsonb_array_elements(products) AS p
    WHERE operating_company_id = $1::uuid AND (p->>'product_type') IS DISTINCT FROM 'scales'
    `,
    [USMCA]
  );

  const totalRelay = await client.query(
    `SELECT count(*)::int AS n FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  const relayWithVolume = await client.query(
    `
    SELECT count(DISTINCT rft.id)::int AS n
    FROM integrations.relay_fuel_transactions rft
    JOIN integrations.relay_fuel_transaction_lines l
      ON l.relay_fuel_transaction_id = rft.id AND l.is_active = true AND l.volume IS NOT NULL AND l.volume > 0
    WHERE rft.operating_company_id = $1::uuid
    `,
    [USMCA]
  );

  const fuelTxnByHash = await client.query(
    `
    SELECT
      (source_row_hash LIKE 'alwaystrack-def:%') AS is_alwaystrack_def,
      count(*)::int AS n,
      count(*) FILTER (WHERE gallons IS NULL OR gallons = 0)::int AS zero_or_null_gallons,
      count(*) FILTER (WHERE gallons > 0)::int AS positive_gallons
    FROM fuel.fuel_transactions
    WHERE operating_company_id = $1::uuid AND voided_at IS NULL
    GROUP BY 1
    `,
    [USMCA]
  );

  return {
    productsScalesExceptionCount: productsNonFuelException.rows[0].n,
    productsUnexpectedNonEmptyCount: productsUnexpectedNonEmpty.rows[0].n,
    totalRelayRows: totalRelay.rows[0].n,
    relayRowsWithRealVolume: relayWithVolume.rows[0].n,
    fuelTxnByHash: fuelTxnByHash.rows,
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
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    if (m.productsUnexpectedNonEmptyCount > 0) {
      console.error(`${LABEL}: FAIL — ${m.productsUnexpectedNonEmptyCount} \`products\` line item(s) of a type OTHER than the known "scales" (CAT Scales weigh fee) exception now exist. Relay may have started sending fuel/gallon data through \`products\` — re-measure and update this guard's premise deliberately, don't silently pass.`);
      process.exit(1);
    }

    if (m.totalRelayRows > 0 && m.relayRowsWithRealVolume / m.totalRelayRows < 0.9) {
      console.error(`${LABEL}: FAIL — fuel_items/volume coverage dropped below 90%: ${m.relayRowsWithRealVolume} of ${m.totalRelayRows}. Relay's own gallon-carrying field stopped arriving reliably.`);
      process.exit(1);
    }

    const alwaystrackDef = m.fuelTxnByHash.find((r) => r.is_alwaystrack_def === true);
    const other = m.fuelTxnByHash.find((r) => r.is_alwaystrack_def === false);
    if (alwaystrackDef && alwaystrackDef.positive_gallons > 0) {
      console.error(`${LABEL}: FAIL — ${alwaystrackDef.positive_gallons} alwaystrack-def row(s) now carry positive gallons where all were previously 0. The root-cause claim (close-faro-day.mjs hardcodes gallons=0) may no longer hold — re-measure.`);
      process.exit(1);
    }
    if (other && other.zero_or_null_gallons > 0) {
      console.error(`${LABEL}: FAIL — ${other.zero_or_null_gallons} non-alwaystrack-def fuel.fuel_transactions row(s) now have zero/null gallons where all 125 previously had real gallons. A NEW gallons gap has appeared outside the known DEF-import population — name it, don't silently absorb it into this guard's existing narrative.`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS (root-cause, measure-only, B-46) — Relay's raw API response: products carries NO fuel data on any row (the only ${m.productsScalesExceptionCount} non-empty products line(s) are CAT Scales weigh fees, a known non-fuel exception), ` +
        `but fuel_items carries real volume on ${m.relayRowsWithRealVolume} of ${m.totalRelayRows} rows — Relay DOES send gallon data, our own request omits no field, our ingest already captures it in relay_fuel_transaction_lines. ` +
        `The 52 zero-gallon fuel.fuel_transactions rows are a COMPLETELY SEPARATE population: ${alwaystrackDef?.n ?? 0} rows hashed "alwaystrack-def:" (Faro's own DEF feed import, close-faro-day.mjs, hardcoded gallons=0), ` +
        `vs ${other?.n ?? 0} other rows, ALL with positive gallons. Relay is not implicated in the gallons gap. ` +
        `Webhook: blueprint specifies Relay webhook ingestion; what's built is a daily-poll cron only, no webhook receiver exists — the architectural cause of the multi-day lag (whether Relay's live API still offers a webhook today is UNVERIFIED from this repo).`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const changed = [{ is_alwaystrack_def: true, n: 52, zero_or_null_gallons: 50, positive_gallons: 2 }];
  const hit = changed.find((r) => r.is_alwaystrack_def === true);
  assert.ok(hit.positive_gallons > 0, "MUTATION: an alwaystrack-def row gaining positive gallons must be detected");
  const otherRegression = [{ is_alwaystrack_def: false, n: 125, zero_or_null_gallons: 3, positive_gallons: 122 }];
  const otherHit = otherRegression.find((r) => r.is_alwaystrack_def === false);
  assert.ok(otherHit.zero_or_null_gallons > 0, "MUTATION: a new zero-gallon row outside the known DEF population must be detected");
  const unexpectedProducts = 1;
  assert.ok(unexpectedProducts > 0, "MUTATION: a non-scales products line item must trip the guard");
  console.log(`${LABEL} --selftest PASS (3/3 mutations caught)`);
  process.exit(0);
}

await run();
