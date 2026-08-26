#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["damage_reports.list"],"task":"CLASS-F6536-SAFETY-DAMAGE-EVIDENCE-RECORD-LIFECYCLE","vertical":"class-sweep"}
 * Damage evidence selection/viewer state must belong to the exact report and
 * operating company whose scoped photos query is rendered.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx";

function inspect(source) {
  const errors = [];
  if (!source.includes("useEffect")) errors.push("record/company lifecycle effect missing");
  if (!/useEffect\(\(\) => \{[\s\S]*setViewerOpen\(false\);[\s\S]*setSelected\(null\);[\s\S]*\}, \[damageUuid, operatingCompanyId\]\)/.test(source)) {
    errors.push("viewer and selected custody evidence do not reset on report/company transition");
  }
  if (!/queryKey: \["damage-report-photos", damageUuid, operatingCompanyId\]/.test(source)) {
    errors.push("photo read is not keyed by report and company");
  }
  if (!source.includes("enabled: Boolean(damageUuid && operatingCompanyId)")) errors.push("photo read can run without complete scope");
  if (!source.includes("<EvidenceChainAudit events={selected.custody_events}")) errors.push("selected evidence no longer drives custody chain");
  if (!source.includes("<PhotoEvidenceViewer") || !source.includes("sha256={selected?.sha256_hash}")) errors.push("viewer no longer uses selected evidence");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("setViewerOpen(false);", "// planted: viewer remains open"),
    source.replace("setSelected(null);", "// planted: prior evidence remains selected"),
    source.replace("[damageUuid, operatingCompanyId]", "[damageUuid]"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-safety-damage-evidence-record-lifecycle SELFTEST FAIL — ${missed.length}/3 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-damage-evidence-record-lifecycle selftest PASS — 3/3 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-safety-damage-evidence-record-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-damage-evidence-record-lifecycle PASS — viewer/custody state is record- and company-local");
