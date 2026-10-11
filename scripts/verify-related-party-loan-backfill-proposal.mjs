#!/usr/bin/env node
/**
 * 18372 — ROUND 443.22-2f Related-party loan backfill proposal (READ-ONLY).
 *
 * Asserts: owner-facing proposal + machine appendix + measure script exist;
 * proposal is PROPOSAL ONLY (no JE rewrite, no facility INSERT); packet counts
 * 209 / 27 / 182 stay locked; measure script never writes the ledger.
 *
 * Owned paths (gate-step-map):
 *   docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.md
 *   docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.json
 *   scripts/ops/r44322-2f-measure-rpl-postings.mjs
 *
 * Run: node scripts/verify-related-party-loan-backfill-proposal.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-backfill-proposal";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  proposalMd: "docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.md",
  proposalJson: "docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.json",
  measure: "scripts/ops/r44322-2f-measure-rpl-postings.mjs",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

export function staticProblems(srcs) {
  const errors = [];
  const { proposalMd, proposalJson, measure } = srcs;

  // F1 — markdown is proposal-only / read-only law
  if (!proposalMd.includes("PROPOSAL ONLY") && !proposalMd.includes("READ-ONLY")) {
    errors.push("F1: proposal md must declare PROPOSAL ONLY or READ-ONLY");
  }
  if (!proposalMd.includes("no journal entry rewritten") && !proposalMd.includes("Does not UPDATE or reverse")) {
    errors.push("F1: proposal md must forbid rewriting / reversing journal entries");
  }
  if (
    !proposalMd.includes("Does not INSERT into `related_party_loan_entries`") &&
    !proposalMd.includes("Does not INSERT into related_party_loan_entries")
  ) {
    errors.push("F1: proposal md must forbid INSERT into related_party_loan_entries / facilities");
  }
  if (!proposalMd.includes("only on the owner's word") && !proposalMd.includes("Owner decision needed")) {
    errors.push("F1: proposal md must gate backfill on owner word");
  }
  if (!proposalMd.includes("Parent account **2410** is never the facility home") && !proposalMd.includes("never the facility home")) {
    errors.push("F1: proposal md must keep parent 2410 out of facility home");
  }

  // F2 — locked packet counts in markdown
  if (!proposalMd.includes("measured_all_posted = 209") && !proposalMd.includes("**209**")) {
    errors.push("F2: proposal md must lock measured_all_posted = 209");
  }
  if (!proposalMd.includes("measured_live_non_reversed = 27") && !proposalMd.includes("**27**")) {
    errors.push("F2: proposal md must lock measured_live_non_reversed = 27");
  }
  if (!proposalMd.includes("measured_reversed_pairs = 182") && !proposalMd.includes("**182**")) {
    errors.push("F2: proposal md must lock measured_reversed_pairs = 182");
  }

  // F3 — machine appendix JSON matches locked counts + rewrite_journal false
  let json;
  try {
    json = JSON.parse(proposalJson);
  } catch (e) {
    errors.push(`F3: proposal JSON must parse: ${e.message}`);
    return errors;
  }
  const pcc = json.packet_count_check || {};
  if (pcc.measured_all_posted !== 209) {
    errors.push(`F3: packet_count_check.measured_all_posted must be 209 (got ${pcc.measured_all_posted})`);
  }
  if (pcc.measured_live_non_reversed !== 27) {
    errors.push(
      `F3: packet_count_check.measured_live_non_reversed must be 27 (got ${pcc.measured_live_non_reversed})`
    );
  }
  if (pcc.measured_reversed_pairs !== 182) {
    errors.push(
      `F3: packet_count_check.measured_reversed_pairs must be 182 (got ${pcc.measured_reversed_pairs})`
    );
  }
  if (json.operating_company_id !== "5c854333-6ea5-4faa-af31-67cb272fef80") {
    errors.push("F3: proposal JSON must be USMCA-scoped");
  }
  if (json.total_live_candidates !== 27 || json.total_reversed_leave_alone !== 182) {
    errors.push("F3: total_live_candidates / total_reversed_leave_alone must be 27 / 182");
  }
  const live = Array.isArray(json.live_candidates) ? json.live_candidates : [];
  if (live.length !== 27) {
    errors.push(`F3: live_candidates array length must be 27 (got ${live.length})`);
  }
  if (live.some((row) => row.rewrite_journal !== false)) {
    errors.push("F3: every live_candidate must set rewrite_journal: false");
  }
  if (live.some((row) => row.backfill_only_via_engine_on_owner_word !== true)) {
    errors.push("F3: every live_candidate must set backfill_only_via_engine_on_owner_word: true");
  }

  // F4 — measure script is read-only (never writes the ledger)
  if (!measure.includes("READ-ONLY") && !measure.includes("Never writes to the ledger")) {
    errors.push("F4: measure script header must declare READ-ONLY / never writes ledger");
  }
  if (!measure.includes("SET LOCAL app.bypass_rls = 'lucia'")) {
    errors.push("F4: measure must scope with bypass_rls=lucia");
  }
  if (!measure.includes("5c854333-6ea5-4faa-af31-67cb272fef80")) {
    errors.push("F4: measure must hard-scope USMCA");
  }
  if (!measure.includes("rewrite_journal: false")) {
    errors.push("F4: measure proposals must stamp rewrite_journal: false");
  }
  if (!measure.includes("backfill_only_via_engine_on_owner_word")) {
    errors.push("F4: measure proposals must stamp backfill_only_via_engine_on_owner_word");
  }
  // Forbid ledger writers in the measure ops script
  const ledgerWrite =
    /\bINSERT\s+INTO\s+accounting\./i.test(measure) ||
    /\bUPDATE\s+accounting\./i.test(measure) ||
    /\bDELETE\s+FROM\s+accounting\./i.test(measure) ||
    /\bINSERT\s+INTO\s+driver_finance\./i.test(measure) ||
    /\bUPDATE\s+driver_finance\./i.test(measure);
  if (ledgerWrite) {
    errors.push("F4: measure script must not INSERT/UPDATE/DELETE accounting.* or driver_finance.*");
  }
  if (/\brelated_party_loan_entr/i.test(measure) && /\bINSERT\b/i.test(measure) && /related_party_loan_entr/.test(measure.match(/INSERT[\s\S]{0,80}related_party_loan_entr/i)?.[0] || "")) {
    errors.push("F4: measure must not INSERT related_party_loan_entries");
  }

  return errors;
}

function selftest() {
  const good = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const ok = staticProblems(good);
  if (ok.length) fail(["selftest expected PASS on live tree:", ...ok]);

  const brokenMd = good.proposalMd
    .replaceAll("PROPOSAL ONLY", "EXECUTED")
    .replaceAll("READ-ONLY", "WRITE")
    .replaceAll("Does not INSERT into `related_party_loan_entries`", "INSERTS into related_party_loan_entries")
    .replaceAll("Does not UPDATE or reverse", "UPDATES and reverses");
  const badMd = staticProblems({ ...good, proposalMd: brokenMd });
  if (!badMd.some((e) => e.startsWith("F1:"))) {
    fail(["selftest expected F1 failures when proposal law is stripped"]);
  }

  const brokenJson = JSON.parse(good.proposalJson);
  brokenJson.packet_count_check.measured_live_non_reversed = 999;
  brokenJson.total_live_candidates = 999;
  const badJson = staticProblems({ ...good, proposalJson: JSON.stringify(brokenJson) });
  if (!badJson.some((e) => e.startsWith("F3:"))) {
    fail(["selftest expected F3 failures when live count is corrupted"]);
  }

  const brokenMeasure = good.measure
    .replace("Never writes to the ledger", "writes the ledger")
    .replace("rewrite_journal: false", "rewrite_journal: true")
    .replace(
      "backfill_only_via_engine_on_owner_word: !isReversed",
      '/* stripped */'
    );
  const withInsert =
    brokenMeasure +
    "\nawait client.query(`INSERT INTO accounting.journal_entry_postings DEFAULT VALUES`);\n";
  const badMeasure = staticProblems({ ...good, measure: withInsert });
  if (!badMeasure.some((e) => e.startsWith("F4:"))) {
    fail(["selftest expected F4 failures when measure becomes a ledger writer"]);
  }

  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const [k, rel] of Object.entries(FILES)) {
    if (!existsSync(join(ROOT, rel))) fail([`missing file (${k}): ${rel}`]);
  }
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = staticProblems(srcs);
  if (errors.length) fail(errors);
  console.log(`${LABEL} PASS`);
}

main();
