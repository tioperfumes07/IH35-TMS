#!/usr/bin/env node
/**
 * BANK-F10041 (2026-09-07, owner-ordered live investigation) — the Banking register's "Balance"
 * column (runningBalanceById in BankingTransactionsDesignView.tsx) computes each row's balance by
 * walking backward from the account's current_balance_cents. That math is only correct when the
 * row set it walks is the account's COMPLETE, unfiltered transaction history — the component's own
 * comment says so. The live bug the owner found (account e83028a5-dcda-4233-b660-5b9923b3d39c,
 * 12/08/25, $100 received, displayed balance off by -$13,062.53) was NOT the is_credit sign
 * convention (that landmine is already correctly handled here by spentReceived() and in
 * banking.routes.ts under BANK-F10005 — do not re-flag that as broken). The real defect: the running
 * balance was computed over `scopedRows`, which is derived from `transactionsQuery` — a query that
 * IS scoped to whatever date range / transaction-type / description filter the operator currently
 * has active. Any active filter silently drops transactions from the walk, so every visible row's
 * balance is wrong by the sum of everything filtered out, with zero indication to the user.
 *
 * The fix: a dedicated `fullHistoryQuery` with NO date_from/date_to/types/q predicate, and
 * `runningBalanceById` reads from *that* query's data, never from `scopedRows` or `transactionsQuery`.
 * This guard asserts that wiring stays intact — it is not a UI/runtime test, just a static
 * regression trap against someone "simplifying" runningBalanceById back onto the filtered rows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-running-balance-uses-full-history";
const TARGET = path.join(
  ROOT,
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"
);

/** Extracts the source text from `startIdx` (the char right after a `(` or `{`) up to the matching
 * closing bracket, by counting nesting depth over both () and {} pairs. Returns null if unbalanced. */
function extractBalanced(source, openIdx) {
  const openCh = source[openIdx];
  const closeCh = openCh === "(" ? ")" : "}";
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
    if (ch === closeCh && depth === 0) return source.slice(openIdx, i + 1);
  }
  return null;
}

function extractCallBlock(source, declRe) {
  const m = declRe.exec(source);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1; // position of the opening "("
  return extractBalanced(source, openIdx);
}

export function checkRunningBalanceUsesFullHistory(source) {
  const failures = [];

  const fullHistoryBlock = extractCallBlock(source, /const\s+fullHistoryQuery\s*=\s*useQuery\(/);
  if (!fullHistoryBlock) {
    failures.push("fullHistoryQuery useQuery not found — the unfiltered-history fetch was removed.");
  } else {
    for (const forbidden of ["date_from:", "date_to:", "types:", "q:"]) {
      if (fullHistoryBlock.includes(forbidden)) {
        failures.push(
          `fullHistoryQuery's queryFn passes "${forbidden}" — this re-scopes it to a filtered subset, ` +
            "reintroducing the bug it exists to fix."
        );
      }
    }
  }

  // runningBalanceById must depend on fullHistoryQuery.data, never scopedRows/transactionsQuery.data.
  const runningBalanceBlock = extractCallBlock(source, /const\s+runningBalanceById\s*=\s*useMemo\(/);
  if (!runningBalanceBlock) {
    failures.push("runningBalanceById useMemo not found.");
  } else {
    if (!runningBalanceBlock.includes("fullHistoryQuery.data")) {
      failures.push("runningBalanceById no longer reads fullHistoryQuery.data.");
    }
    if (/\bscopedRows\b/.test(runningBalanceBlock)) {
      failures.push(
        "runningBalanceById references scopedRows again — scopedRows is filter-scoped and this is " +
          "the exact regression BANK-F10041 fixed."
      );
    }
  }

  // BANK-RUNNING-BALANCE-STILL-BROKEN-UNFILTERED (2026-09-08) — even with the full-history wiring
  // above intact, tableRows' default date/balance sort and runningBalanceById's walk each sorted
  // their OWN source array using only `transaction_date`, relying on Array.sort's stability to
  // break same-day ties — but the two sorts run over two DIFFERENT arrays (transactionsQuery's
  // scoped rows vs fullHistoryQuery's full history) that are not guaranteed to arrive in the same
  // relative order for a tied group, so the SAME transaction could land in a different relative
  // position for display vs for the balance walk. compareTxNewestFirst is the shared, fully
  // deterministic (transaction_date, then created_at, then id) tiebreak both call sites must use.
  const hasSharedComparator = /export function compareTxNewestFirst\(/.test(source);
  if (!hasSharedComparator) {
    failures.push("compareTxNewestFirst helper not found — the shared newest-first tiebreak was removed.");
  }
  if (runningBalanceBlock && !/\.sort\(\s*compareTxNewestFirst\s*\)/.test(runningBalanceBlock)) {
    failures.push(
      "runningBalanceById no longer sorts with compareTxNewestFirst — it can drift out of sync with " +
        "the table's own date-sort tiebreak again (the exact BANK-RUNNING-BALANCE-STILL-BROKEN-UNFILTERED regression)."
    );
  }
  const tableRowsBlock = extractCallBlock(source, /const\s+tableRows\s*=\s*useMemo\(/);
  if (!tableRowsBlock) {
    failures.push("tableRows useMemo not found.");
  } else if (!/compareTxNewestFirst\(a,\s*b\)/.test(tableRowsBlock)) {
    failures.push(
      "tableRows' date/balance sort branch no longer calls compareTxNewestFirst — it can order same-" +
        "day rows differently than runningBalanceById, breaking the adjacent-balance-subtracts-correctly guarantee."
    );
  }

  return failures;
}

/**
 * LIVE HALF (owner 09-07 rider: "must be traced to its actual running-balance computation — do not
 * just re-sort and call it fixed"). The static half above only proves the CODE reads full,
 * comparator-sorted history; it cannot prove the WALK is arithmetically self-consistent against
 * real prod rows. This replicates runningBalanceById's exact algorithm in SQL for every bank
 * account: starting from current_balance_cents, walk the account's full non-voided history ordered
 * (transaction_date DESC, created_at DESC, id DESC — the same compareTxNewestFirst tiebreak), and
 * assert every adjacent pair's balance difference equals the older row's own signed delta
 * (is_credit or amount_cents<0 -> +abs(amount), else -abs(amount) — spentReceived()'s exact rule).
 * A single silent break anywhere in an account's chain fails this. Never touches data: SELECT only.
 */
async function liveCheck() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`[${LABEL}] LIVE SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live check not possible here.`);
    return 0;
  }
  const liveRequested = process.env.BANK_RUNNING_BALANCE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`[${LABEL}] LIVE SKIP — CI's database is a fixture playground; run with BANK_RUNNING_BALANCE_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`[${LABEL}] LIVE SKIP — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Every non-voided (bank_account_id, tx_id) chain, self-consistency checked in one query so a
    // single mismatched pair anywhere fails the guard by name.
    const res = await client.query(`
      WITH ordered AS (
        SELECT
          bank_account_id, id, transaction_date, created_at,
          CASE WHEN is_credit OR amount_cents < 0 THEN abs(amount_cents) ELSE -abs(amount_cents) END AS delta
        FROM banking.bank_transactions
        WHERE voided_at IS NULL
      ),
      walked AS (
        SELECT
          o.bank_account_id, o.id,
          ba.current_balance_cents
            - COALESCE(SUM(delta) OVER (
                PARTITION BY o.bank_account_id
                ORDER BY o.transaction_date DESC, o.created_at DESC, o.id DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ), 0) AS running_balance_cents,
          LEAD(o.id) OVER (PARTITION BY o.bank_account_id ORDER BY o.transaction_date DESC, o.created_at DESC, o.id DESC) AS next_id_older,
          o.delta
        FROM ordered o
        JOIN banking.bank_accounts ba ON ba.id = o.bank_account_id
      ),
      pairs AS (
        SELECT
          w.bank_account_id, w.id,
          w.running_balance_cents - w2.running_balance_cents AS actual_diff,
          w.delta
        FROM walked w
        JOIN walked w2 ON w2.id = w.next_id_older
      )
      SELECT bank_account_id, id, actual_diff, delta
      FROM pairs
      WHERE actual_diff <> delta
      LIMIT 20
    `);
    await client.query("ROLLBACK");

    if (res.rows.length > 0) {
      console.error(`[${LABEL}] LIVE FAIL — ${res.rows.length} adjacent-pair mismatch(es) found (showing up to 20):`);
      for (const row of res.rows) {
        console.error(`  account=${row.bank_account_id} tx=${row.id} actual_diff=${row.actual_diff} expected_delta=${row.delta}`);
      }
      return 1;
    }
    console.log(`[${LABEL}] LIVE PASS — every bank account's full non-voided transaction history walks self-consistently (every adjacent pair's balance diff equals that row's own signed delta).`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = `
      export function compareTxNewestFirst(a, b) {
        return 0;
      }
      const fullHistoryQuery = useQuery({
        queryKey: ["x"],
        queryFn: async () => {
          const page = await getPlaidCompanyTransactions(companyId, {
            limit: 500,
            offset: 0,
            bank_account_id: selectedAccount?.id ?? undefined,
            sort: "date_desc",
          });
          return { transactions: page.transactions ?? [] };
        },
      });
      const tableRows = useMemo(() => {
        if (sortBy.key === "date" || sortBy.key === "balance") {
          return [...filtered].sort((a, b) => compareTxNewestFirst(a, b) * -sortDir);
        }
        return [...filtered];
      }, [sortBy]);
      const runningBalanceById = useMemo(() => {
        const historyRows = fullHistoryQuery.data?.transactions ?? [];
        const ordered = [...historyRows].sort(compareTxNewestFirst);
        return new Map();
      }, [fullHistoryQuery.data, selectedAccount]);
    `;
    const badFixtures = {
      "scopedRows regression": `
        const runningBalanceById = useMemo(() => {
          const ordered = [...scopedRows];
          return new Map();
        }, [scopedRows, selectedAccount]);
      `,
      "no shared comparator": good.replace(
        "export function compareTxNewestFirst(a, b) {\n        return 0;\n      }",
        ""
      ),
      "runningBalanceById skips compareTxNewestFirst": good.replace(
        "const ordered = [...historyRows].sort(compareTxNewestFirst);",
        `const ordered = [...historyRows].sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));`
      ),
      "tableRows skips compareTxNewestFirst": good.replace(
        `return [...filtered].sort((a, b) => compareTxNewestFirst(a, b) * -sortDir);`,
        `return [...filtered].sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));`
      ),
    };

    const goodFailures = checkRunningBalanceUsesFullHistory(good);
    if (goodFailures.length !== 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: expected good fixture to pass, got`, goodFailures);
      process.exit(1);
    }
    let caught = 0;
    for (const [name, src] of Object.entries(badFixtures)) {
      const failures = checkRunningBalanceUsesFullHistory(src);
      if (failures.length === 0) {
        console.error(`[${LABEL}] SELFTEST FAILED: mutation "${name}" escaped detection`);
        process.exit(1);
      }
      caught += 1;
    }
    console.log(`[${LABEL}] selftest OK (good=0 failures, ${caught}/${Object.keys(badFixtures).length} planted defects caught)`);
    process.exit(0);
  }

  if (!fs.existsSync(TARGET)) {
    console.error(`[${LABEL}] FAIL: target file not found: ${TARGET}`);
    process.exit(1);
  }
  const source = fs.readFileSync(TARGET, "utf8");
  const failures = checkRunningBalanceUsesFullHistory(source);
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] STATIC PASS`);
  return liveCheck();
}

main().then((code) => process.exit(code ?? 0));
