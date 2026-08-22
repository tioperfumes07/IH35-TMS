#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^md\\.vendor_details$","task":"VERTICAL-REVERSE-LINK-VENDOR-MASTER-DETAIL"} */
import fs from "node:fs";

const LABEL = "verify-vendor-master-detail-reverse-link";
const PAGE = "apps/frontend/src/pages/Vendors.tsx";
const MATRIX = "docs/specs/scoreboard/modules/vendors.required.json";
const source = { page: fs.readFileSync(PAGE, "utf8"), matrix: fs.readFileSync(MATRIX, "utf8") };

const checks = [
  ["selected company produces canonical company id", "page", /const \{ selectedCompanyId, selectedCompany \} = useCompanyContext\(\)[\s\S]{0,80}const companyId = selectedCompanyId \?\? ""/],
  ["vendor cache identity includes selected company", "page", /queryKey: \["vendors", "page", companyId\]/],
  ["vendor reader sends selected company and active scope", "page", /listVendors\(\{ operating_company_id: companyId, limit: 5000, active_company_only: true \}\)/],
  ["vendor reader waits for selected company", "page", /queryKey: \["vendors", "page", companyId\][\s\S]{0,500}enabled: Boolean\(companyId\)/],
  ["selected master row resolves exact canonical ID", "page", /vendorsSorted\.find\(\(vendor\) => vendor\.id === selectedVendorId\)/],
  ["list-to-master transition stores selected canonical ID", "page", /onSelectVendor=\{\(vendorId\) => \{[\s\S]{0,100}setSelectedVendorId\(vendorId\)[\s\S]{0,100}setViewMode\("master-detail"\)/],
  ["sidebar selection writes the same selected ID state", "page", /onSelectVendor=\{setSelectedVendorId\}/],
  ["master detail exposes exact selected-row surface", "page", /data-testid="vendor-master-detail-profile"/],
  ["canonical profile label drills by selected vendor ID", "page", /<EntityLink kind="vendor" id=\{selectedVendor\.id\} label=\{selectedVendor\.name\} \/>/],
  ["full-profile action is tombstone-safe and exact", "page", /<EntityLinkOrTombstone[\s\S]{0,500}kind="vendor"[\s\S]{0,160}id=\{selectedVendor\.id\}[\s\S]{0,160}name=\{selectedVendor\.name\}[\s\S]{0,300}vendor-details-full-profile-record-link/],
  ["edit action routes by selected canonical ID", "page", /navigate\(`\/vendors\/\$\{selectedVendor\.id\}`\)/],
  ["profile displays selected vendor code", "page", /<dd>\{selectedVendor\.vendor_code \|\| "—"\}<\/dd>/],
  ["profile displays selected vendor type", "page", /<dd>\{selectedVendor\.vendor_type \|\| "—"\}<\/dd>/],
];

function matrixHasExactLeaf(text) {
  try {
    const parsed = JSON.parse(text);
    const leaf = parsed.leaves?.find((item) => item.id === "md.vendor_details");
    return Boolean(leaf?.required?.includes("reverse_link"));
  } catch {
    return false;
  }
}

function audit(candidate) {
  const failures = checks.filter(([, key, pattern]) => !pattern.test(candidate[key])).map(([message]) => message);
  if (candidate.page.includes("Vendor details are shown in the header section for this layout.")) failures.push("placeholder-only profile stays retired");
  if (!matrixHasExactLeaf(candidate.matrix)) failures.push("matrix requires reverse_link on exact md.vendor_details leaf");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = audit(source);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — baseline: ${baseline.join("; ")}`);
    process.exit(1);
  }
  for (const [message, key, pattern] of checks) {
    const changedSource = source[key].replace(pattern, "/* planted vendor master-detail defect */");
    if (changedSource === source[key] || !audit({ ...source, [key]: changedSource }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — escaped or inert plant: ${message}`);
      process.exit(1);
    }
  }
  if (!audit({ ...source, page: `${source.page}\nVendor details are shown in the header section for this layout.` }).includes("placeholder-only profile stays retired")) {
    console.error(`${LABEL} SELFTEST FAIL — retired placeholder plant escaped`);
    process.exit(1);
  }
  const changedMatrix = source.matrix.replace('"id": "md.vendor_details"', '"id": "md.vendor_details_removed"');
  if (changedMatrix === source.matrix || !audit({ ...source, matrix: changedMatrix }).includes("matrix requires reverse_link on exact md.vendor_details leaf")) {
    console.error(`${LABEL} SELFTEST FAIL — exact matrix leaf plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length + 2}/${checks.length + 2} production/matrix defects caught`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — selected-company vendor roster→exact selected row→canonical/tombstone profile drills`);
