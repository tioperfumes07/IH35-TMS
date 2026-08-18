#!/usr/bin/env node
/**
 * LV-LISTS-USMCA-QBO-SYNC-HEALTH — Lists hub QBO Sync Health + Force QBO Sync
 * must mount only when selected company code is TRANSP (customers #8698 / vendors #8711 twin).
 *
 * Self-test: node scripts/verify-lists-hub-qbo-sync-transp-only.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/lists/ListsHubPage.tsx";
const LABEL = "verify-lists-hub-qbo-sync-transp-only";

const QBO_CAPABILITY = /qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/;
const HEALTH_ENABLED = /enabled:\s*Boolean\(companyId\s*&&\s*qboAvailable\)/;
const CARD_GATE =
  /qboAvailable\s*\?\s*\(\s*<QboSyncHealthCard[\s\S]*?\/>\s*\)\s*:\s*null/;

export function audit(src) {
  const failures = [];
  if (!QBO_CAPABILITY.test(src)) {
    failures.push(`${FILE}: QBO capability must derive from selectedCompany.code === "TRANSP"`);
  }
  if (!HEALTH_ENABLED.test(src)) {
    failures.push(`${FILE}: qbo-sync-health query must enable only when companyId && qboAvailable`);
  }
  if (!CARD_GATE.test(src)) {
    failures.push(`${FILE}: QboSyncHealthCard (Force QBO Sync) must mount only when qboAvailable`);
  }
  if (/<QboSyncHealthCard[\s\S]*?\/>/.test(src) && !CARD_GATE.test(src)) {
    failures.push(`${FILE}: unconditional QboSyncHealthCard mount is forbidden`);
  }
  return failures;
}

function loadSrc(root) {
  return fs.readFileSync(path.join(root, FILE), "utf8");
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["qbo-capability", QBO_CAPABILITY, "qboAvailable = true"],
    ["health-enabled", HEALTH_ENABLED, "enabled: Boolean(companyId)"],
    [
      "card-gate",
      CARD_GATE,
      "<QboSyncHealthCard rows={health} onForceSync={() => forceSyncMutation.mutate()} syncing={forceSyncMutation.isPending} />",
    ],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = good.replace(pattern, replacement);
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Lists hub QBO Sync Health is TRANSP-gated`);
process.exit(0);
