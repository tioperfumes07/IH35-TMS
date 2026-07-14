#!/usr/bin/env node
/**
 * verify-qbo-parity-banking-home.mjs
 *
 * The QBO-style banking home layout (May-1 spec) — a horizontal, scrollable row of account tiles
 * (AccountTilesRow → AccountTile: name, type/tag, balance, per-account uncategorized badge, active-tile
 * border) plus a QBO SyncStatusStrip (last-sync time + txn/uncategorized/pending counts) — was fully
 * built but NEVER imported/rendered. AccountTile / AccountTilesRow / SyncStatusStrip had ZERO importers;
 * BankingHome rendered only a vertical list + Plaid-only status panel. They are now wired into
 * BankingHome. This guard is a RATCHET so they can never silently orphan again:
 *   (1) BankingHome IMPORTS AccountTilesRow + SyncStatusStrip.
 *   (2) BankingHome RENDERS <AccountTilesRow ...> and <SyncStatusStrip ...>.
 *   (3) AccountTilesRow renders AccountTile (the tile presentation stays intact).
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-parity-banking-home";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROW = "apps/frontend/src/pages/banking/components/AccountTilesRow.tsx";

export function assertGuard({ home, row }) {
  const errors = [];

  // (1) imports
  if (!/import\s*\{[^}]*\bAccountTilesRow\b[^}]*\}\s*from\s*["'][^"']*AccountTilesRow["']/.test(home)) {
    errors.push(`${HOME}: does not import AccountTilesRow`);
  }
  if (!/import\s*\{[^}]*\bSyncStatusStrip\b[^}]*\}\s*from\s*["'][^"']*SyncStatusStrip["']/.test(home)) {
    errors.push(`${HOME}: does not import SyncStatusStrip`);
  }

  // (2) renders (JSX element usage)
  if (!/<AccountTilesRow\b/.test(home)) errors.push(`${HOME}: does not render <AccountTilesRow>`);
  if (!/<SyncStatusStrip\b/.test(home)) errors.push(`${HOME}: does not render <SyncStatusStrip>`);

  // (3) AccountTilesRow still renders AccountTile (tile presentation intact)
  if (!/<AccountTile\b/.test(row)) errors.push(`${ROW}: does not render <AccountTile>`);
  if (!/import\s*\{[^}]*\bAccountTile\b[^}]*\}\s*from\s*["'][^"']*AccountTile["']/.test(row)) {
    errors.push(`${ROW}: does not import AccountTile`);
  }

  return errors;
}

function selftest() {
  const goodHome = `
import { AccountTilesRow } from "./components/AccountTilesRow";
import { SyncStatusStrip } from "./components/SyncStatusStrip";
export function BankingHomePage() {
  return (<><SyncStatusStrip syncedAt={null} /><AccountTilesRow tiles={t} /></>);
}`;
  const goodRow = `
import { AccountTile } from "./AccountTile";
export function AccountTilesRow({ tiles }) {
  return (<div>{tiles.map((t) => <AccountTile key={t.id} tile={t} />)}</div>);
}`;
  const cases = [
    { n: "fully wired → 0", home: goodHome, row: goodRow, want: 0 },
    { n: "row not imported", home: goodHome.replace(/import \{ AccountTilesRow \}[^\n]*\n/, ""), row: goodRow, min: 1 },
    { n: "strip not imported", home: goodHome.replace(/import \{ SyncStatusStrip \}[^\n]*\n/, ""), row: goodRow, min: 1 },
    { n: "row not rendered", home: goodHome.replace(/<AccountTilesRow tiles=\{t\} \/>/, ""), row: goodRow, min: 1 },
    { n: "strip not rendered", home: goodHome.replace(/<SyncStatusStrip syncedAt=\{null\} \/>/, ""), row: goodRow, min: 1 },
    { n: "tile orphaned in row", home: goodHome, row: goodRow.replace(/<AccountTile key=\{t.id\} tile=\{t\} \/>/, "null"), min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ home: c.home, row: c.row }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

for (const f of [HOME, ROW]) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`[${LABEL}] FAILED — missing ${f}`); process.exit(1); }
}
const errors = assertGuard({
  home: fs.readFileSync(path.join(ROOT, HOME), "utf8"),
  row: fs.readFileSync(path.join(ROOT, ROW), "utf8"),
});
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — BankingHome imports + renders AccountTilesRow/AccountTile + SyncStatusStrip (QBO-parity tiles home is live, not orphaned).`);
