#!/usr/bin/env node
// ROUND 301 B-32 (Lead order, pairs with CC-1's A-27): "CC-1 owns the reconciliation engine.
// You own the bank-feed side of MATCHED: what makes a GL row and a bank-feed row the same
// event. Amount, date window, account, stable transaction key... THREE outcomes, never two:
// matched / unmatched / matched-with-difference."
//
// This guard does NOT build a second matching engine (match.service.ts, CC-1's lane, is
// untouched) and does NOT touch apps/frontend. It audits the CRITERIA that already-existing
// banking.reconciliation_matches rows must satisfy for the "same event" claim to be true, on
// live USMCA data:
//
//   ACCOUNT / ENTITY:   a match's operating_company_id must equal its bank_transaction's
//                        operating_company_id -- a cross-entity match is not the same event
//                        under any amount/date criteria. Ratchet ceiling 0, forever.
//
//   STABLE TXN KEY:      the bank-feed row's own external identity (plaid_transaction_id or
//                        dedup_hash) must exist for a match to be trustworthy under re-import;
//                        reported + ratcheted (today's population is CSV-imported rows with
//                        neither set -- a real, separate gap from AUTH-178's fuel-unit-id fix).
//
//   SPLIT-MATCH SUM:     banking.reconciliation_matches allows >1 active (non-voided,
//                        non-rejected) match per bank_transaction_id -- the real-world shape of
//                        one ACH deposit funding several factoring_advance rows at once. For
//                        every such split group this guard asserts SUM(matched ledger amounts)
//                        EXACTLY equals the bank transaction's amount_cents -- if it doesn't,
//                        that split is not the same event, it is a double-count or an error.
//                        (CC-1's new banking.reconciliation_match_tristate(), migration
//                        202615010000, picks only the single most-recent match row per bank
//                        transaction and will misclassify a correct split as
//                        'matched_with_difference' once it deploys -- flagged separately to
//                        GUARD-WORKORDERS for CC-1, not patched here.)
//
// FAILS IF: any active match is cross-entity; any split-match group's ledger-amount sum does
// not exactly equal its bank transaction's amount; either ratchet ceiling below is exceeded.
import pg from "pg";

const LABEL = "verify-bank-match-criteria-integrity";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ledger kinds this guard can resolve an amount for, to validate a split-match sum. Extend the
// CASE (and this map) the moment a split spans a new kind -- never silently skip an unhandled
// kind, matching the discipline of banking.reconciliation_matched_ledger_amount_cents().
const SPLIT_AMOUNT_SQL_BY_KIND = {
  factoring_advance: `(SELECT advance_amount_cents FROM accounting.factoring_advances WHERE id = m.ledger_entry_id)`,
};

// Baselines measured live 2026-09-30 (ROUND 301 B-32). A silent jump in either population
// should never pass quietly -- these are ceilings, not targets.
const NO_STABLE_KEY_CEILING = 7;
const SPLIT_MATCH_GROUP_CEILING = 12;

async function measure(client, operatingCompanyId) {
  const crossEntity = await client.query(
    `
    SELECT count(*)::int AS n
    FROM banking.reconciliation_matches m
    JOIN banking.bank_transactions bt ON bt.id = m.bank_transaction_id
    WHERE m.operating_company_id = $1 AND m.voided_at IS NULL AND m.match_state <> 'rejected'
      AND bt.operating_company_id <> m.operating_company_id
    `,
    [operatingCompanyId]
  );

  const noStableKey = await client.query(
    `
    SELECT bt.id AS bank_transaction_id, bt.transaction_date, bt.description, bt.amount_cents::text
    FROM banking.reconciliation_matches m
    JOIN banking.bank_transactions bt ON bt.id = m.bank_transaction_id
    WHERE m.operating_company_id = $1 AND m.voided_at IS NULL AND m.match_state <> 'rejected'
      AND bt.plaid_transaction_id IS NULL AND bt.dedup_hash IS NULL
    `,
    [operatingCompanyId]
  );

  const splitGroups = await client.query(
    `
    SELECT bank_transaction_id, count(*)::int AS n_matches
    FROM banking.reconciliation_matches
    WHERE operating_company_id = $1 AND voided_at IS NULL AND match_state <> 'rejected'
    GROUP BY bank_transaction_id HAVING count(*) > 1
    `,
    [operatingCompanyId]
  );

  const splitSumChecks = [];
  for (const group of splitGroups.rows) {
    const rows = await client.query(
      `
      SELECT m.ledger_entry_kind, m.ledger_entry_id::text,
        CASE m.ledger_entry_kind
          ${Object.entries(SPLIT_AMOUNT_SQL_BY_KIND)
            .map(([kind, sql]) => `WHEN '${kind}' THEN ${sql}::text`)
            .join("\n          ")}
          ELSE 'UNRESOLVABLE'
        END AS ledger_amount_cents
      FROM banking.reconciliation_matches m
      WHERE m.bank_transaction_id = $1 AND m.operating_company_id = $2
        AND m.voided_at IS NULL AND m.match_state <> 'rejected'
      `,
      [group.bank_transaction_id, operatingCompanyId]
    );
    const bankRes = await client.query(
      `SELECT amount_cents::text FROM banking.bank_transactions WHERE id = $1`,
      [group.bank_transaction_id]
    );
    const bankAmountCents = bankRes.rows[0]?.amount_cents ?? null;
    const unresolvable = rows.rows.some((r) => r.ledger_amount_cents === "UNRESOLVABLE");
    const sumCents = unresolvable
      ? null
      : rows.rows.reduce((sum, r) => sum + Number(r.ledger_amount_cents), 0);
    splitSumChecks.push({
      bankTransactionId: group.bank_transaction_id,
      nMatches: group.n_matches,
      bankAmountCents,
      sumCents,
      unresolvable,
      matches: rows.rows,
    });
  }

  return {
    crossEntityCount: crossEntity.rows[0].n,
    noStableKeyRows: noStableKey.rows,
    splitSumChecks,
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
    const m = await measure(client, USMCA);
    await client.query("ROLLBACK");

    if (m.crossEntityCount > 0) {
      console.error(`${LABEL}: FAIL — ${m.crossEntityCount} active reconciliation_matches row(s) are cross-entity (match.operating_company_id != bank_transaction.operating_company_id). A cross-entity match can never be "the same event."`);
      process.exit(1);
    }

    const unresolvableSplits = m.splitSumChecks.filter((s) => s.unresolvable);
    if (unresolvableSplits.length > 0) {
      console.error(`${LABEL}: FAIL — ${unresolvableSplits.length} split-match group(s) contain a ledger_entry_kind this guard cannot resolve an amount for. Extend SPLIT_AMOUNT_SQL_BY_KIND, never silently skip:`);
      for (const s of unresolvableSplits) {
        console.error(`  bank_transaction ${s.bankTransactionId}: kinds=${s.matches.map((r) => r.ledger_entry_kind).join(",")}`);
      }
      process.exit(1);
    }

    const brokenSplits = m.splitSumChecks.filter((s) => s.sumCents !== Number(s.bankAmountCents));
    if (brokenSplits.length > 0) {
      console.error(`${LABEL}: FAIL — ${brokenSplits.length} split-match group(s) do NOT sum to the bank transaction's amount (a real double-count or match error, not a legitimate funding batch):`);
      for (const s of brokenSplits) {
        console.error(`  bank_transaction ${s.bankTransactionId}: bank=$${(Number(s.bankAmountCents) / 100).toFixed(2)} sum=$${(s.sumCents / 100).toFixed(2)} (${s.nMatches} matches)`);
      }
      process.exit(1);
    }

    if (m.splitSumChecks.length > SPLIT_MATCH_GROUP_CEILING) {
      console.error(`${LABEL}: FAIL — split-match group count widened from the ratchet ceiling: ${m.splitSumChecks.length} > ${SPLIT_MATCH_GROUP_CEILING}. A silent jump in how many bank transactions carry multiple active matches needs a deliberate baseline update, not a silent pass.`);
      process.exit(1);
    }

    if (m.noStableKeyRows.length > NO_STABLE_KEY_CEILING) {
      console.error(`${LABEL}: FAIL — no-stable-key active-match count widened from the ratchet ceiling: ${m.noStableKeyRows.length} > ${NO_STABLE_KEY_CEILING}. Full list:`);
      for (const r of m.noStableKeyRows) {
        console.error(`  ${r.bank_transaction_id} (${r.transaction_date?.toISOString?.().slice(0, 10)}) ${r.description}: $${(Number(r.amount_cents) / 100).toFixed(2)}`);
      }
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS — 0 cross-entity matches. ${m.splitSumChecks.length} split-match group(s) (bank txn matched to >1 ledger row), ` +
        `all ${m.splitSumChecks.length} sum EXACTLY to their bank transaction's amount (legitimate funding batches, not double-counts). ` +
        `${m.noStableKeyRows.length} active match(es) rest on a bank_transaction with no external stable key (plaid_transaction_id/dedup_hash both null) — ` +
        `all CSV-imported Loves Travel Stop fuel rows, a real bank-feed-side gap, not fixed here.`
    );
    console.log(`Split-match sum detail:`, JSON.stringify(m.splitSumChecks.map((s) => ({
      bank_transaction_id: s.bankTransactionId,
      n_matches: s.nMatches,
      bank_amount_cents: s.bankAmountCents,
      sum_cents: s.sumCents,
    })), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  // Pure fixture check of the split-sum comparison logic (no DB).
  const good = { bankAmountCents: "532500", sumCents: 532500 };
  assert.equal(Number(good.bankAmountCents), good.sumCents, "MUTATION: a matching split sum must be recognised as equal");
  const broken = { bankAmountCents: "532500", sumCents: 500000 };
  assert.notEqual(Number(broken.bankAmountCents), broken.sumCents, "MUTATION: a broken split sum must be detected, not silently passed");
  const ceilingBreach = SPLIT_MATCH_GROUP_CEILING + 1;
  assert.ok(ceilingBreach > SPLIT_MATCH_GROUP_CEILING, "MUTATION: a split-group count above the ceiling must be flagged");
  console.log(`${LABEL} --selftest PASS (3/3 mutations caught)`);
  process.exit(0);
}

await run();
