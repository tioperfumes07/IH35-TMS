#!/usr/bin/env node
/** LST-F138 — QBO class linkage picker names + PositionHistory/Disputes/AuditTrail human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx",
  "apps/frontend/src/pages/safety/PositionHistoryPage.tsx",
  "apps/frontend/src/pages/driver/DisputesPage.tsx",
  "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
];
const LABEL = "verify-qbo-class-linkage-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  const qbo = srcs[FILES[0]];
  if (!/listClassesForJe/.test(qbo)) problems.push(`${FILES[0]}: missing listClassesForJe`);
  if (!/entityLabel\(classNameById\.get/.test(qbo)) problems.push(`${FILES[0]}: class column still raw id`);
  if (/placeholder="QBO class id"/.test(qbo)) problems.push(`${FILES[0]}: still free-text class id input`);
  // 443.137 9e part 2 (CC-2), guard change — OLD: the unit class ACTION had to be a SelectCombobox of the
  // class catalog. NEW: the page must carry NO class/vendor link action at all (no linkUnitQboClass /
  // linkDriverQboVendor / VendorLinkageModal) and must say it is read-only. WHY: the link routes answer
  // 409 QBO_NATIVE_WRITE_REFUSED (QuickBooks is a read-only archive), so the action was removed, not left
  // broken. The class column must still show the human class label (asserted above).
  const qboCode = qbo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/linkUnitQboClass|linkTrailerQboClass|linkDriverQboVendor|VendorLinkageModal|Link to Existing|Auto-Link/.test(qboCode)) {
    problems.push(`${FILES[0]}: QBO link action present — the link routes answer 409 QBO_NATIVE_WRITE_REFUSED`);
  }
  if (!/data-testid="qbo-vendor-linkage-read-only"/.test(qbo)) {
    problems.push(`${FILES[0]}: must state on screen that the linkage view is read-only`);
  }
  for (const [file, src] of Object.entries(srcs)) {
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  const pos = srcs[FILES[1]];
  if (/font-mono text-xs text-gray-900">\{row\.actor_id\}/.test(pos)) {
    problems.push(`${FILES[1]}: actor_id still raw font-mono`);
  }
  const disputes = srcs[FILES[2]];
  if (!/useCompanyContext\(\)/.test(disputes)) problems.push(`${FILES[2]}: must consume canonical company context`);
  if (/getOperatingCompanyId\(\)/.test(disputes)) problems.push(`${FILES[2]}: must not read stale token company scope`);
  if (!/entityLabel\(selectedCompany\.short_name \?\? selectedCompany\.legal_name, selectedCompany\.id, "Company"\)/.test(disputes)) {
    problems.push(`${FILES[2]}: must render selected company human label`);
  }
  if (disputes.includes("text-[11px]")) problems.push("leftover text-[11px]");
  if (disputes.includes("#8A92AB") || disputes.includes("#334155")) problems.push("leftover off-scale muted");
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const disputesPlanted = { ...srcs };
  disputesPlanted[FILES[2]] = disputesPlanted[FILES[2]].replace(
    /entityLabel\(selectedCompany\.short_name \?\? selectedCompany\.legal_name, selectedCompany\.id, "Company"\)/,
    'entityLabel(null, selectedCompany.id, "Company")',
  );
  if (disputesPlanted[FILES[2]] === srcs[FILES[2]] || !assertAll(disputesPlanted).length) {
    console.error(`${LABEL} SELFTEST FAILED: disputes company-label defect not caught`);
    process.exit(1);
  }
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]]
    .replace(/entityLabel\(classNameById\.get\(row\.qbo_class_id\),\s*row\.qbo_class_id,\s*"Class"\)/, "row.qbo_class_id")
    .replace(/placeholder=\{?undefined\}?/, 'placeholder="QBO class id"');
  // force raw column
  planted[FILES[0]] = planted[FILES[0]].replace(
    /row\.qbo_class_id \? entityLabel\(classNameById\.get\(row\.qbo_class_id\), row\.qbo_class_id, "Class"\) : "—"/,
    "row.qbo_class_id ?? \"-\"",
  );
  if (!assertAll(planted).length) {
    // plant actor_id too if class plant insufficient
    planted[FILES[1]] = planted[FILES[1]].replace(
      /entityLabel\(null,\s*row\.actor_id,\s*"User"\)/,
      "row.actor_id",
    );
  }
  planted[FILES[0]] = `${planted[FILES[0]]}\n<Button onClick={() => linkUnitQboClass(id, body)}>Link to Existing</Button>`;
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const linkPlanted = { ...srcs, [FILES[0]]: `${srcs[FILES[0]]}\nvoid linkDriverQboVendor(id, body);` };
  if (!assertAll(linkPlanted).some((p) => /QBO link action present/.test(p))) {
    console.error(`${LABEL} SELFTEST FAILED: re-added QBO link action not caught`);
    process.exit(1);
  }
  const leftoverPlanted = { ...srcs };
  leftoverPlanted[FILES[2]] = `${srcs[FILES[2]]}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  const leftoverProblems = assertAll(leftoverPlanted);
  if (!leftoverProblems.includes("leftover text-[11px]") || !leftoverProblems.includes("leftover off-scale muted")) {
    console.error(`${LABEL} SELFTEST FAILED leftover plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST leftover plant rejected`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
