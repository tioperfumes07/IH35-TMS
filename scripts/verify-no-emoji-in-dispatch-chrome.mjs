#!/usr/bin/env node
/**
 * verify-no-emoji-in-dispatch-chrome.mjs
 *
 * CI guard for the DISPATCH module fix pass (2026-07-14). Prevents regression of two classes of
 * defect fixed in that pass:
 *
 * 1. Color-emoji / warning-glyph chrome (CLAUDE.md §7: "No emojis in headers/sidebar/tables").
 *    - DispatchKanban.tsx / DispatchList.tsx / RoundTrips.tsx rendered a load's `flag_code` as a
 *      raw color-circle emoji (🟢🔵🟡🟠🔴🟣⚫⚪) via FLAG_EMOJI_BY_CODE — replaced with a plain CSS
 *      dot (`flagDotColor`/`flagDotLabel` in components/dispatch/constants.ts).
 *    - DispatchBoard.tsx / DispatchList.tsx prefixed risk/pre-settlement text with a "⚠" glyph —
 *      the color/label already conveys the signal; glyph removed.
 *    - LiveEtaColumns.tsx / InTransitEtaChip.tsx used "📡" (satellite emoji) as the Samsara-source
 *      glyph in a sibling set that is otherwise plain geometric symbols (✎ ◎ ◌) — replaced with "◉".
 *
 * 2. Off-palette raw hex (CLAUDE.md §7 locked palette: navy #1f2a44 / navy-dk #0f1729 / red #dc2626).
 *    - BookLoadModalV4.tsx, BookLoadEquipmentSection.tsx, BookLoadStopsSection.tsx,
 *      MultiStopExtraRateEditor.tsx, AccessorialEditor.tsx used `#16203a` (an off-palette navy) —
 *      replaced with the locked `#1f2a44`.
 *    - BookLoadStopsSection.tsx used `#A32D2D` for a delete/Remove control — replaced with the
 *      locked `#dc2626`.
 *
 * This guard fails if ANY of those banned tokens reappear anywhere under the dispatch frontend tree
 * (pages/dispatch, components/dispatch). It intentionally does NOT flag plain monochrome symbols
 * already in house-style use elsewhere in this tree (✓ ○ ▶ ✎ ◎ ◌ ◆ ▲) — those are not emoji and are
 * out of scope for this guard.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIRS = [path.join(ROOT, "apps/frontend/src/pages/dispatch"), path.join(ROOT, "apps/frontend/src/components/dispatch")];

const BANNED_STRINGS = [
  "⚠", // ⚠ warning sign
  "📡", // 📡 satellite antenna
  "🟢", // 🟢
  "🔵", // 🔵
  "🟡", // 🟡
  "🟠", // 🟠
  "🔴", // 🔴
  "🟣", // 🟣
  "⚫", // ⚫
  "⚪", // ⚪
];

const BANNED_HEX = [/#16203a/i, /#a32d2d/i];

const errors = [];

function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...collect(abs));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const file of collect(dir)) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const banned of BANNED_STRINGS) {
        if (line.includes(banned)) {
          errors.push(`${rel}:${idx + 1} — banned emoji/glyph char reintroduced: ${JSON.stringify(banned)}`);
        }
      }
      for (const pat of BANNED_HEX) {
        if (pat.test(line)) {
          errors.push(`${rel}:${idx + 1} — off-palette hex reintroduced (must be #1f2a44/#0f1729/#dc2626 per §7): ${line.trim()}`);
        }
      }
    });
  }
}

if (errors.length > 0) {
  console.error("FAIL verify-no-emoji-in-dispatch-chrome:");
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log("verify-no-emoji-in-dispatch-chrome: PASS — no banned emoji/glyph chars or off-palette hex in dispatch chrome.");
