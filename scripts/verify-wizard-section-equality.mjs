#!/usr/bin/env node
/**
 * verify:wizard-section-equality — EXACT field-set equality per wizard section (GUARD empty-diff upgrade,
 * 2026-06-23). The presence-only parity guard passed while §C rendered 18 fields when the design has 11 —
 * because it never checked for EXTRA fields. This guard closes that hole.
 *
 * For each section in docs/design/wizard-section-contract.json it:
 *   1. locates the section's container `<div data-testid={`<container>-${index}`}>` (or `data-testid="<container>"`)
 *      in the component source,
 *   2. slices that div's inner region by <div> depth-matching (the row containers hold flat <Field>/<Controller>
 *      children — no nested divs — so depth 1→0 bounds the region cleanly),
 *   3. extracts the rendered field labels (`label="..."`) in that region,
 *   4. asserts the label SET == exact_labels — FAIL ON MISSING **and** FAIL ON EXTRA.
 *
 * This is the machine form of GUARD's "same fields, same labels, NOTHING missing and NOTHING extra" rule.
 * §7 palette overrides design color, never a field. See IH35-WIZARD-IDENTICAL-TARGET.md + [[design-parity-lock]].
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTRACT = path.join(ROOT, "docs/design/wizard-section-contract.json");

if (!fs.existsSync(CONTRACT)) {
  console.error(`verify:wizard-section-equality FAIL: missing contract ${path.relative(ROOT, CONTRACT)}`);
  process.exit(1);
}

// Return the inner source of the <div> that carries `data-testid={`<container>-...`}` / `data-testid="container"`,
// bounded by <div> depth so nested-but-flat children are fully captured. Null if the container isn't found.
function sliceContainer(src, container) {
  const markerRe = new RegExp(`data-testid=(?:\\{\`${container}-\\$\\{[^}]+\\}\`\\}|"${container}")`);
  const m = markerRe.exec(src);
  if (!m) return null;
  // Find the opening <div that owns this testid (the nearest "<div" before the marker).
  const openTagStart = src.lastIndexOf("<div", m.index);
  if (openTagStart < 0) return null;
  const openTagEnd = src.indexOf(">", m.index);
  if (openTagEnd < 0) return null;
  // Depth scan from just after the opening tag.
  let depth = 1;
  let i = openTagEnd + 1;
  const regionStart = i;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf("<div", i);
    const nextClose = src.indexOf("</div>", i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) return src.slice(regionStart, nextClose);
      i = nextClose + 6;
    }
  }
  return null;
}

const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
const failures = [];
let sectionsChecked = 0;

for (const [screen, spec] of Object.entries(contract)) {
  if (screen.startsWith("_")) continue;
  const compPath = path.join(ROOT, spec.component);
  if (!fs.existsSync(compPath)) {
    failures.push(`${screen}: component not found (${spec.component})`);
    continue;
  }
  const src = fs.readFileSync(compPath, "utf8");
  for (const section of spec.sections ?? []) {
    const region = sliceContainer(src, section.container);
    if (region == null) {
      failures.push(`${screen} / ${section.name}: container "${section.container}" not found (need a <div data-testid> wrapper)`);
      continue;
    }
    const found = [...region.matchAll(/label="([^"]+)"/g)].map((x) => x[1]);
    const expected = section.exact_labels;
    const foundSet = new Set(found);
    const expSet = new Set(expected);
    const missing = expected.filter((l) => !foundSet.has(l));
    const extra = found.filter((l) => !expSet.has(l));
    if (missing.length || extra.length) {
      const parts = [];
      if (missing.length) parts.push(`MISSING: ${missing.join(" · ")}`);
      if (extra.length) parts.push(`EXTRA: ${extra.join(" · ")}`);
      failures.push(`${screen} / ${section.name}: field set != design (${expected.length} expected) → ${parts.join("  |  ")}`);
    }
    sectionsChecked += 1;
  }
}

if (failures.length) {
  console.error("verify:wizard-section-equality FAIL — a section's field set does not EXACTLY match its design:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nEmpty-diff rule: same fields, same labels, NOTHING missing and NOTHING extra. Remove extras / restore missing.");
  process.exit(1);
}
console.log(`verify:wizard-section-equality PASS — ${sectionsChecked} section(s) exactly match their design field set`);
