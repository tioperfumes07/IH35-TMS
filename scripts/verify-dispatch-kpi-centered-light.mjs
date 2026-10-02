#!/usr/bin/env node
/**
 * DISPATCH KPI TREATMENT — re-anchored 2026-10-02 to the OWNER DESIGN LAW
 * (docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md, rule 6 + tokens): "KPI blocks are tiles across, never bars
 * down. 78px, not 216." The KPI figure is 21px/600, LEFT-aligned inside the tile. This supersedes the 2026-09-04
 * "centered, light tile" ruling this guard used to lock (the filename is kept: it is a registered verify-step target).
 *
 * FAILS IF the dispatch overview tiles stop using the board's tile classes (ih-kpi / ih-kpi__value / dpo-kpi), the
 * tile row stops running across (dpo-kpis grid), the 78px tile height goes, centring comes back, or a tile paints
 * bg-white / Tailwind sizing over the board token.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-kpi-centered-light.mjs [--selftest]
 */
import fs from "node:fs";

const TSX = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const CSS = "apps/frontend/src/pages/dispatch/dispatch-board.css";

export function audit(tsx, css) {
  const fails = [];
  const tile = (tsx.match(/function KpiCard\([\s\S]*?\n}\n/) ?? [""])[0];
  if (!tile) fails.push("KpiCard component is gone");
  if (!/className="ih-kpi dpo-kpi"/.test(tile)) fails.push("tile must use the board tile class (ih-kpi dpo-kpi)");
  if (!/className="ih-kpi__value"/.test(tile)) fails.push("figure must use ih-kpi__value (21px/600, left-aligned)");
  if (!/className="ih-hd"/.test(tile)) fails.push("label must use the board column label (ih-hd)");
  if (/text-?[Aa]lign:\s*"?center|text-center/.test(tile)) fails.push("tiles are left-aligned — centring is the superseded 2026-09-04 rule");
  if (/bg-white|className="[^"]*\b(p|px|py|text)-\[/.test(tile)) fails.push("no Tailwind paint or size over the board tile");
  if (!/import "\.\.\/\.\.\/design\/ih35-design-tokens\.css";/.test(tsx)) fails.push("overview must load the owner tokens css");
  if (!/className="dpo-kpis"/.test(tsx)) fails.push("tiles must sit in the dpo-kpis row");
  if (!/\.dpo-kpis\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(8,/.test(css)) fails.push("dpo-kpis must run 8 tiles across");
  if (!/\.dpo-kpi\s*\{[^}]*min-height:\s*78px/.test(css)) fails.push("tile height is 78px (never a 216px bar)");
  if (/\.dpo-kpi\b[^{]*\{[^}]*text-align:\s*center/.test(css)) fails.push("no centred tile in css");
  return fails;
}

const tsx = fs.readFileSync(TSX, "utf8");
const css = fs.readFileSync(CSS, "utf8");
const failures = audit(tsx, css);
if (failures.length) {
  console.error(`[verify-dispatch-kpi-centered-light] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["centre the figure", tsx.replace('className="ih-kpi__value"', 'className="ih-kpi__value" style={{ textAlign: "center" }}'), css],
    ["drop the board tile", tsx.replaceAll('className="ih-kpi dpo-kpi"', 'className="rounded border bg-white p-3"'), css],
    ["stack the tiles", tsx, css.replace("repeat(8, minmax(0, 1fr))", "minmax(0, 1fr)")],
    ["216px bars", tsx, css.replace("min-height: 78px", "min-height: 216px")],
    ["drop tokens css", tsx.replace('import "../../design/ih35-design-tokens.css";', ""), css],
  ];
  for (const [name, t, c] of mutations) {
    if (audit(t, c).length === 0) {
      console.error(`[verify-dispatch-kpi-centered-light] selftest FAILED — mutation survived: ${name}`);
      process.exit(1);
    }
  }
  console.log(`[verify-dispatch-kpi-centered-light] selftest ${mutations.length}/${mutations.length} caught`);
}

console.log("[verify-dispatch-kpi-centered-light] OK — dispatch KPI tiles are board tiles: across, 78px, left-aligned 21px figure");
