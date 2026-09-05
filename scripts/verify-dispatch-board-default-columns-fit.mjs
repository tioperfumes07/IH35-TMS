/**
 * BRD-25 REGRESSION GUARD (was: BRD-25 enforcement — inverted 2026-09-05, LEAD RESET / L.4g).
 *
 * BRD-25 (2026-09-04) hid 24 of 33 dispatch board columns by default via a
 * `DEFAULT_VISIBLE_BOARD_KEYS` allowlist + `defaultHidden`, to keep the default view inside a
 * 1280px viewport. The owner ruled this an ADDITIVE-ONLY LAW breach (docs/LAW.md L379: "Never
 * delete or remove … columns, tabs, routes or features. Only add.") with no `OWNER-REMOVE` line
 * in the PR that shipped it — see docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md §A:
 * "every column in the board model … is default-visible in Table AND List … Remove
 * `DEFAULT_VISIBLE_BOARD_KEYS` / `defaultHidden` … entirely."
 *
 * This guard now asserts the FIX holds: DispatchBoard.tsx's `parityColumns` mapping must never
 * reintroduce a `defaultHidden` key (from any allowlist, viewport-fit set, or otherwise) — the
 * Columns ▾ chooser remains the only way a column is ever hidden, and that is a per-user choice,
 * never a forced default. Fails hard, not a ratchet: this is the exact shape of bug the additive-
 * only guard (`verify-additive-only.mjs`) exists to catch system-wide; this file is the
 * board-specific regression pin for the same defect class.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = resolve(__dirname, "../apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(source) {
  // Match a real declaration, not a prose comment that merely mentions the retired name (e.g.
  // this file's own historical note explaining what was removed and why).
  if (/\bconst\s+DEFAULT_VISIBLE_BOARD_KEYS\s*=/.test(source)) {
    fail("DEFAULT_VISIBLE_BOARD_KEYS reintroduced — BRD-25's hidden-by-default allowlist must stay removed (docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md §A). Hide columns only per-user via Columns ▾, never by default.");
  }
  const parityMapMatch = source.match(
    /const\s+parityColumns[\s\S]*?boardColumns\.map\(\(column\)\s*=>\s*\(\{[\s\S]*?\}\)\)/,
  );
  if (!parityMapMatch) fail("parityColumns mapping not found");
  if (/defaultHidden\s*:/.test(parityMapMatch[0])) {
    fail("parityColumns sets defaultHidden — no dispatch board column may be hidden by default (§A).");
  }
}

if (process.argv.includes("--selftest")) {
  // check() calls process.exit(1) directly rather than throwing, so the selftest re-implements
  // the same assertion inline instead of calling check() on fixtures.
  const regressed = `
    const DEFAULT_VISIBLE_BOARD_KEYS = new Set(["unit"]);
    const parityColumns = boardColumns.map((column) => ({ key: column.key, defaultHidden: !DEFAULT_VISIBLE_BOARD_KEYS.has(column.key) }));
  `;
  const fixed = `
    const parityColumns = boardColumns.map((column) => ({ key: column.key, label: column.header }));
  `;
  const wouldFail = (src) => /\bconst\s+DEFAULT_VISIBLE_BOARD_KEYS\s*=/.test(src) || /defaultHidden\s*:/.test(
    (src.match(/const\s+parityColumns[\s\S]*?boardColumns\.map\(\(column\)\s*=>\s*\(\{[\s\S]*?\}\)\)/) ?? [""])[0]
  );
  if (!wouldFail(regressed)) {
    console.error("SELFTEST FAIL — regression fixture did not trip");
    process.exit(1);
  }
  if (wouldFail(fixed)) {
    console.error("SELFTEST FAIL — fixed fixture tripped a false positive");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
  process.exit(0);
}

const source = readFileSync(path, "utf-8");
check(source);
console.log("PASS: no dispatch board column is hidden by default (BRD-25 regression guard) — Columns ▾ remains per-user only.");
