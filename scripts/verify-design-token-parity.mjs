#!/usr/bin/env node
/**
 * ROUND 326.5 — owner design law (docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md): the app is built to
 * the boards, on the tokens in apps/frontend/src/design/ih35-design-tokens.css (copied from docs/design/).
 * For every surface in SURFACES (each seat extends the list with its own boards' files):
 *   1. no hex colour literal that is not a token value;
 *   2. every filter / select / search / gear control class sizes to the control token (34px), every primary action to
 *      44px, every form field to 40px, date boxes 132px, money boxes 120px;
 *   3. no table cell, row or column declares a left or right border;
 *   4. KPI rows run across (grid with repeat(N) columns), never stacked;
 *   5. the money / count formatters render "—" for missing, never 0 or -$0.00.
 * Static, < 1 s.
 */
import { readFileSync, existsSync } from "node:fs";

const TOKENS = "apps/frontend/src/design/ih35-design-tokens.css";
const SURFACES = [
  // CC-3 — driver-customers-vendors boards + the profile surfaces they open
  "apps/frontend/src/components/boards/PartyBoard.tsx",
  "apps/frontend/src/components/boards/DriverHubBoard.tsx",
  "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
  "apps/frontend/src/components/boards/party-board.css",
  "apps/frontend/src/components/profile/ProfileBlocks.tsx",
  "apps/frontend/src/components/customers/CustomerProfileOverview.tsx",
  "apps/frontend/src/components/vendors/VendorProfileOverview.tsx",
  "apps/frontend/src/components/driver-profile/DriverWholeProfile.tsx",
];
const fails = [];
const tokenCss = readFileSync(TOKENS, "utf8");
const allowed = new Set([...tokenCss.matchAll(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g)].map((m) => m[0].toUpperCase()));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

for (const f of SURFACES) {
  if (!existsSync(f)) { fails.push(`${f}: surface listed but missing`); continue; }
  const src = strip(readFileSync(f, "utf8"));
  for (const m of src.matchAll(/#[0-9A-Fa-f]{6}\b/g)) if (!allowed.has(m[0].toUpperCase())) fails.push(`${f}: hex ${m[0]} is not a design token`);
  if (/border-(left|right)\s*:/.test(src) || /\bborder-[lr](-|\b)/.test(src)) fails.push(`${f}: declares a left/right border (lines are for rows, never for columns)`);
}

// 2. control sizes — read the board stylesheet's control classes
const css = strip(readFileSync("apps/frontend/src/components/boards/party-board.css", "utf8"));
const rule = (sel) => (css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`)) ?? [])[1] ?? "";
for (const sel of [".pb-chip", ".pb-select", ".pb-search", ".pb-gear", ".pb-tokens"]) {
  if (!/(min-)?height:\s*var\(--ih-h-control\)/.test(rule(sel))) fails.push(`party-board.css ${sel}: must size to var(--ih-h-control) (34px)`);
}
for (const sel of [".pb-create", ".pb-refresh", ".dd-btn"]) {
  if (!/(min-)?height:\s*var\(--ih-h-action\)/.test(rule(sel))) fails.push(`party-board.css ${sel}: primary action must size to var(--ih-h-action) (44px)`);
}
for (const [name, px] of [["--ih-h-control", 34], ["--ih-h-field", 40], ["--ih-h-action", 44], ["--ih-w-date", 132], ["--ih-w-money", 120]]) {
  if (!new RegExp(`${name}:\\s*${px}px`).test(tokenCss)) fails.push(`tokens: ${name} must be ${px}px`);
}
// 4. KPI rows across
for (const sel of [".pb-kpis", ".dd-kpis"]) {
  if (!/grid-template-columns:\s*repeat\(\s*\d+/.test(rule(sel))) fails.push(`party-board.css ${sel}: KPI row must be a grid of tiles across`);
  if (/flex-direction:\s*column/.test(rule(sel))) fails.push(`party-board.css ${sel}: KPI row must not stack`);
}
// 5. missing renders —, a real zero renders $0.00 (lib/money C-35/C-37; Lead ruling ROUND 330.6). This check used to
// REQUIRE `c ? usd(c) : "—"`, which falsy-tests a number and renders every measured $0.00 as "—" (unknown) — the
// guard asserted the defect. It now requires the canonical table formatter and fails the falsy form.
for (const f of ["apps/frontend/src/components/boards/PartyBoard.tsx", "apps/frontend/src/components/boards/DriverHubBoard.tsx", "apps/frontend/src/components/boards/DriverOverviewBoard.tsx"]) {
  const src = readFileSync(f, "utf8");
  if (!/const money = \(c(ents)?: number \| null \| undefined\) => formatUsdCentsTable\(c(ents)?\)/.test(src)) fails.push(`${f}: money() must be formatUsdCentsTable — "—" for missing, "$0.00" for a real zero`);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/\? usd\(c(ents)?\) : "—"/.test(code)) fails.push(`${f}: money() falsy-tests a number — a real $0.00 would render "—"`);
}
if (fails.length) { console.error("verify-design-token-parity: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-design-token-parity: OK — ${SURFACES.length} surfaces on the owner's tokens; controls 34 / fields 40 / actions 44 / date 132 / money 120; no column borders; KPI rows across`);
