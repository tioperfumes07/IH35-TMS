#!/usr/bin/env node
/** @matrix-built {"modules":["inventory"],"cols":["vendor"],"leafRe":"^(parts\\.(roster|column\\.vendor_link|create|create\\.vendor_picker|edit|edit\\.vendor_picker)|assignments\\.(trail|vendor_link))$","task":"LINK-F5166-INVENTORY-VENDOR-PARTS"} */
/** @matrix-built {"modules":["inventory"],"cols":["reverse_link"],"leaves":["parts.roster"],"task":"INV-F5900-PARTS-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): all 8 genuine inventory vendor
 * leaves — real vendor_id + EntityLink kind="vendor" on the parts roster and assignments trail,
 * real EntityPicker(kind="vendor", allowCreate) on both the create and edit parts drawers.
 *
 * Self-test: node scripts/verify-inventory-vendor-parts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  stock: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  createDrawer: "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
  editDrawer: "apps/frontend/src/pages/inventory/PartEditDrawer.tsx",
  assignments: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  matrix: "docs/specs/scoreboard/modules/inventory.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-inventory-vendor-parts.mjs",
};
const LABEL = "verify-inventory-vendor-parts";
const HEADER = '/** @matrix-built {"modules":["inventory"],"cols":["reverse_link"],"leaves":["parts.roster"],"task":"INV-F5900-PARTS-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */';

// kind="vendor" and id={row.vendor_id} can land on the same line or wrap onto their own JSX-prop
// lines (2026-08-20, CC-3: InventoryPartsStockPage.tsx's EntityLink reformatted multi-line) —
// tolerate whitespace/newlines between the two props instead of requiring a single-line match.
const VENDOR_LINK_RE = /kind="vendor"\s+id=\{row\.vendor_id\}/;

export function audit(src) {
  const failures = [];
  if (!VENDOR_LINK_RE.test(src.stock)) {
    failures.push(`${FILES.stock}: parts roster/column must render a real vendor EntityLink`);
  }
  if (!/data-testid="inv-part-create-vendor-picker"/.test(src.createDrawer) || !/kind="vendor"/.test(src.createDrawer) || !/allowCreate/.test(src.createDrawer)) {
    failures.push(`${FILES.createDrawer}: part create must have EntityPicker kind=vendor with allowCreate`);
  }
  if (!/data-testid="inv-part-edit-vendor-picker"/.test(src.editDrawer) || !/kind="vendor"/.test(src.editDrawer) || !/allowCreate/.test(src.editDrawer)) {
    failures.push(`${FILES.editDrawer}: part edit must have EntityPicker kind=vendor with allowCreate`);
  }
  if (!VENDOR_LINK_RE.test(src.assignments)) {
    failures.push(`${FILES.assignments}: assignments trail/vendor-link must render a real vendor EntityLink`);
  }
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { failures.push(`Inventory matrix parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "parts.roster");
  if (!leaf?.required?.includes("reverse_link")) failures.push("parts.roster must require reverse_link");
  if (leaf?.route_hint !== "/inventory") failures.push("parts.roster must name mounted route /inventory");
  if (!src.self.split('import fs from "node:fs";')[0].includes(HEADER)) failures.push("exact parts.roster header missing");
  try { if (JSON.parse(src.feed).entries?.some((entry) => entry.guard === FILES.self)) failures.push("manual feed duplicates exact ownership"); }
  catch (error) { failures.push(`feed parse: ${error.message}`); }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["stock-link", "stock", VENDOR_LINK_RE, 'kind="unit"\n          id={row.unit_id}'],
    ["create-picker", "createDrawer", /data-testid="inv-part-create-vendor-picker"/, 'data-testid="inv-part-create-vendor-picker-unused"'],
    ["edit-picker", "editDrawer", /data-testid="inv-part-edit-vendor-picker"/, 'data-testid="inv-part-edit-vendor-picker-unused"'],
    ["assignments-link", "assignments", VENDOR_LINK_RE, 'kind="unit" id={row.unit_id}'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  const start = good.matrix.indexOf('"id": "parts.roster"'), end = good.matrix.indexOf("\n    {", start), block = good.matrix.slice(start, end < 0 ? good.matrix.length : end);
  const mutateLeaf = (token, replacement) => good.matrix.slice(0, start) + block.replace(token, replacement) + good.matrix.slice(end < 0 ? good.matrix.length : end);
  for (const [name, matrix] of [
    ["leaf-id", mutateLeaf('"id": "parts.roster"', '"id": "parts.roster.broken"')],
    ["required-col", mutateLeaf('"reverse_link"', '"reverse_link_broken"')],
    ["route", mutateLeaf('"route_hint": "/inventory"', '"route_hint": "/broken"')],
  ]) if (!audit({ ...good, matrix }).length) throw new Error(`${name} mutation escaped`);
  if (!audit({ ...good, self: good.self.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) }).length) throw new Error("header mutation escaped");
  if (!audit({ ...good, feed: JSON.stringify({ entries: [{ guard: FILES.self }] }) }).length) throw new Error("feed mutation escaped");
  console.log(`${LABEL} SELFTEST PASS — 9/9 runtime/evidence mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — inventory's vendor-scoped parts/assignments leaves are real`);
