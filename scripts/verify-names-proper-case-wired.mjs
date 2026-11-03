#!/usr/bin/env node
/**
 * LEAD 11-03 — register rows 182 200 202 207 212 214 220 223 225 229 231 233 (D003 D022 D026 D031 D036 D038 D044
 * D047 D049 D053 D055 D057): a PERSON's name renders in proper case everywhere ("HUGO GAYTAN" → "Hugo Gaytan",
 * owner ruling 10-22, shared apps/frontend/src/lib/formatPersonName.ts); a company / customer / vendor name renders
 * through the ONE shared apps/frontend/src/lib/formatCompanyName.ts (proper case, legal suffixes + acronyms upper).
 * Display only — no stored data or API payload is rewritten.
 *
 * Static: every surface below still routes its rendered name through the formatter (directly, or through
 * entityLabel(…, "Driver") which calls formatPersonName, or companyLabel / userDisplayLabel / filingDetailLabel /
 * namesMasterLabel / docsEntityLabel). The formatters themselves keep their contracts.
 * --selftest plants the removal of each formatter call in memory and must catch every one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-names-proper-case-wired";
const FE = (p) => `apps/frontend/src/${p}`;

/** [row, file, wired needle, the same text with the formatter removed (the plant)] */
export const SURFACES = [
  ["182", FE("components/home/DriverDaySummaryCard.tsx"), 'label={entityLabel(row.driver_name, row.driver_id, "Driver")}', "label={row.driver_name}"],
  ["200", FE("pages/dispatch/DispatchOverview.tsx"), '<EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />', '<EntityLink kind="driver" id={unit.driver_id} label={unit.driver_name} />'],
  ["202", FE("pages/accounting/LoadCostsBoardPage.tsx"), 'render: r => r.driver_name ? formatPersonName(r.driver_name) : "Not assigned"', 'render: r => r.driver_name ? r.driver_name : "Not assigned"'],
  ["202", FE("pages/accounting/LoadCostsBoardPage.tsx"), 'party: formatCompanyName(b.vendor_name) || "Vendor not set"', 'party: b.vendor_name || "Vendor not set"'],
  ["207", FE("pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx"), 'const name = entityLabel(dr.driver_name, driverId, "Driver");', "const name = dr.driver_name;"],
  ["212", FE("pages/safety/HoursOfServicePage.tsx"), 'label={entityLabel(row.driverName, row.driverId, "Driver")}', "label={row.driverName}"],
  ["214", FE("pages/compliance/FilingsComplianceDueSection.tsx"), "render: (row) => filingDetailLabel(row) },", "render: (row) => row.detail },"],
  ["214", FE("pages/compliance/FilingsComplianceDueSection.tsx"), "return `${formatPersonName(detail.slice(0, sep))}${detail.slice(sep)}`;", "return detail;"],
  ["214", FE("components/compliance/ComplianceTable.tsx"), "const label = entityLabel(row.owner_name, row.owner_id, ownerNoun(row.owner_type));", "const label = row.owner_name;"],
  ["220", FE("pages/accounting/AccountingHubPage.tsx"), 'name: entityLabel(row.driver_name, row.driver_id ?? row.settlement_id, "Driver"),', "name: row.driver_name ?? \"\","],
  ["223", FE("pages/factoring/factoring-summary-groups.tsx"), 'label={companyLabel(r.customer_name, r.customer_id, "Customer")}', "label={r.customer_name}"],
  ["223", FE("pages/factoring/SubmitToFactorTab.tsx"), 'label={companyLabel(r.customer_name, r.customer_id, "Customer")}', "label={r.customer_name}"],
  ["223", FE("pages/factoring/FactoringHome.tsx"), 'label={companyLabel(row.customer_name, row.customer_id, "Customer")}', "label={row.customer_name}"],
  ["225", FE("pages/customers/CustomerListSidebar.tsx"), 'className="single-line-name">{formatCompanyName(customer.name)}</span>', 'className="single-line-name">{customer.name}</span>'],
  ["225", FE("components/boards/PartyBoard.tsx"), 'cell: (r) => formatCompanyName(r.name) },', "cell: (r) => r.name },"],
  ["225", FE("pages/Customers.tsx"), "{formatCompanyName(selectedCustomer.name)}</h2>", "{selectedCustomer.name}</h2>"],
  ["225", FE("pages/customers/CustomersListView.tsx"), 'linkLabel={companyLabel(row.name, row.id, "Customer")}', "linkLabel={row.name}"],
  ["229", FE("pages/lists/names/NamesMasterHub.tsx"), "const label = namesMasterLabel(row, noun);", "const label = entityLabel(row.display_name, row.entity_id, noun);"],
  ["229", FE("pages/lists/names/NamesMasterHub.tsx"), 'if (row.entity_type === "contact") return formatPersonName(raw);', 'if (row.entity_type === "contact") return raw;'],
  ["231", FE("pages/docs/DocsHomePage.tsx"), "label={docsEntityLabel(link.entity_type, rawLabel, link.entity_id, noun)}", "label={rawLabel ?? noun}"],
  ["231", FE("pages/docs/DocsHomePage.tsx"), 'return companyLabel(rawLabel, entityId, noun);', "return String(rawLabel ?? noun);"],
  ["233", FE("pages/Users.tsx"), '<span className="font-semibold text-[#0F1219]">{userDisplayLabel(user)}</span>', '<span className="font-semibold text-[#0F1219]">{user.name ?? user.email}</span>'],
  ["233", FE("pages/Users.tsx"), "label={userDisplayLabel(selected)} />", 'label={selected.name ?? "User"} />'],
  ["233", FE("pages/Users.tsx"), "linkLabel={userDisplayLabel(row)}", "linkLabel={row.name}"],
  ["233", FE("lib/entity-label.ts"), "    return formatPersonName(name);\n  }\n  if (email) return email;", "    return name;\n  }\n  if (email) return email;"],
];

/** Formatter contracts (the shared helpers the surfaces lean on). */
export const CONTRACTS = [
  ["entityLabel person nouns", FE("lib/entity-label.ts"), "        return formatPersonName(s);", "        return s;"],
  ["formatCompanyName keeps suffixes upper", FE("lib/formatCompanyName.ts"), "  if (KEEP_UPPER.has(b)) return word.toUpperCase();", "  if (KEEP_UPPER.has(b)) return word;"],
  ["companyLabel formats a resolved name", FE("lib/formatCompanyName.ts"), "return raw !== \"\" && label === raw ? formatCompanyName(raw) : label;", "return label;"],
];

const ALL = [...SURFACES.map(([row, file, needle, plant]) => [`row ${row}`, file, needle, plant]), ...CONTRACTS];

export function findDefects(files) {
  const out = [];
  for (const [what, file, needle] of ALL) {
    const src = files[file];
    if (src == null) out.push(`${what}: ${file} missing`);
    else if (!src.includes(needle)) out.push(`${what}: ${file} no longer renders the name through its formatter (${needle.split("\n")[0]})`);
  }
  return out;
}

const files = {};
for (const [, file] of ALL) {
  if (!(file in files)) {
    try {
      files[file] = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      files[file] = null;
    }
  }
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  let total = 0;
  const clean = findDefects(files).length === 0;
  console.log(`${clean ? "ok  " : "MISS"}  clean tree passes`);
  for (const [what, file, needle, plant] of ALL) {
    total++;
    const src = files[file] ?? "";
    const planted = src.split(needle).join(plant);
    const hit = planted !== src && findDefects({ ...files, [file]: planted }).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${what} formatter removed in ${file}`);
    if (hit) caught++;
  }
  const ok = clean && caught === total;
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught${clean ? "" : " (clean tree FAILS)"}`);
  process.exit(ok ? 0 : 1);
}

const defects = findDefects(files);
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${SURFACES.length} name surfaces across 12 register rows render through formatPersonName / formatCompanyName (${CONTRACTS.length} formatter contracts held)`);
