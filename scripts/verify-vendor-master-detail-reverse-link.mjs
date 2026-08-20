#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^md\\.vendor_details$","task":"VERTICAL-REVERSE-LINK-VENDOR-MASTER-DETAIL"} */
import fs from "node:fs";

const LABEL = "verify-vendor-master-detail-reverse-link";
const PAGE = "apps/frontend/src/pages/Vendors.tsx";
const MATRIX = "docs/specs/scoreboard/modules/vendors.required.json";
const page = fs.readFileSync(PAGE, "utf8");
const matrix = fs.readFileSync(MATRIX, "utf8");

function verify(candidatePage, candidateMatrix) {
  const failures = [];
  try {
    const parsed = JSON.parse(candidateMatrix);
    const leaf = parsed.leaves?.find((item) => item.id === "md.vendor_details");
    if (!leaf?.required?.includes("reverse_link")) failures.push("exact required leaf");
  } catch {
    failures.push("valid vendor matrix");
  }
  if (!candidatePage.includes('data-testid="vendor-master-detail-profile"')) failures.push("selected row surface");
  if (!candidatePage.includes('<EntityLink kind="vendor" id={selectedVendor.id} label={selectedVendor.name} />')) {
    failures.push("canonical vendor identity");
  }
  if (!candidatePage.includes('navigate(`/vendors/${selectedVendor.id}`)')) failures.push("profile drill-through");
  if (!candidatePage.includes("selectedVendor.vendor_code") || !candidatePage.includes("selectedVendor.vendor_type")) {
    failures.push("real selected fields");
  }
  if (candidatePage.includes("Vendor details are shown in the header section for this layout.")) failures.push("placeholder removed");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [page, matrix.replace('"id": "md.vendor_details"', '"id": "md.vendor_details_removed"'), "exact required leaf"],
    [page.replace('data-testid="vendor-master-detail-profile"', 'data-testid="removed"'), matrix, "selected row surface"],
    [page.replace('<EntityLink kind="vendor" id={selectedVendor.id} label={selectedVendor.name} />', "<span>{selectedVendor.name}</span>"), matrix, "canonical vendor identity"],
    [page.replace('navigate(`/vendors/${selectedVendor.id}`)', "void selectedVendor.id"), matrix, "profile drill-through"],
    [page.replaceAll("selectedVendor.vendor_code", "selectedVendor.name"), matrix, "real selected fields"],
    [`${page}\nVendor details are shown in the header section for this layout.`, matrix, "placeholder removed"],
  ];
  mutations.forEach(([candidatePage, candidateMatrix, expected], index) => {
    if (candidatePage === page && candidateMatrix === matrix) throw new Error(`${LABEL} fixture ${index + 1} drifted`);
    if (!verify(candidatePage, candidateMatrix).includes(expected)) throw new Error(`${LABEL} mutation ${index + 1} escaped: ${expected}`);
  });
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`);
  process.exit(0);
}

const failures = verify(page, matrix);
if (failures.length) {
  console.error(`${LABEL} FAIL — ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — selected vendor→canonical profile drill-through`);
