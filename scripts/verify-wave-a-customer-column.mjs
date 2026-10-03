#!/usr/bin/env node
/** @matrix-built {"modules":["home","reports","factoring"],"cols":["customer"],"leafRe":"^(role\\.dispatcher|report\\.dispatch_margin|submit\\.queue)$","task":"WAVE-A-customer-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts", /l\.customer_id::text/],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/backend/src/driver/loads.routes.ts", /customer_id:\s*row\.customer_id/],
  ["apps/frontend/src/pages/driver/DriverLoadsPage.tsx", /<EntityLink[\s\S]{0,80}kind="customer"[\s\S]{0,80}id=\{load\.customer_id\}/],
  ["apps/frontend/src/pages/driver/DriverLoadsPage.tsx", /q\.isError[\s\S]{0,360}title="Couldn't load assigned loads"[\s\S]{0,360}q\.refetch\(\)/],
  ["apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx", /<EntityLink kind="customer" id=\{load\.customer_id\}/],
  ["apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx", /q\.isError[\s\S]{0,360}title="Couldn't load assigned load"[\s\S]{0,360}q\.refetch\(\)[\s\S]{0,260}if \(!q\.data\)/],
  ["apps/backend/src/reports/dispatch-margin.routes.ts", /l\.customer_id::text/],
  ["apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/backend/src/factoring/submission-queue.service.ts", /i\.customer_id::text/],
  // Multi-line JSX (kind/id/label on separate lines) — same whitespace-tolerant pattern already
  // used for DriverLoadsPage.tsx above. Independently converged fix (CC-2 had the same re-anchor
  // via a616eed3c/01b9b2f5f; kept this already-integrated, slightly more general version).
  ["apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx", /<EntityLink[\s\S]{0,80}kind="customer"[\s\S]{0,80}id=\{item\.customer_id\}/],
];
const DRIVER_LOADS = "apps/frontend/src/pages/driver/DriverLoadsPage.tsx";
const files = Object.fromEntries([...new Set(checks.map(([file]) => file))].map((file) => [file, fs.readFileSync(file, "utf8")]));
const audit = (source) => {
  const failures = checks.filter(([file, pattern]) => !pattern.test(source[file])).map(([file]) => `${file}: customer FK/link missing`);
  const page = source[DRIVER_LOADS] ?? "";
  if (page.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (page.includes("#8A92AB") || page.includes("#334155")) failures.push("leftover off-scale muted");
  return failures;
};
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [file, pattern] of checks) {
    const mutant = { ...files, [file]: files[file].replace(new RegExp(pattern.source, "g"), "PLANTED_CUSTOMER_LINK_DEFECT") };
    if (mutant[file] === files[file] || !audit(mutant).length) throw new Error(`customer-column mutation survived: ${file}`);
    caught++;
  }
  const leftoverPlant = { ...files, [DRIVER_LOADS]: `${files[DRIVER_LOADS]}\n<div className="text-[11px] text-[#8A92AB]">plant</div>` };
  const leftover = audit(leftoverPlant);
  if (!leftover.includes("leftover text-[11px]") || !leftover.includes("leftover off-scale muted")) {
    throw new Error("leftover plant escaped");
  }
  console.log(`verify-wave-a-customer-column SELFTEST PASS — ${caught} planted defects + leftover plant rejected`);
}
const failures = audit(files);
if (failures.length) {
  console.error(`verify-wave-a-customer-column FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-customer-column PASS — customer FK reaches Home, Driver Hub, Reports, and Factoring links");
