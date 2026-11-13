#!/usr/bin/env node
/**
 * verify-banking-drift-board-one-row-per-account — ROW 97 (LEAD ROUND 8.24).
 * Root cause it guards (live 2026-11-13 18:10Z, USMCA): the drift detector keeps one open alert per
 * (account, drift_kind) — 7 live_balance + 8 stale_feed — and Banking Home printed each alert as a row, so six
 * accounts appeared twice with different Bank / Book / Diff and the KPI said "15" for 8 accounts.
 *   1. the board builds its drift rows with groupDriftAlertsByAccount (one row per bank_account_id);
 *   2. the grouping never takes Bank / Book / Diff from a stale_feed alert;
 *   3. the KPI counts the grouped rows, not total_count of raw alerts;
 *   4. the table keys rows by bank_account_id (one per account).
 * Usage: node scripts/verify-banking-drift-board-one-row-per-account.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-banking-drift-board-one-row-per-account";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx";
const GROUP = "apps/frontend/src/pages/banking/components/drift-board-rows.ts";

export function check(files) {
  const f = [];
  const board = files[BOARD] ?? "";
  const group = files[GROUP] ?? "";
  if (!group) return ["drift-board-rows.ts missing"];
  if (!/return groupDriftAlertsByAccount\(driftQuery\.data\?\.rows \?\? \[\]\)/.test(board)) f.push("board does not group drift alerts by account");
  if (!/const money = sorted\.find\(\(a\) => a\.drift_kind !== "stale_feed"\) \?\? null;/.test(group)) f.push("grouping may take money from a stale_feed alert");
  if (!/byAccount\.get\(a\.bank_account_id\)/.test(group)) f.push("grouping is not keyed by bank_account_id");
  if (!/const driftCount = driftRows\.length;/.test(board) || /driftQuery\.data\?\.total_count/.test(board)) f.push("KPI counts raw alerts instead of accounts");
  if (!/rowKey=\{\(row\) => row\.bank_account_id\}/.test(board)) f.push("drift table rows are not keyed by bank_account_id");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [BOARD, GROUP]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["board maps raw alerts", mut(BOARD, "return groupDriftAlertsByAccount(driftQuery.data?.rows ?? [])", "return (driftQuery.data?.rows ?? [])")],
    ["money from stale feed", mut(GROUP, 'const money = sorted.find((a) => a.drift_kind !== "stale_feed") ?? null;', "const money = sorted[0] ?? null;")],
    ["not keyed by account", mut(GROUP, "byAccount.get(a.bank_account_id)", "byAccount.get(a.id)")],
    ["KPI counts raw alerts", mut(BOARD, "const driftCount = driftRows.length;", "const driftCount = driftQuery.data?.total_count ?? driftRows.length;")],
    ["row key per alert", mut(BOARD, "rowKey={(row) => row.bank_account_id}", "rowKey={(row) => row.alert_ids[0]}")],
    ["grouping deleted", { ...live, [GROUP]: "" }],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — Banking Home drift board shows one row per bank account; stale feed carries no money; KPI counts accounts`);
}
