#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch","maintenance","vendors","inventory"],"cols":["vendor","unit","load","connectivity","reverse_link"],"leafRe":"^(home\\.(kanban|round_trips)|arriving_soon\\.convert_to_wo|in_transit\\.promote_to_wo|detail\\.profile|parts\\.roster|parts_inventory\\.record_purchase|vendors\\.create)$","task":"LINK-F5133-CARD-TABLE-CANONICAL-REVERSE-LINKS","vertical":"class-sweep"}
 * Cards, tables, and vendor reverse panels must use the canonical drill resolver.
 */
import fs from "node:fs";

const LABEL = "verify-card-table-canonical-reverse-links";
const FILES = {
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
  kanban: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  roundTrips: "apps/frontend/src/pages/dispatch/RoundTrips.tsx",
  arriving: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx",
  transit: "apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx",
  preferred: "apps/frontend/src/pages/vendors/VendorPreferredPartsReverseSection.tsx",
  inventory: "apps/frontend/src/pages/vendors/VendorPartsInventoryReverseSection.tsx",
  catalog: "apps/frontend/src/pages/vendors/VendorMaintenanceCatalogReverseSection.tsx",
};

const read = (file) => fs.readFileSync(file, "utf8");

function check(sources) {
  const failures = [];
  const expects = [
    ["resolver", /case "inventory_part":[\s\S]{0,100}\/inventory\?part_id=/, "inventory-part route"],
    ["resolver", /case "parts_inventory":[\s\S]{0,120}\/maintenance\/parts-inventory\?part_inventory_id=/, "parts-inventory route"],
    ["resolver", /case "maintenance_vendor":[\s\S]{0,120}\/maintenance\/vendors\/\$\{id\}/, "maintenance-vendor route"],
    ["kanban", /data-kanban-card-secondary="load-number"[\s\S]{0,120}onClick=\{\(event\) => event\.stopPropagation\(\)\}/, "Kanban secondary load"],
    ["kanban", /<EntityLink[\s\S]{0,120}kind="load"[\s\S]{0,80}id=\{load\.id\}[\s\S]{0,120}label=\{cardSecondaryLoadNumber\(load\) \?\? undefined\}/, "Kanban secondary load"],
    ["roundTrips", /<EntityLink kind="load" id=\{load\.id\} label=\{entityLabel\(load\.load_number/, "round-trip load"],
    ["arriving", /<EntityLinkOrTombstone kind="unit" id=\{card\.unit_id\} name=\{card\.unit_number\} noun="Unit"/, "arriving-soon unit"],
    ["arriving", /<EntityLinkOrTombstone kind="load" id=\{card\.load_id\} name=\{card\.load_display_id\} noun="Load"/, "arriving-soon load"],
    ["transit", /<EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_display_id\} noun="Unit"/, "in-transit unit"],
    ["preferred", /<EntityLink kind="inventory_part" id=\{part\.id\}/, "preferred part"],
    ["inventory", /<EntityLink kind="parts_inventory" id=\{row\.id\}/, "purchased inventory"],
    ["catalog", /<EntityLink kind="maintenance_vendor" id=\{row\.id\}/, "maintenance vendor"],
  ];
  for (const [key, pattern, label] of expects) {
    if (!pattern.test(sources[key])) failures.push(`${FILES[key]}: missing canonical ${label} drill`);
  }
  for (const key of ["preferred", "inventory", "catalog", "arriving", "transit"]) {
    if (/from "react-router-dom"/.test(sources[key])) failures.push(`${FILES[key]}: ad-hoc Link import bypasses EntityLink`);
  }
  return failures;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["resolver", 'case "inventory_part"', 'case "inventory_part_removed"'],
    ["resolver", 'case "parts_inventory"', 'case "parts_inventory_removed"'],
    ["resolver", 'case "maintenance_vendor"', 'case "maintenance_vendor_removed"'],
    ["kanban", 'label={cardSecondaryLoadNumber(load) ?? undefined}', 'label={load.id}'],
    ["kanban", 'data-kanban-card-secondary="load-number"', 'data-kanban-card-secondary="dead-load-number"'],
    ["roundTrips", 'kind="load"', 'kind="customer"'],
    ["arriving", '<EntityLinkOrTombstone kind="unit" id={card.unit_id} name={card.unit_number} noun="Unit"', '<EntityLinkOrTombstone kind="vendor" id={card.unit_id} name={null} noun="Vendor"'],
    ["arriving", '<EntityLinkOrTombstone kind="load" id={card.load_id} name={card.load_display_id} noun="Load"', '<EntityLinkOrTombstone kind="customer" id={card.load_id} name={null} noun="Customer"'],
    ["transit", '<EntityLinkOrTombstone kind="unit" id={issue.unit_id} name={issue.unit_display_id} noun="Unit"', '<EntityLinkOrTombstone kind="vendor" id={issue.unit_id} name={null} noun="Vendor"'],
    ["preferred", 'kind="inventory_part"', 'kind="vendor"'],
    ["inventory", 'kind="parts_inventory"', 'kind="vendor"'],
    ["catalog", 'kind="maintenance_vendor"', 'kind="vendor"'],
  ];
  const missed = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      missed.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutated = { ...sources, [key]: sources[key].split(needle).join(replacement) };
    if (check(mutated).length === 0) missed.push(`${key}: planted defect escaped (${needle})`);
  }
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${missed.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — card/table related records use canonical reverse drills`);
