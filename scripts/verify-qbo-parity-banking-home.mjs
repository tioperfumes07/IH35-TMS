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
const STRIP = "apps/frontend/src/pages/banking/components/SyncStatusStrip.tsx";
const QBO_SYNC_STATUS_LIB = "apps/frontend/src/lib/qbo-sync-status.ts";

export function assertGuard({ home, row, strip, qboSyncStatusLib }) {
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

  // (2a) SyncStatusStrip must receive live connection state, not a hardcoded literal.
  if (!/<SyncStatusStrip[^>]*\bisConnected\s*=/.test(home)) {
    errors.push(`${HOME}: SyncStatusStrip must receive isConnected prop`);
  }

  // (3) AccountTilesRow still renders AccountTile (tile presentation intact)
  if (!/<AccountTile\b/.test(row)) errors.push(`${ROW}: does not render <AccountTile>`);
  if (!/import\s*\{[^}]*\bAccountTile\b[^}]*\}\s*from\s*["'][^"']*AccountTile["']/.test(row)) {
    errors.push(`${ROW}: does not import AccountTile`);
  }

  // (4) SyncStatusStrip must own the connection decision as a prop; no unconditional "Connected" literal.
  //
  // ROUND-20.8 B11 (2026-09-13) — the strip stopped rendering a local `isConnected ? "Connected" :
  // "Not connected"` ternary and now calls the SHARED describeQboSyncStatus({ connected: isConnected,
  // ... }) helper instead, specifically so /banking and /accounting can never show contradictory QBO
  // wording for the same underlying state again (that WAS the bug this guard originally caught: a
  // per-screen hardcoded ternary drifting from another screen's own hardcoded ternary). Accept EITHER
  // shape: the original inline ternary, OR a real call into describeQboSyncStatus with `connected`
  // bound to the isConnected prop — checked against qbo-sync-status.ts too, to prove the disconnected
  // branch still literally says "Not connected" and is not a dead delegation.
  if (strip) {
    if (!/\bisConnected\s*:\s*\bboolean\b/.test(strip)) {
      errors.push(`${STRIP}: Props must declare isConnected: boolean`);
    }
    const hasInlineTernary = /\bisConnected\s*\?\s*["']Connected["']\s*:\s*["']Not connected["']/.test(strip);
    const delegatesToSharedHelper =
      /describeQboSyncStatus\(\s*\{[^}]*connected\s*:\s*isConnected/.test(strip) &&
      Boolean(qboSyncStatusLib) &&
      /label\s*:\s*["']Not connected["']/.test(qboSyncStatusLib);
    if (!hasInlineTernary && !delegatesToSharedHelper) {
      errors.push(
        `${STRIP}: must derive its connected-state wording from the isConnected prop — either the ` +
          `inline "Connected"/"Not connected" ternary, or a real call to describeQboSyncStatus({ ` +
          "connected: isConnected, ... }) whose disconnected branch still says \"Not connected\" " +
          "(checked against lib/qbo-sync-status.ts)"
      );
    }
    if (/<[^>]*>Connected<\/[^>]*>/.test(strip)) {
      errors.push(`${STRIP}: contains an unconditional hardcoded "Connected" element`);
    }
  }

  return errors;
}

function selftest() {
  const goodHome = `
import { AccountTilesRow } from "./components/AccountTilesRow";
import { SyncStatusStrip } from "./components/SyncStatusStrip";
export function BankingHomePage() {
  const connected = false;
  return (<><SyncStatusStrip syncedAt={null} isConnected={connected} /><AccountTilesRow tiles={t} /></>);
}`;
  const goodRow = `
import { AccountTile } from "./AccountTile";
export function AccountTilesRow({ tiles }) {
  return (<div>{tiles.map((t) => <AccountTile key={t.id} tile={t} />)}</div>);
}`;
  const goodStrip = `
import { SyncStatusStrip } from "./SyncStatusStrip";
export function SyncStatusStrip({ isConnected }: { isConnected: boolean }) {
  return <span>{isConnected ? "Connected" : "Not connected"}</span>;
}`;
  const badStripLiteral = `
export function SyncStatusStrip({ isConnected }: { isConnected: boolean }) {
  return <span className="x">Connected</span>;
}`;
  // ROUND-20.8 B11 — the CURRENT real shape: SyncStatusStrip delegates to the shared
  // describeQboSyncStatus() helper instead of its own inline ternary.
  const sharedHelperStrip = `
export function SyncStatusStrip({ isConnected }: { isConnected: boolean }) {
  const summary = describeQboSyncStatus({ connected: isConnected, pending: 0, failed: 0 });
  return <span>{summary.label}</span>;
}`;
  const sharedHelperLib = `export function describeQboSyncStatus({ connected }) {
  if (!connected) return { label: "Not connected", tone: "bad", sub: "no active QuickBooks connection" };
  return { label: "Healthy", tone: "good", sub: "queue empty" };
}`;
  const cases = [
    { n: "fully wired → 0", home: goodHome, row: goodRow, strip: goodStrip, qboSyncStatusLib: null, want: 0 },
    { n: "row not imported", home: goodHome.replace(/import \{ AccountTilesRow \}[^\n]*\n/, ""), row: goodRow, strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "strip not imported", home: goodHome.replace(/import \{ SyncStatusStrip \}[^\n]*\n/, ""), row: goodRow, strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "row not rendered", home: goodHome.replace(/<AccountTilesRow tiles=\{t\} \/>/, ""), row: goodRow, strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "strip not rendered", home: goodHome.replace(/<SyncStatusStrip[^/]*\/>/, ""), row: goodRow, strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "tile orphaned in row", home: goodHome, row: goodRow.replace(/<AccountTile key=\{t.id\} tile=\{t\} \/>/, "null"), strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "strip missing isConnected prop", home: goodHome.replace(/isConnected=\{connected\}/, ""), row: goodRow, strip: goodStrip, qboSyncStatusLib: null, min: 1 },
    { n: "strip hardcodes Connected literal", home: goodHome, row: goodRow, strip: badStripLiteral, qboSyncStatusLib: null, min: 1 },
    { n: "strip delegates to shared helper → 0", home: goodHome, row: goodRow, strip: sharedHelperStrip, qboSyncStatusLib: sharedHelperLib, want: 0 },
    {
      n: "strip delegates but shared helper doesn't say Not connected",
      home: goodHome,
      row: goodRow,
      strip: sharedHelperStrip,
      qboSyncStatusLib: sharedHelperLib.replace('"Not connected"', '"Disconnected"'),
      min: 1,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ home: c.home, row: c.row, strip: c.strip, qboSyncStatusLib: c.qboSyncStatusLib }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

for (const f of [HOME, ROW, STRIP]) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`[${LABEL}] FAILED — missing ${f}`); process.exit(1); }
}
const errors = assertGuard({
  home: fs.readFileSync(path.join(ROOT, HOME), "utf8"),
  row: fs.readFileSync(path.join(ROOT, ROW), "utf8"),
  strip: fs.readFileSync(path.join(ROOT, STRIP), "utf8"),
  qboSyncStatusLib: fs.existsSync(path.join(ROOT, QBO_SYNC_STATUS_LIB))
    ? fs.readFileSync(path.join(ROOT, QBO_SYNC_STATUS_LIB), "utf8")
    : null,
});
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — BankingHome imports + renders AccountTilesRow/AccountTile + SyncStatusStrip (QBO-parity tiles home is live, not orphaned).`);
