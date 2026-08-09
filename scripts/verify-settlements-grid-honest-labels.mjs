#!/usr/bin/env node
/**
 * FAIL-SET1 + FAIL-SET2 ratchet — the Settlements grid must show a human period and a human driver.
 *
 * SET1: `period_start`/`period_end` were rendered raw, so a settlement period read
 *       "2026-08-08T00:00:00.000Z → 2026-08-08T00:00:00.000Z". Dates shown to a user go through
 *       `formatDateUS` (lib/formatDate.ts is the ONE display formatter) — a raw date field in JSX
 *       is the regression.
 *
 * SET2: the driver cell printed `driver_display_id`, which `views.driver_settlement_with_debt`
 *       defines as `d.id::text` — a UUID wearing a display-id name. Rendering that field here is
 *       always wrong, no matter what the API returns, so the guard bans the field outright rather
 *       than trying to inspect its value.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";

const src = readFileSync(join(repoRoot, TARGET), "utf8");
// Blank comments (newlines preserved so line numbers stay exact) — this file explains both defects
// in prose, and prose naming a banned field is documentation, not a render.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const failures = [];

// SET2 — the uuid-bearing field must not be rendered anywhere in this grid.
const displayIdUse = /driver_display_id/.exec(code);
if (displayIdUse) {
  const line = code.slice(0, displayIdUse.index).split("\n").length;
  failures.push(
    `${TARGET}:${line}: renders \`driver_display_id\`, which the view defines as \`d.id::text\` — that is a raw UUID, not a display id.`
  );
}

// SET1 — period fields must be formatted, never interpolated raw into JSX.
for (const field of ["period_start", "period_end"]) {
  const raw = new RegExp(`\\{\\s*row\\.${field}\\s*\\}`).exec(code);
  if (raw) {
    const line = code.slice(0, raw.index).split("\n").length;
    failures.push(`${TARGET}:${line}: renders \`row.${field}\` raw — an ISO timestamp reaches the user. Use formatDateUS().`);
  }
}
if (!/formatDateUS\s*\(\s*row\.period_start/.test(code) || !/formatDateUS\s*\(\s*row\.period_end/.test(code)) {
  failures.push(`${TARGET}: the Period cell must render both period_start and period_end through formatDateUS().`);
}

if (failures.length > 0) {
  console.error("FAIL verify-settlements-grid-honest-labels");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS verify-settlements-grid-honest-labels — period formatted, no uuid-as-display-id in the driver cell");
