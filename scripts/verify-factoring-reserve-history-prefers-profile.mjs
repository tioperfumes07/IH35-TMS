#!/usr/bin/env node
/**
 * verify-factoring-reserve-history-prefers-profile — ROUND 8.20 board18.
 * Shared reserves panel must prefer active_factor_profile_id for getReserveBalanceHistory
 * (vendor id only as fallback) so history is not falsely empty on vendor/profile mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-reserve-history-prefers-profile";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/components/factoring/FactoringReservesSharedPanel.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("FactoringReservesSharedPanel.tsx missing");
    return f;
  }
  if (!/function reserveHistoryFactorId/.test(src) && !/export function reserveHistoryFactorId/.test(src)) {
    f.push("reserveHistoryFactorId helper missing");
  }
  if (!/active_factor_profile_id/.test(src)) {
    f.push("panel does not read active_factor_profile_id");
  }
  // Must not take vendor id alone as the primary assignment for history.
  if (/const activeFactorId = summaryQuery\.data\?\.active_factor_id\s*\?\?\s*null/.test(src)) {
    f.push("activeFactorId still prefers vendor-only (active_factor_id ?? null)");
  }
  if (!/reserveHistoryFactorId\(summaryQuery\.data\)/.test(src)) {
    f.push("history query does not use reserveHistoryFactorId(summary)");
  }
  // Profile before vendor inside the helper.
  const helper = src.match(/export function reserveHistoryFactorId[\s\S]*?\n\}/);
  if (helper) {
    const body = helper[0];
    const profileIdx = body.indexOf("active_factor_profile_id");
    const vendorIdx = body.indexOf("active_factor_id");
    if (profileIdx < 0 || vendorIdx < 0 || profileIdx > vendorIdx) {
      f.push("helper does not prefer profile before vendor");
    }
  }
  return f;
}

function selftest(live) {
  const cases = [
    ["vendor-only primary", live.replace(/reserveHistoryFactorId\(summaryQuery\.data\)/, "summaryQuery.data?.active_factor_id ?? null").replace(/export function reserveHistoryFactorId[\s\S]*?\n\}/, "")],
    ["no profile read", live.replace(/active_factor_profile_id/g, "x_profile")],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — reserve history prefers factor profile id`);
}
