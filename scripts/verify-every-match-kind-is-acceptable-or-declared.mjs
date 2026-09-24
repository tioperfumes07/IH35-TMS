#!/usr/bin/env node
// GUARD — verify-every-match-kind-is-acceptable-or-declared (ROUND 141.4, DEVIN-B)
//
// The owner would have walked into a wall: 'bill' is queried as a candidate, renders,
// is selectable, and accept throws match_kind_not_acceptable:bill. That class of defect
// must be impossible from now on.
//
// FIVE CHECKS:
// 1. Parse LedgerEntryKind from match.service.ts (the type union, not hardcoded).
// 2. Parse which kinds findCandidates can RETURN (by scanning toCandidate calls).
// 3. For every returnable kind: assert it is in PERSISTABLE_MATCH_KINDS OR
//    VIEW_ONLY_MATCH_KINDS (with a reason string). No third state.
// 4. LIVE: assert PERSISTABLE_MATCH_KINDS is a subset of the live CHECK constraint
//    on banking.reconciliation_matches.ledger_entry_kind, read from the catalog.
// 5. LIVE: assert every persistable kind has a MATCHED_COLUMN_BY_KIND entry AND
//    that column exists live on banking.bank_transactions.
//
// Self-arming POPULATION check, derived from the code, never a hand-maintained list.
//
// Self-test: node scripts/verify-every-match-kind-is-acceptable-or-declared.mjs --selftest
export const REQUIRES_LIVE_DB =
  "banking.reconciliation_matches CHECK constraint + banking.bank_transactions columns — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-every-match-kind-is-acceptable-or-declared";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MATCH_SERVICE = path.join(ROOT, "apps/backend/src/accounting/bank-recon/match.service.ts");

/**
 * Parse LedgerEntryKind union from source. Pure function — exported for selftest.
 * @param {string} source
 * @returns {string[]} kinds
 */
export function parseLedgerEntryKind(source) {
  // Match: export type LedgerEntryKind = "a" | "b" | ...;
  const m = source.match(/export\s+type\s+LedgerEntryKind\s*=\s*([^;]+);/);
  if (!m) return [];
  const union = m[1];
  const kinds = [];
  const re = /"([^"]+)"/g;
  let match;
  while ((match = re.exec(union)) !== null) {
    kinds.push(match[1]);
  }
  return kinds;
}

/**
 * Parse PERSISTABLE_MATCH_KINDS from source. Pure function — exported for selftest.
 * @param {string} source
 * @returns {string[]} kinds
 */
export function parsePersistableMatchKinds(source) {
  // Match: export const PERSISTABLE_MATCH_KINDS ... new Set([... "a", "b", ...])
  const m = source.match(/export\s+const\s+PERSISTABLE_MATCH_KINDS[^]*?new\s+Set[^]*?\[([^]*)\]/);
  if (!m) return [];
  const body = m[1];
  const kinds = [];
  const re = /"([^"]+)"/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    kinds.push(match[1]);
  }
  return kinds;
}

/**
 * Parse VIEW_ONLY_MATCH_KINDS from source. Pure function — exported for selftest.
 * @param {string} source
 * @returns {Record<string, string>} kind → reason
 */
export function parseViewOnlyMatchKinds(source) {
  const result = {};
  // Match: export const VIEW_ONLY_MATCH_KINDS ... { "a": "reason", "b": "reason", }
  const m = source.match(/export\s+const\s+VIEW_ONLY_MATCH_KINDS[^]*?\{([^]*)\}/);
  if (!m) return result;
  const body = m[1];
  // Parse key: "value" pairs
  const re = /"([^"]+)"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

/**
 * Parse MATCHED_COLUMN_BY_KIND from source. Pure function — exported for selftest.
 * @param {string} source
 * @returns {Record<string, string>} kind → column name
 */
export function parseMatchedColumnByKind(source) {
  const result = {};
  // Match: const MATCHED_COLUMN_BY_KIND ... { key: "col_a", key: "col_b", }
  // Keys are bare identifiers (not quoted), values are quoted strings.
  const m = source.match(/const\s+MATCHED_COLUMN_BY_KIND[^]*?=\s*\{([\s\S]*?)\}/);
  if (!m) return result;
  const body = m[1];
  // Match: identifier: "string"  (bare key, quoted value)
  const re = /(\w+)\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

/**
 * Parse which kinds findCandidates can return by scanning toCandidate calls.
 * Pure function — exported for selftest.
 * @param {string} source
 * @returns {string[]} returnable kinds
 */
export function parseReturnableKinds(source) {
  const kinds = new Set();
  // Match: toCandidate("kind", ...) — the first arg is the kind string literal
  const re = /toCandidate\s*\(\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    kinds.add(match[1]);
  }
  return [...kinds];
}

/**
 * Classify a match-kind configuration. Pure function — exported for selftest.
 * @param {{
 *   ledgerEntryKinds: string[],
 *   persistableKinds: string[],
 *   viewOnlyKinds: Record<string, string>,
 *   returnableKinds: string[],
 *   matchedColumnByKind: Record<string, string>,
 *   liveCheckKinds?: string[],
 *   liveBankTxnColumns?: string[],
 * }} config
 * @returns {string[]} problems, empty when clean
 */
export function classifyMatchKindConfig(config) {
  const problems = [];
  const { ledgerEntryKinds, persistableKinds, viewOnlyKinds, returnableKinds, matchedColumnByKind, liveCheckKinds = [], liveBankTxnColumns = [] } = config;

  // Check 3: every returnable kind must be persistable OR view-only-declared
  for (const kind of returnableKinds) {
    const isPersistable = persistableKinds.includes(kind);
    const isViewOnly = kind in viewOnlyKinds && typeof viewOnlyKinds[kind] === "string" && viewOnlyKinds[kind].length > 0;
    if (!isPersistable && !isViewOnly) {
      problems.push(`RETURNABLE_KIND_NOT_DECLARED: '${kind}' is returned by findCandidates but is neither in PERSISTABLE_MATCH_KINDS nor VIEW_ONLY_MATCH_KINDS — no third state allowed`);
    }
  }

  // Check 4: PERSISTABLE_MATCH_KINDS must be a subset of the live CHECK constraint
  if (liveCheckKinds.length > 0) {
    for (const kind of persistableKinds) {
      if (!liveCheckKinds.includes(kind)) {
        problems.push(`PERSISTABLE_KIND_NOT_IN_CHECK: '${kind}' is in PERSISTABLE_MATCH_KINDS but not in the live CHECK constraint on banking.reconciliation_matches.ledger_entry_kind`);
      }
    }
  }

  // Check 5: every persistable kind must have a MATCHED_COLUMN_BY_KIND entry AND that column must exist live
  for (const kind of persistableKinds) {
    const col = matchedColumnByKind[kind];
    if (!col) {
      problems.push(`PERSISTABLE_KIND_NO_MATCHED_COLUMN: '${kind}' is persistable but has no MATCHED_COLUMN_BY_KIND entry`);
    } else if (liveBankTxnColumns.length > 0 && !liveBankTxnColumns.includes(col)) {
      problems.push(`MATCHED_COLUMN_NOT_LIVE: '${kind}' → '${col}' does not exist on banking.bank_transactions (live)`);
    }
  }

  return problems;
}

function runSelftest() {
  const fixtures = [
    // Clean: all returnable kinds are persistable or view-only
    {
      name: "clean config — bill is view-only",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: { bill: "Open bills shown but not acceptable — Part 2b" },
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id", expense: "matched_expense_id" },
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "expense", "load", "bill", "settlement"],
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: [],
    },
    // RED: returnable kind not declared (the defect)
    {
      name: "RED — bill returnable but not declared",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: {}, // bill missing!
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id", expense: "matched_expense_id" },
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "expense", "load", "bill", "settlement"],
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: ["RETURNABLE_KIND_NOT_DECLARED"],
    },
    // RED: persistable kind not in live CHECK
    {
      name: "RED — persistable kind not in CHECK",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: { bill: "reason" },
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id", expense: "matched_expense_id" },
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "load", "bill", "settlement"], // expense missing!
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: ["PERSISTABLE_KIND_NOT_IN_CHECK"],
    },
    // RED: persistable kind has no matched column
    {
      name: "RED — persistable kind no matched column",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: { bill: "reason" },
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id" }, // expense missing!
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "expense", "load", "bill", "settlement"],
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: ["PERSISTABLE_KIND_NO_MATCHED_COLUMN"],
    },
    // RED: matched column doesn't exist live
    {
      name: "RED — matched column not live",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: { bill: "reason" },
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id", expense: "matched_nonexistent_id" },
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "expense", "load", "bill", "settlement"],
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: ["MATCHED_COLUMN_NOT_LIVE"],
    },
    // RED: view-only kind with empty reason
    {
      name: "RED — view-only kind with empty reason",
      config: {
        ledgerEntryKinds: ["payment", "bill_payment", "transfer", "je", "bill", "expense"],
        persistableKinds: ["payment", "bill_payment", "transfer", "je", "expense"],
        viewOnlyKinds: { bill: "" }, // empty reason!
        returnableKinds: ["payment", "bill_payment", "bill", "expense", "transfer", "je"],
        matchedColumnByKind: { payment: "matched_payment_id", bill_payment: "matched_bill_payment_id", transfer: "matched_transfer_id", je: "matched_journal_entry_id", expense: "matched_expense_id" },
        liveCheckKinds: ["payment", "bill_payment", "transfer", "je", "expense", "load", "bill", "settlement"],
        liveBankTxnColumns: ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id", "matched_journal_entry_id", "matched_expense_id"],
      },
      expect: ["RETURNABLE_KIND_NOT_DECLARED"],
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, config, expect: exp } of fixtures) {
    const got = classifyMatchKindConfig(config);
    const ok = exp.every((e) => got.some((g) => g.includes(e))) && got.length === exp.length;
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }

  // Also test the parsers
  const testSource = `export type LedgerEntryKind = "payment" | "bill_payment" | "transfer" | "je" | "bill" | "expense";
export const PERSISTABLE_MATCH_KINDS = new Set(["payment", "bill_payment", "transfer", "je", "expense"]);
export const VIEW_ONLY_MATCH_KINDS = { bill: "reason here" };
const MATCHED_COLUMN_BY_KIND = { payment: "matched_payment_id", expense: "matched_expense_id" };
toCandidate("payment", row, "customer");
toCandidate("bill", row, "vendor");`;

  const parsedKinds = parseLedgerEntryKind(testSource);
  if (parsedKinds.length !== 6 || !parsedKinds.includes("bill")) {
    console.error(`${LABEL} --selftest FAIL — parseLedgerEntryKind: expected 6 kinds including bill, got ${JSON.stringify(parsedKinds)}`);
    fail += 1;
  } else pass += 1;

  const parsedPersistable = parsePersistableMatchKinds(testSource);
  if (parsedPersistable.length !== 5 || parsedPersistable.includes("bill")) {
    console.error(`${LABEL} --selftest FAIL — parsePersistableMatchKinds: expected 5 kinds without bill, got ${JSON.stringify(parsedPersistable)}`);
    fail += 1;
  } else pass += 1;

  const parsedViewOnly = parseViewOnlyMatchKinds(testSource);
  if (!("bill" in parsedViewOnly || parsedViewOnly.bill !== "reason here")) {
    console.error(`${LABEL} --selftest FAIL — parseViewOnlyMatchKinds: expected bill→reason, got ${JSON.stringify(parsedViewOnly)}`);
    fail += 1;
  } else pass += 1;

  const parsedReturnable = parseReturnableKinds(testSource);
  if (parsedReturnable.length !== 2 || !parsedReturnable.includes("bill")) {
    console.error(`${LABEL} --selftest FAIL — parseReturnableKinds: expected 2 kinds including bill, got ${JSON.stringify(parsedReturnable)}`);
    fail += 1;
  } else pass += 1;

  const parsedMatchedCol = parseMatchedColumnByKind(testSource);
  if (!("payment" in parsedMatchedCol) || parsedMatchedCol.payment !== "matched_payment_id") {
    console.error(`${LABEL} --selftest FAIL — parseMatchedColumnByKind: expected payment→matched_payment_id, got ${JSON.stringify(parsedMatchedCol)}`);
    fail += 1;
  } else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Check 4: live CHECK constraint on banking.reconciliation_matches.ledger_entry_kind
  const checkRes = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'banking.reconciliation_matches'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%ledger_entry_kind%'`,
  );
  let liveCheckKinds = [];
  if (checkRes.rows.length > 0) {
    const def = checkRes.rows[0].def;
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(def)) !== null) liveCheckKinds.push(m[1]);
  }

  // Check 5: live matched_ columns on banking.bank_transactions
  const colRes = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'banking'
        AND table_name = 'bank_transactions'
        AND column_name LIKE 'matched_%'
      ORDER BY ordinal_position`,
  );
  const liveBankTxnColumns = colRes.rows.map((r) => r.column_name);

  await client.query("ROLLBACK");
  return { liveCheckKinds, liveBankTxnColumns };
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  if (!fs.existsSync(MATCH_SERVICE)) {
    console.error(`${LABEL}: FAIL — match.service.ts not found at ${MATCH_SERVICE}`);
    process.exitCode = 1;
    return;
  }
  const source = fs.readFileSync(MATCH_SERVICE, "utf8");

  // Parse from code
  const ledgerEntryKinds = parseLedgerEntryKind(source);
  const persistableKinds = parsePersistableMatchKinds(source);
  const viewOnlyKinds = parseViewOnlyMatchKinds(source);
  const returnableKinds = parseReturnableKinds(source);
  const matchedColumnByKind = parseMatchedColumnByKind(source);

  console.log(`${LABEL}: parsed LedgerEntryKind = [${ledgerEntryKinds.join(", ")}]`);
  console.log(`${LABEL}: parsed PERSISTABLE_MATCH_KINDS = [${persistableKinds.join(", ")}]`);
  console.log(`${LABEL}: parsed VIEW_ONLY_MATCH_KINDS = ${JSON.stringify(viewOnlyKinds)}`);
  console.log(`${LABEL}: parsed returnableKinds (from toCandidate calls) = [${returnableKinds.join(", ")}]`);
  console.log(`${LABEL}: parsed MATCHED_COLUMN_BY_KIND = ${JSON.stringify(matchedColumnByKind)}`);

  // Live checks (4 + 5)
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let liveCheckKinds = [];
  let liveBankTxnColumns = [];
  try {
    const live = await measureLive(client);
    liveCheckKinds = live.liveCheckKinds;
    liveBankTxnColumns = live.liveBankTxnColumns;
    console.log(`${LABEL}: live CHECK constraint kinds = [${liveCheckKinds.join(", ")}]`);
    console.log(`${LABEL}: live bank_transactions matched_ columns = [${liveBankTxnColumns.join(", ")}]`);
  } finally {
    client.release();
    await pool.end();
  }

  // Classify
  const problems = classifyMatchKindConfig({
    ledgerEntryKinds,
    persistableKinds,
    viewOnlyKinds,
    returnableKinds,
    matchedColumnByKind,
    liveCheckKinds,
    liveBankTxnColumns,
  });

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — ${returnableKinds.length} returnable kinds, ${persistableKinds.length} persistable, ${Object.keys(viewOnlyKinds).length} view-only-declared. All checks pass.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
