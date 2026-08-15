#!/usr/bin/env node
/**
 * SYS-F3564 — SystemModulePage phases / service-checks / recent-merged lists must use
 * ParityTable (Search+Range+gear), not raw HTML tables that skip the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/system/SystemModulePage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "SystemModulePage: must use ParityTable");
  assert(src.includes('storageKey="system-program-phases"'), "SystemModulePage: phases storageKey");
  assert(src.includes('storageKey="system-service-checks"'), "SystemModulePage: service-checks storageKey");
  assert(src.includes('storageKey="system-recent-merged-prs"'), "SystemModulePage: recent-merged storageKey");
  assert(src.includes('storageKey="system-qbo-reconciled-objects"'), "SystemModulePage: keep recon ParityTable");
  assert(!/<table\b/.test(src), "SystemModulePage: must not use raw HTML table");
  assert(src.includes("SYSTEM_TABS"), "SystemModulePage: keep SYSTEM_TABS contract");
  assert(src.includes("getProgramTracker"), "SystemModulePage: keep program tracker API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function SystemModulePage() {",
    '  return <table className="w-full" data-testid="system-program-phases-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-system-module-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-system-module-parity-surface-bar PASS");
}
