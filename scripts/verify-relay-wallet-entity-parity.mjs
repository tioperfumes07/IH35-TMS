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
 * THE WALLET LIVES IN TWO PLACES AND THE CODE READS THE SECOND ONE
 * A CoA row alone is inert. `resolveRelayWalletBankAccountId()` looks up
 * banking.bank_accounts scoped by operating_company_id, and every Relay row — fuel draws AND wallet
 * deposits — returns `skipped_no_wallet` when that lookup misses. So an entity needs BOTH the
 * catalogs.accounts #1295 row and its own banking.bank_accounts registration, or its Relay activity
 * is invisible on /banking and unlinked from unit/driver/load.
 *
 * WHAT IS ASSERTED (static, on the migration set + the resolver — CI has no prod credentials)
 *   1. every entity-scoped existence check for the wallet is scoped by operating_company_id, so no
 *      entity can be starved by another entity already holding the account number;
 *   2. the five RELAY-* items are seeded with an entity-scoped NOT EXISTS as well;
 *   3. both fee items survive — they are the "Relay is also a vendor" leg and are easy to drop when
 *      someone thinks of Relay as only a fuel wallet;
 *   4. the USMCA bank-account registration exists, is entity-scoped, and links to the entity's OWN
 *      #1295 ledger row (linking to TRANSP's would cross-book two companies onto one asset);
 *   5. the resolver itself stays entity-scoped — if it ever drops `operating_company_id`, one
 *      entity's wallet silently absorbs another's fuel.
 *
 * METHOD: comments and strings are stripped only where structure is asserted; SQL literals are matched
 * on a string-preserving form. --selftest mutates the REAL migration and requires every assertion to
 * trip.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-relay-wallet-entity-parity";
const DIR = "db/migrations";
const RESOLVER = "apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts";
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

/** Every migration that registers the wallet as a banking.bank_accounts row. */
function relayBankRegistrationFiles() {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql") && /relay_wallet_banking_registration/.test(e.name))
    .map((e) => join(DIR, e.name))
    .sort();
}

function stripComments(sql) {
  return sql.replace(/^\s*--.*$/gm, "");
}

function check(sources) {
  const errors = [];
  const files = Object.keys(sources);

  if (files.filter((f) => /relay_internal_bank_seed/.test(f)).length === 0) {
    errors.push("no relay_internal_bank_seed migration found — the Relay wallet master data is gone");
    return errors;
  }

  // The USMCA seed is the one that must be entity-scoped; the original TRANSP seed is historical and
  // must never be edited (applied-migration checksum freeze), so it is inspected but not required to
  // change.
  // Match the SEED migrations only — the bank-registration migration also ends in _usmca.sql, and
  // running the seed assertions against it would fail for the wrong reason.
  const usmca = files.filter((f) => /relay_internal_bank_seed/.test(f) && /usmca/i.test(f));
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

  // 4. The bank-account registration — without it the CoA row is inert.
  const reg = files.filter((f) => /relay_wallet_banking_registration/.test(f));
  const usmcaReg = reg.filter((f) => /usmca/i.test(f));
  if (usmcaReg.length === 0) {
    errors.push(
      "no USMCA relay_wallet_banking_registration migration — resolveRelayWalletBankAccountId() is " +
        "scoped by operating_company_id, so with no banking.bank_accounts row for USMCA every USMCA " +
        "Relay draw and deposit returns skipped_no_wallet: invisible on /banking and unlinked"
    );
  }
  for (const f of usmcaReg) {
    const sql = stripComments(sources[f]);
    if (!/INSERT INTO banking\.bank_accounts/i.test(sql)) {
      errors.push(`${f}: does not insert a banking.bank_accounts row`);
    }
    // Must resolve the ledger row for THIS entity — pointing at another entity's #1295 would put two
    // companies' fuel on one asset account.
    if (!/operating_company_id\s*=\s*v_usmca\s+AND\s+system_purpose\s*=\s*'relay_fuel_wallet'/i.test(sql)) {
      errors.push(
        `${f}: the ledger_account_id lookup is not scoped to USMCA's own relay_fuel_wallet row — ` +
          `linking to another entity's #1295 would cross-book two companies onto one asset`
      );
    }
    if (!/b\.operating_company_id\s*=\s*v_usmca/i.test(sql)) {
      errors.push(`${f}: the duplicate-registration check is not entity-scoped`);
    }
    // The scope must be set BEFORE the FORCED-RLS ledger lookup. Setting it only just before the
    // INSERT leaves the lookup running under whatever app.operating_company_id the connection
    // carried; a wrong-entity GUC returns NULL, the block RETURNs, and the migration reports success
    // having inserted nothing. The first prod apply of this migration did exactly that.
    const scopeAt = sql.search(/set_config\(\s*'app\.operating_company_id'/);
    const lookupAt = sql.search(/FROM catalogs\.accounts/i);
    if (scopeAt === -1) {
      errors.push(`${f}: never sets app.operating_company_id — the RLS-scoped reads and the INSERT will not see USMCA`);
    } else if (lookupAt !== -1 && scopeAt > lookupAt) {
      errors.push(
        `${f}: sets app.operating_company_id AFTER the catalogs.accounts lookup. catalogs.accounts is ` +
          `FORCED-RLS, so the lookup can return NULL under a wrong-entity GUC and the migration then ` +
          `silently inserts nothing while reporting success. Scope first, then look up.`
      );
    }
  }

  // 5. The resolver must stay entity-scoped, or per-entity registration buys nothing.
  const resolver = sources[RESOLVER];
  if (resolver === undefined) {
    errors.push(`${RESOLVER}: missing — the Relay wallet bank-feed resolver is gone`);
  } else {
    const fn = resolver.slice(resolver.indexOf("export async function resolveRelayWalletBankAccountId"));
    const body = fn.slice(0, fn.indexOf("\n}") + 2);
    if (!/ba\.operating_company_id\s*=\s*\$1/.test(body)) {
      errors.push(
        `${RESOLVER}: resolveRelayWalletBankAccountId no longer filters on ba.operating_company_id — ` +
          `one entity's wallet would absorb another entity's fuel draws and deposits`
      );
    }
  }
  return errors;
}

function loadAll() {
  const out = {};
  for (const f of [...relaySeedFiles(), ...relayBankRegistrationFiles()]) out[f] = readFileSync(f, "utf8");
  out[RESOLVER] = readFileSync(RESOLVER, "utf8");
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
  const target = Object.keys(real).find((f) => /relay_internal_bank_seed/.test(f) && /usmca/i.test(f));
  const regTarget = Object.keys(real).find((f) => /relay_wallet_banking_registration/.test(f) && /usmca/i.test(f));

  const mutations = [
    [
      "USMCA bank registration deleted",
      (s) => {
        const { [regTarget]: _dropped, ...rest } = s;
        return rest;
      },
    ],
    [
      "registration links another entity's ledger row",
      (s) => ({
        ...s,
        [regTarget]: s[regTarget].replace(
          "WHERE operating_company_id = v_usmca\n     AND system_purpose = 'relay_fuel_wallet'",
          "WHERE system_purpose = 'relay_fuel_wallet'"
        ),
      }),
    ],
    [
      "duplicate-registration check unscoped",
      (s) => ({
        ...s,
        [regTarget]: s[regTarget].replace("WHERE b.operating_company_id = v_usmca", "WHERE true"),
      }),
    ],
    [
      "scope set after the RLS-forced ledger lookup (the silent no-op)",
      (s) => ({
        ...s,
        [regTarget]: s[regTarget]
          .replace(/  PERFORM set_config\('app\.operating_company_id', v_usmca::text, true\);\n\n/, "")
          .replace(
            "  INSERT INTO banking.bank_accounts (",
            "  PERFORM set_config('app.operating_company_id', v_usmca::text, true);\n\n  INSERT INTO banking.bank_accounts ("
          ),
      }),
    ],
    [
      "scope never set at all",
      (s) => ({
        ...s,
        [regTarget]: s[regTarget].replace(
          /  PERFORM set_config\('app\.operating_company_id', v_usmca::text, true\);\n/,
          ""
        ),
      }),
    ],
    [
      "resolver drops entity scoping",
      (s) => ({
        ...s,
        [RESOLVER]: s[RESOLVER].replace(
          "WHERE ba.operating_company_id = $1::uuid",
          "WHERE true"
        ),
      }),
    ],
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
    // Compare the WHOLE source map, not just the seed file — several mutations target the
    // registration migration or the resolver, and a per-file comparison would call those "unchanged"
    // and let a stale mutation pass unnoticed.
    if (JSON.stringify(broken) === JSON.stringify(real)) {
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
  `${LABEL} PASS — every Relay-using entity gets its own wallet account, all five RELAY-* items, and ` +
    `its own bank-account registration; every lookup entity-scoped, master-data only.`
);
