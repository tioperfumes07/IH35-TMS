#!/usr/bin/env node
/**
 * verify-bank-dom-05-intercompany-reciprocal-legs (BANK-DOM-05)
 *
 * THE DEFECT THIS PINS. `banking/transfers.service.ts` binds BOTH transfer legs to a single
 * `operating_company_id` (`validateAccountOwnership(client, input.operatingCompanyId, ...)` called
 * twice, then one INSERT carrying one `operating_company_id`). A TRANSP<->USMCA or TRANSP<->TRK bank
 * movement therefore CANNOT be expressed: one side's account fails ownership validation and the
 * transfer is rejected outright. There is no intercompany path, no reciprocal leg, and nothing that
 * nets to zero on consolidation.
 *
 * Verified on prod br-fancy-credit-akjnd07a 2026-07-26 (bypass_rls=lucia, positive control
 * mdata.vendors=2789): all three opcos are is_active=true; `banking.transfers` = 0 rows;
 * `banking.intercompany_entity_pairs` = MISSING; only USMCA carries an intercompany account
 * (`8000` / system_purpose `intercompany_ih35`), TRANSP and TRK carry none.
 *
 * THE INVARIANT. An INTER-entity transfer must produce TWO linked records — one in each entity's own
 * book (STMT-3: "read-only roll-up with elimination, NEVER shared rows") — sharing one
 * `intercompany_transfer_group_id`, with reciprocal intercompany legs that net to zero, and the
 * intercompany account resolved DETERMINISTICALLY from the owner-editable entity-pair map rather than
 * by the vendor/customer NAME matching that consolidated-statements.service.ts admits it falls back on.
 *
 * WHY THESE ASSERTIONS AND NOT A ROW COUNT. `banking.transfers` is empty on prod, so a data-shaped
 * check would pass vacuously forever. This is a STATIC guard over the writer: it fails while the
 * capability is absent from the code, and keeps failing if someone later removes it.
 *
 * A5 exists to stop the C2 split-brain the owner named explicitly: prod already established the
 * "Inter-company - <Counterparty>" / `intercompany_<x>` convention on USMCA 8000. Introducing a
 * parallel "Due to / Due from" style alongside it is a second canonical shape for one concept.
 *
 * Usage:  node scripts/verify-bank-dom-05-intercompany-reciprocal-legs.mjs [--selftest]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE = "apps/backend/src/banking/transfers.service.ts";
const MIGRATION_GLOB_HINT = "db/migrations/*_bank_dom_05_intercompany_transfers.sql";

/** Each assertion: fails on the pre-fix source, passes on the fixed source. */
const ASSERTIONS = [
  {
    id: "A1-GROUP-ID",
    why: "the two legs of one intercompany movement must be joinable — a shared group id is the join",
    test: (src) => /intercompany_transfer_group_id/.test(src),
    fail: "transfers.service.ts never references intercompany_transfer_group_id — the two legs cannot be tied together",
  },
  {
    id: "A2-TWO-LEGS",
    why: "STMT-3 locks 'never shared rows' — each entity books its own row, so the writer must insert BOTH",
    test: (src) => /insertIntercompanyLegs|createIntercompanyTransfer/.test(src),
    fail: "no intercompany writer (createIntercompanyTransfer / insertIntercompanyLegs) — inter-entity transfer is unrepresentable",
  },
  {
    id: "A3-COUNTERPARTY-SCOPED",
    why: "the far leg belongs to the COUNTERPARTY's book; validating it against the initiator's opco is the defect",
    test: (src) => /counterparty_company_id|counterpartyCompanyId/.test(src),
    fail: "no counterparty company is ever resolved — both legs still bind to a single operating_company_id",
  },
  {
    id: "A4-PAIR-MAP-NOT-NAME-MATCH",
    why: "elimination must be deterministic; consolidated-statements.service.ts falls back on vendor/customer NAME identity",
    test: (src) => /intercompany_entity_pairs/.test(src),
    fail: "the intercompany account is not resolved from banking.intercompany_entity_pairs — name-matching is not a link",
  },
  {
    id: "A5-NO-DUE-TO-FROM-SPLIT-BRAIN",
    why: "prod established intercompany_<x> on USMCA 8000; a parallel due-to/due-from convention is a C2 split-brain",
    test: (src) => !/due_to_account|due_from_account|'due_to'|'due_from'|"due_to"|"due_from"/.test(src),
    fail: "a parallel due-to/due-from account convention was introduced alongside the existing intercompany_<x> pattern",
  },
  {
    id: "A6-NETS-TO-ZERO",
    why: "the acceptance bar is that the pair nets to zero; the writer must assert it, not hope for it",
    test: (src) => /assertIntercompanyLegsNetToZero|netsToZero|net_to_zero/.test(src),
    fail: "nothing asserts the reciprocal legs net to zero — an unbalanced pair could be written silently",
  },
  {
    id: "A7-POSTER-REUSE-NO-NEW-GL-MATH",
    why: "Rule 13 / §2: reuse the existing poster, never hand-roll journal lines in a feature service",
    // NOTE: matches journal_entries / journal_entry_postings / journal_entry_lines. An earlier version
    // of this pattern required the literal `journal_entry` and therefore could NOT match
    // `accounting.journal_entries` — the real table name. The selftest caught it; the pattern was
    // widened rather than the test weakened.
    test: (src) => !/INSERT\s+INTO\s+accounting\.journal_entr(y|ies)/i.test(src),
    fail: "transfers.service.ts writes journal rows directly — new GL math in a feature service (must reuse the poster)",
  },
];

function readSource(path) {
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${path} not found`);
    process.exit(1);
  }
  return readFileSync(abs, "utf8");
}

function run(src, label) {
  const failures = [];
  for (const a of ASSERTIONS) {
    if (!a.test(src)) failures.push(`  [${a.id}] ${a.fail}\n      why: ${a.why}`);
  }
  if (failures.length) {
    console.error(`FAIL (${label}): ${failures.length} of ${ASSERTIONS.length} BANK-DOM-05 assertions unmet\n${failures.join("\n")}`);
    console.error(`\n  Fix: implement the intercompany transfer path in ${SERVICE}`);
    console.error(`  and land ${MIGRATION_GLOB_HINT} (pair map + group/counterparty columns).`);
    return false;
  }
  console.log(`PASS (${label}): all ${ASSERTIONS.length} BANK-DOM-05 assertions met`);
  return true;
}

/**
 * --selftest: mutate REAL source, one case per assertion, each deleting exactly what that assertion
 * requires. A case whose mutation did not change the source is REJECTED as inert (it would prove
 * nothing). Also asserts the CORRECTED shape is not flagged — a false positive burns trust as fast
 * as a miss.
 */
function selftest() {
  const real = readSource(SERVICE);
  const mutations = [
    ["A1-GROUP-ID", (s) => s.replace(/intercompany_transfer_group_id/g, "unrelated_column")],
    ["A2-TWO-LEGS", (s) => s.replace(/insertIntercompanyLegs|createIntercompanyTransfer/g, "createPlainTransfer")],
    ["A3-COUNTERPARTY-SCOPED", (s) => s.replace(/counterparty_company_id|counterpartyCompanyId/g, "operating_company_id")],
    ["A4-PAIR-MAP-NOT-NAME-MATCH", (s) => s.replace(/intercompany_entity_pairs/g, "some_other_table")],
    ["A5-NO-DUE-TO-FROM-SPLIT-BRAIN", (s) => `${s}\nconst x = 'due_from';\n`],
    ["A6-NETS-TO-ZERO", (s) => s.replace(/assertIntercompanyLegsNetToZero|netsToZero|net_to_zero/g, "noopCheck")],
    ["A7-POSTER-REUSE-NO-NEW-GL-MATH", (s) => `${s}\nawait c.query("INSERT INTO accounting.journal_entries (x) VALUES (1)");\n`],
  ];

  let ok = true;

  // 1. The corrected shape must NOT be flagged.
  const clean = ASSERTIONS.filter((a) => !a.test(real));
  if (clean.length) {
    console.error(`SELFTEST FAIL: the real (fixed) source is flagged by: ${clean.map((a) => a.id).join(", ")}`);
    ok = false;
  } else {
    console.log("SELFTEST: corrected shape not flagged — OK");
  }

  // 2. Every assertion must be able to FAIL on a real mutation.
  for (const [id, mutate] of mutations) {
    const mutated = mutate(real);
    if (mutated === real) {
      console.error(`SELFTEST FAIL: mutation for ${id} was INERT (source unchanged) — it proves nothing`);
      ok = false;
      continue;
    }
    const a = ASSERTIONS.find((x) => x.id === id);
    if (a.test(mutated)) {
      console.error(`SELFTEST FAIL: ${id} did NOT fail on its planted defect`);
      ok = false;
    } else {
      console.log(`SELFTEST: ${id} correctly fails on planted defect`);
    }
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  selftest();
} else {
  process.exit(run(readSource(SERVICE), SERVICE) ? 0 : 1);
}
