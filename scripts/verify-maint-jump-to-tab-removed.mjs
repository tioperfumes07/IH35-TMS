#!/usr/bin/env node
/**
 * Forbid redundant "Jump to tab" dropdown that duplicates MaintenanceHome SUBNAV tabs.
 * Route-based organizational subnavs (e.g. Master Data with distinct /maintenance/* paths) are allowed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const maintenanceHomePath = path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");

const FORBIDDEN_MESSAGE =
  "Found Jump-to-tab dropdown duplicating sub-tab row. " +
  "Legitimate organizational subnavs (e.g. Master Data with distinct routes) are allowed.";

const OVERLAP_FAIL_RATIO = 0.5;

function fail(detail) {
  console.error(`verify:maint-jump-to-tab-removed failed: ${FORBIDDEN_MESSAGE}`);
  if (detail) console.error(detail);
  process.exit(1);
}

if (!fs.existsSync(maintenanceHomePath)) {
  fail("missing MaintenanceHome.tsx");
}

const source = fs.readFileSync(maintenanceHomePath, "utf8");

if (/jump to tab/i.test(source)) {
  fail("MaintenanceHome.tsx still contains a 'Jump to tab' trigger label.");
}

if (/\bJumpToTab\b/.test(source)) {
  fail("MaintenanceHome.tsx still references JumpToTab component.");
}

if (source.includes('data-testid="maint-jump-to-tab"')) {
  fail("MaintenanceHome.tsx still has data-testid maint-jump-to-tab.");
}

const subnavBlockMatch = source.match(/const SUBNAV = \[([\s\S]*?)\] as const;/);
if (!subnavBlockMatch) {
  fail("Could not parse SUBNAV block in MaintenanceHome.tsx");
}

const subnavLabels = new Set();
const labelRe = /label:\s*"([^"]+)"/g;
let m;
while ((m = labelRe.exec(subnavBlockMatch[1]))) subnavLabels.add(m[1].trim());

/** Legacy bad pattern: shared HoverDropdown + in-tab onSelect (not route href nav). */
const hoverDropdownBlocks = source.match(/<HoverDropdown\b[\s\S]*?<\/HoverDropdown>/g) ?? [];
for (const block of hoverDropdownBlocks) {
  if (/onSelect|setTab\s*\(/.test(block)) {
    fail("HoverDropdown in MaintenanceHome still wires tab state (onSelect/setTab).");
  }
  if (block.includes("SUBNAV")) {
    fail("HoverDropdown still maps SUBNAV tab items for jumping.");
  }
}

if (/\bitems=\{SUBNAV\}/.test(source) || /\bitems:\s*SUBNAV\b/.test(source)) {
  const nearHover = /HoverDropdown[\s\S]{0,400}SUBNAV|SUBNAV[\s\S]{0,400}HoverDropdown/.test(source);
  if (nearHover) {
    fail("SUBNAV tab list is still passed into a HoverDropdown jump control.");
  }
}

function extractLabels(block) {
  const labels = [];
  const childLabelRe = /label:\s*"([^"]+)"/g;
  let match;
  while ((match = childLabelRe.exec(block))) labels.push(match[1].trim());
  return labels;
}

function overlapRatio(labels) {
  if (labels.length === 0) return 0;
  const hits = labels.filter((label) => subnavLabels.has(label)).length;
  return hits / labels.length;
}

const hoverNavBlocks = source.match(/<HoverDropdownNav[\s\S]*?\/>/g) ?? [];
for (const block of hoverNavBlocks) {
  if (/setTab\s*\(|onSelect/.test(block)) {
    fail("HoverDropdownNav must not call setTab/onSelect; use href routes only.");
  }
}

/** Only dropdown groups wired into HoverDropdownNav count (not standalone route link tables). */
const moduleNavBlock = source.match(/const MAINTENANCE_MODULE_NAV_ITEMS[\s\S]*?];\n/);
const dropdownLabels = moduleNavBlock ? extractLabels(moduleNavBlock[0]) : [];

if (overlapRatio(dropdownLabels) >= OVERLAP_FAIL_RATIO) {
  fail(`HoverDropdownNav items overlap SUBNAV tab row by ${Math.round(overlapRatio(dropdownLabels) * 100)}%.`);
}

console.log("verify:maint-jump-to-tab-removed: ok");
