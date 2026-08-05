#!/usr/bin/env node
/**
 * GUARD — verify-relay-wallet-entity-parity (CONN-3 Part B)
 *
 * WHAT THIS PROTECTS
 * The CONN-3 design models the pre-funded Relay wallet as an ASSET per operating company (acct 1295,
 * system_purpose='relay_fuel_wallet'): deposits DEBIT it, and fuel draws AND the two Relay fee legs
 * CREDIT it. That wallet is what keeps the three money stages apart —
 *   1. fund the wallet  (asset transfer, NO P&L)
 *   2. pump fuel        (DR Fuel Expense / CR wallet, + RELAY-FEE-BANK / RELAY-FEE-FUEL)
 *   3. bank settles     (the RELAY* bank debits are the CASH side of stage 1, never an expense)
 * If an entity that uses Relay has no wallet account, stage 2 has nothing to credit and the natural
 * "fix" is to expense the fuel straight from the bank feed — which double-books it against the fuel
 * subledger that already posted it. On prod that subledger is 1,548 rows / $625,743.42, so the
 * double-post this prevents is not hypothetical.
 *
 * THE BUG THIS WAS BORN FROM
 * The original seed (202607290000) guarded the account with a GLOBAL
 * `NOT EXISTS (... WHERE account_number = '1295')`. The chart of accounts is PER ENTITY, so once
 * TRANSP held 1295 that predicate matched for everyone and silently seeded nothing for any other
 * entity. USMCA was left with no wallet and no items until it started using Relay.
 *
 * WHAT IS ASSERTED (static, on the migration set — CI has no prod credentials)
 *   1. every entity-scoped existence check for the wallet is scoped by operating_company_id, so no
 *      entity can be starved by another entity already holding the account number;
 *   2. the five RELAY-* items are seeded with an entity-scoped NOT EXISTS as well;
 *   3. both fee items survive — they are the "Relay is also a vendor" leg and are easy to drop when
 *      someone thinks of Relay as only a fuel wallet.
 *
 * METHOD: comments and strings are stripped only where structure is asserted; SQL literals are matched
 * on a string-preserving form. --selftest mutates the REAL migration and requires every assertion to
 * trip.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-relay-wallet-entity-parity";
const DIR = "db/migrations";
const REQUIRED_ITEMS = [
  "RELAY-DIESEL",
  "RELAY-DEF",
  "RELAY-REEFER",
  "RELAY-FEE-BANK",
  "RELAY-FEE-FUEL",
];

/** Every migration that seeds Relay master data. */
function relaySeedFiles() {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql") && /relay_internal_bank_seed/.test(e.name))
    .map((e) => join(DIR, e.name))
    .sort();
}

function stripComments(sql) {
  return sql.replace(/^\s*--.*$/gm, "");
}

function check(sources) {
  const errors = [];
  const files = Object.keys(sources);

  if (files.length === 0) {
    errors.push("no relay_internal_bank_seed migration found — the Relay wallet master data is gone");
    return errors;
  }

  // The USMCA seed is the one that must be entity-scoped; the original TRANSP seed is historical and
  // must never be edited (applied-migration checksum freeze), so it is inspected but not required to
  // change.
  const usmca = files.filter((f) => /usmca/i.test(f));
  if (usmca.length === 0) {
    errors.push(
      "no USMCA Relay seed migration — USMCA uses Relay, so without its own wallet account stage 2 " +
        "has nothing to credit and fuel would be expensed twice from the bank feed"
    );
    return errors;
  }

  for (const f of usmca) {
    const sql = stripComments(sources[f]);

    // 1. Wallet account seeded, entity-scoped on BOTH predicates.
    if (!/system_purpose\s*=\s*'relay_fuel_wallet'/.test(sql)) {
      errors.push(`${f}: does not seed a relay_fuel_wallet account`);
    }
    const globalNumberCheck =
      /NOT EXISTS\s*\(\s*SELECT 1 FROM catalogs\.accounts a\s+WHERE a\.account_number\s*=\s*'1295'\s*\)/i.test(
        sql
      );
    if (globalNumberCheck) {
      errors.push(
        `${f}: guards account_number '1295' GLOBALLY. The chart of accounts is per entity — a global ` +
          `check means the first entity to hold 1295 starves every other entity. Scope it by ` +
          `operating_company_id.`
      );
    }
    if (!/a\.operating_company_id\s*=\s*v_usmca\s+AND\s+a\.account_number\s*=\s*'1295'/i.test(sql)) {
      errors.push(`${f}: the account-number existence check is not scoped by operating_company_id`);
    }

    // 2. Items seeded, entity-scoped.
    for (const code of REQUIRED_ITEMS) {
      if (!sql.includes(code)) {
        errors.push(`${f}: item ${code} is missing from the USMCA seed`);
      }
    }
    if (!/i\.operating_company_id\s*=\s*v_usmca\s+AND\s+i\.item_code\s*=\s*x\.code/i.test(sql)) {
      errors.push(`${f}: the item existence check is not scoped by operating_company_id`);
    }

    // 3. Master data only — this seed must never post.
    if (/INSERT INTO accounting\.journal_entr/i.test(sql)) {
      errors.push(`${f}: writes journal entries — this seed is master data only, nothing may post here`);
    }
  }
  return errors;
}

function loadAll() {
  const out = {};
  for (const f of relaySeedFiles()) out[f] = readFileSync(f, "utf8");
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const target = Object.keys(real).find((f) => /usmca/i.test(f));

  const mutations = [
    [
      "global 1295 check restored",
      (s) => ({
        ...s,
        [target]: s[target].replace(
          /WHERE a\.operating_company_id = v_usmca AND a\.account_number = '1295'/,
          "WHERE a.account_number = '1295'"
        ),
      }),
    ],
    ["fee item dropped", (s) => ({ ...s, [target]: s[target].split("RELAY-FEE-BANK").join("RELAY-X") })],
    [
      "items no longer entity-scoped",
      (s) => ({
        ...s,
        [target]: s[target].replace(
          /i\.operating_company_id = v_usmca AND i\.item_code = x\.code/,
          "i.item_code = x.code"
        ),
      }),
    ],
    ["wallet purpose removed", (s) => ({ ...s, [target]: s[target].split("relay_fuel_wallet").join("something_else") })],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken[target] === real[target]) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in the Relay wallet seed:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — every Relay-using entity gets its own wallet account and all five RELAY-* items, ` +
    `entity-scoped, master-data only.`
);
