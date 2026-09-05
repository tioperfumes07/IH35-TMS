/**
 * BRD-25 REGRESSION GUARD (was: BRD-25 enforcement — inverted 2026-09-05, LEAD RESET / L.4g;
 * narrowed again 2026-09-05 under a real OWNER-REMOVE).
 *
 * BRD-25 (2026-09-04) hid 24 of 33 dispatch board columns by default via a
 * `DEFAULT_VISIBLE_BOARD_KEYS` allowlist + `defaultHidden`, to keep the default view inside a
 * 1280px viewport. The owner ruled this an ADDITIVE-ONLY LAW breach (docs/LAW.md L379: "Never
 * delete or remove … columns, tabs, routes or features. Only add.") with no `OWNER-REMOVE` line
 * in the PR that shipped it, and it was reverted entirely.
 *
 * L.4a (2026-09-05) reintroduced default-hiding for exactly four columns, THIS time with a real
 * quote: `OWNER-REMOVE: "owner-remove Commodity/Linehaul/Pre-settlement/Status from defaults"
 * 2026-09-05`, verify-additive-only.mjs's baseline regenerated in the same PR under that line.
 * Those four stay ONE CLICK away in the Columns ▾ chooser (defaultHidden only changes the
 * INITIAL toggle state, never removes the column from the model or the chooser).
 *
 * This guard's job narrows to match: DispatchBoard.tsx's `boardColumns` array may carry a literal
 * `defaultHidden: true` ONLY on commodity/linehaul/status/pre_settlement — a fifth column (or a
 * viewport-fit allowlist reintroducing BRD-25's original blanket shape) fails hard, not a ratchet.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = resolve(__dirname, "../apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

// The only keys the 2026-09-05 OWNER-REMOVE line covers. Adding a new key here without a matching
// PR-body OWNER-REMOVE quote is exactly the class of bug this guard exists to catch.
const OWNER_AUTHORIZED_DEFAULT_HIDDEN_KEYS = new Set(["commodity", "linehaul", "status", "pre_settlement"]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

/** @returns {string[]} keys carrying a literal `defaultHidden: true` in the boardColumns array. */
export function findDefaultHiddenKeys(source) {
  const arrayMatch = source.match(/const\s+boardColumns[\s\S]*?=\s*\[([\s\S]*?)\n\s*\];/);
  if (!arrayMatch) return null;
  const body = arrayMatch[1];
  // Each entry is one object literal on its own line(s): `{ key: "foo", ..., defaultHidden: true }`.
  const entryRe = /\{\s*key:\s*"([a-z_]+)"[^}]*\}/g;
  const keys = [];
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    if (/\bdefaultHidden\s*:\s*true\b/.test(m[0])) keys.push(m[1]);
  }
  return keys;
}

export function check(source) {
  // Match a real declaration, not a prose comment that merely mentions the retired name.
  if (/\bconst\s+DEFAULT_VISIBLE_BOARD_KEYS\s*=/.test(source)) {
    return "DEFAULT_VISIBLE_BOARD_KEYS reintroduced — BRD-25's blanket hidden-by-default allowlist must stay removed. Hide columns only per-user via Columns ▾, or via the four owner-authorized keys below, never a blanket set.";
  }
  const keys = findDefaultHiddenKeys(source);
  if (keys === null) return "boardColumns array not found";
  const unauthorized = keys.filter((k) => !OWNER_AUTHORIZED_DEFAULT_HIDDEN_KEYS.has(k));
  if (unauthorized.length > 0) {
    return `boardColumns sets defaultHidden:true on ${unauthorized.join(", ")} — not covered by the 2026-09-05 OWNER-REMOVE line (commodity/linehaul/status/pre_settlement only). A new default-hidden column needs its own OWNER-REMOVE quote.`;
  }
  return null;
}

if (process.argv.includes("--selftest")) {
  const regressedBlanket = `
    const DEFAULT_VISIBLE_BOARD_KEYS = new Set(["unit"]);
    const boardColumns = [
      { key: "unit", header: "Unit", cell: () => null },
    ];
  `;
  const regressedUnauthorized = `
    const boardColumns = [
      { key: "unit", header: "Unit", cell: () => null, defaultHidden: true },
    ];
  `;
  const fixed = `
    const boardColumns = [
      { key: "unit", header: "Unit", cell: () => null },
      { key: "commodity", header: "Commodity", cell: () => null, defaultHidden: true },
    ];
  `;
  if (!check(regressedBlanket)) {
    console.error("SELFTEST FAIL — blanket-allowlist fixture did not trip");
    process.exit(1);
  }
  if (!check(regressedUnauthorized)) {
    console.error("SELFTEST FAIL — unauthorized-key fixture did not trip");
    process.exit(1);
  }
  if (check(fixed)) {
    console.error(`SELFTEST FAIL — authorized fixture false-positived: ${check(fixed)}`);
    process.exit(1);
  }
  console.log("SELFTEST PASS");
  process.exit(0);
}

const source = readFileSync(path, "utf-8");
const problem = check(source);
if (problem) fail(problem);
console.log(
  "PASS: only commodity/linehaul/status/pre_settlement are default-hidden on the dispatch board (2026-09-05 OWNER-REMOVE) — every other column stays default-visible, Columns ▾ remains the only other way to hide one."
);
