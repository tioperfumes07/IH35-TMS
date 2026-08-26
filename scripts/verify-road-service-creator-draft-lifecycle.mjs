#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","drivers","fleet","vendors"],"cols":["connectivity","reverse_link"],"leaves":["road_service.active","profiles.detail","unit.profile.maintenance","detail.profile"],"task":"MAINT-F6510-ROAD-SERVICE-CREATOR-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx";
const source = fs.readFileSync(file, "utf8");

const RESETTERS = [
  'setTicketNumber("")',
  'setVendorId("")',
  'setVendorName("")',
  'setUnitId("")',
  'setDriverId("")',
  'setServiceType("tire_change")',
  'setLocationAddress("")',
  'setInitialComplaint("")',
  "setError(null)",
];

function failures(input = source) {
  const resetBody = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  const missing = RESETTERS.filter((token) => !resetBody.includes(token));
  return [
    ["complete draft reset", missing.length === 0],
    ["reset on open and company changes", /useEffect\(\(\) => \{\s*if \(open\) resetDraft\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(input)],
    ["all close paths reset first", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["modal dismiss uses reset close", input.includes('<Modal open={open} onClose={handleClose}')],
    ["cancel uses reset close", /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["successful submit uses reset close", /await createTicket\.mutateAsync[\s\S]*?handleClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleFk = source.replace('setVendorId("");', "void vendorId;");
  const staleCompany = source.replace("[open, operatingCompanyId, resetDraft]", "[open, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}');
  const checks = [
    failures(staleFk).includes("complete draft reset"),
    failures(staleCompany).includes("reset on open and company changes"),
    failures(bypassCancel).includes("cancel uses reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-road-service-creator-draft-lifecycle selftest PASS — 3/3 stale-draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-road-service-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-road-service-creator-draft-lifecycle PASS — Road Service creator is isolated across close/open/company changes");
