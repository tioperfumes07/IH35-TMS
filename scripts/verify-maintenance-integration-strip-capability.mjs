#!/usr/bin/env node
/** Ratchet: Maintenance QBO status/polling exists only for canonical TRANSP capability. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/components/IntegrationsStrip.tsx";

function verify(source) {
  const failures = [];
  if (!source.includes("selectedCompanyId, selectedCompany")) failures.push("strip does not read canonical selected company");
  if (!source.includes('selectedCompany?.code?.trim().toUpperCase() === "TRANSP"')) failures.push("QBO capability is not derived from TRANSP code");
  if (!/queryKey: \["integrations", "qbo", "status", companyId\][\s\S]*?enabled: Boolean\(companyId && qboCapable\)/.test(source)) failures.push("QBO status query still runs outside capability");
  const qboRenderCount = (source.match(/\{qboCapable \? \(/g) ?? []).length;
  if (qboRenderCount < 2) failures.push("QBO status and pending-sync chrome are not both capability-gated");
  if (!source.includes("{pendingQboCount} pending QBO sync")) failures.push("TRANSP pending-sync behavior was removed");
  if (!source.includes("getSamsaraHealth(companyId)")) failures.push("Samsara behavior was removed");
  if (!source.includes("getRelayHealth(companyId)")) failures.push("Relay behavior was removed");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`FAIL verify-maintenance-integration-strip-capability:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('selectedCompany?.code?.trim().toUpperCase() === "TRANSP"', "Boolean(companyId)"),
    source.replace("enabled: Boolean(companyId && qboCapable)", "enabled: Boolean(companyId)"),
    source.replace("{qboCapable ? (", "{true ? ("),
    source.replace("getSamsaraHealth(companyId)", "Promise.resolve(null)"),
    source.replace("getRelayHealth(companyId)", "Promise.resolve(null)"),
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`FAIL verify-maintenance-integration-strip-capability selftest: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`PASS verify-maintenance-integration-strip-capability selftest: ${caught}/${mutations.length} planted defects caught`);
} else {
  console.log("PASS verify-maintenance-integration-strip-capability");
}
