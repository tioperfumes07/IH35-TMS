#!/usr/bin/env node
/**
 * PROGRAM-TRACKER-F08 — the `scenario.advance` probe SQL in scenario-registry.ts compared
 * accounting.journal_entry_postings.source_transaction_id / accounting.posting_batches.
 * source_transaction_id (both `text` — a polymorphic-source column, not always a uuid) against
 * driver_finance.driver_advances.id (`uuid`) with a bare `=`. Postgres rejects that outright:
 * "operator does not exist: text = uuid". Because every hop/scenario probe in this request runs
 * on ONE shared client/transaction (scenario-tracker.service.ts's livePassedPredicate calls
 * client.query(def.probe.sql, ...) with no per-probe isolation), that single throw poisoned the
 * whole transaction and cascaded "current transaction is aborted" onto every OTHER probe that ran
 * after it on the same connection — the live /program Scenario Tracker showed "STALE — source
 * accounting.bills unreachable (+38 more)" for the entire team, not just this one scenario card.
 * Confirmed live via direct Neon query before and after the fix.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/home/scenario-registry.ts";
const source = fs.readFileSync(FILE, "utf8");

function advanceProbeBlock(text) {
  const start = text.indexOf('key: "scenario.advance"');
  const end = text.indexOf('key: "scenario.deductions"', start);
  return start >= 0 && end > start ? text.slice(start, end) : "";
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };

  const block = advanceProbeBlock(text);
  need(block.length > 0, "the scenario.advance probe block was not found (registry shape changed?)");
  need(
    /jep\.source_transaction_id = a\.id::text/.test(block),
    "jep.source_transaction_id must be compared against a.id::text (jep.source_transaction_id is text, a.id is uuid)"
  );
  need(
    /pb\.source_transaction_id = a\.id::text/.test(block),
    "pb.source_transaction_id must be compared against a.id::text (pb.source_transaction_id is text, a.id is uuid)"
  );
  // The exact bare-comparison bug that shipped: no ::text cast at all.
  need(
    !/source_transaction_id = a\.id(?!::text)\b/.test(block.replace(/a\.id::text/g, "")),
    "no bare `source_transaction_id = a.id` (uncast) comparison may remain -- text = uuid throws and poisons the shared request transaction"
  );

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-scenario-advance-probe-uuid-cast FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop cast on jep.source_transaction_id", mutate: (t) => t.replace("jep.source_transaction_id = a.id::text", "jep.source_transaction_id = a.id") },
    { name: "drop cast on pb.source_transaction_id", mutate: (t) => t.replace("pb.source_transaction_id = a.id::text", "pb.source_transaction_id = a.id") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-scenario-advance-probe-uuid-cast SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-scenario-advance-probe-uuid-cast PASS — scenario.advance probe casts uuid before comparing against the text source_transaction_id columns");
