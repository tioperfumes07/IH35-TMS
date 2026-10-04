#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  aggregate: "apps/backend/src/mdata/driver-aggregate.service.ts",
  hosSection: "apps/frontend/src/components/driver-profile/HOSStatusSection.tsx",
  page: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  driverPortal: "apps/frontend/src/pages/driver/DriverHosPage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));

function leftoverProblems(s = source) {
  const problems = [];
  if (s.driverPortal.includes("text-[11px]")) problems.push("leftover text-[11px]");
  if (s.driverPortal.includes("#8A92AB") || s.driverPortal.includes("#334155")) problems.push("leftover off-scale muted");
  // BANK-F91346 leftover refuse — HOSStatusSection page-scoped text token ratchet
  if (s.hosSection.includes("text-[11px]")) problems.push("HOSStatusSection.tsx: leftover text-[11px]");
  if (s.hosSection.includes("#8A92AB")) problems.push("HOSStatusSection.tsx: leftover off-scale muted #8A92AB");
  return problems;
}

function failures(s = source) {
  return [
    ["canonical HOS producer", s.aggregate.includes("getCurrentClocks") && s.aggregate.includes("hos.duty_status_events")],
    ["no hardcoded clocks", !s.hosSection.includes("drive_remaining_min: 660") && !s.hosSection.includes("hardcoded")],
    ["periodic HOS refresh", s.page.includes("refetchInterval: 30_000") && s.page.includes("HOSStatusSection")],
    ["failed refresh retry", /hosQ\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void hosQ\.refetch\(\)\}/.test(s.page)],
    ["driver portal HOS failure retry", /q\.isError[\s\S]{0,360}title="Couldn't load HOS status"[\s\S]{0,360}q\.refetch\(\)[\s\S]{0,260}if \(!q\.data\)/.test(s.driverPortal)],
  ].filter(([, ok]) => !ok).map(([name]) => name).concat(leftoverProblems(s));
}

if (process.argv.includes("--selftest")) {
  if (failures().length) throw new Error(`baseline failed: ${failures().join("; ")}`);
  const mutations = [
    ["aggregate", "getCurrentClocks", "getFakeClocks"],
    ["hosSection", "function fmtMin", "const hardcoded = true;\nfunction fmtMin"],
    ["page", "refetchInterval: 30_000", "refetchInterval: false"],
    ["page", "onRetry={() => void hosQ.refetch()}", "onRetry={() => undefined}"],
    ["driverPortal", "onRetry={() => void q.refetch()}", "onRetry={() => undefined}"],
  ];
  for (const [key, before, after] of mutations) {
    const mutated = { ...source, [key]: source[key].replaceAll(before, after) };
    if (mutated[key] === source[key] || failures(mutated).length === 0) throw new Error(`mutation escaped: ${key}:${before}`);
  }
  const leftoverPlanted = {
    ...source,
    driverPortal: `${source.driverPortal}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`,
  };
  const leftoverFails = leftoverProblems(leftoverPlanted);
  if (!leftoverFails.includes("leftover text-[11px]") || !leftoverFails.includes("leftover off-scale muted")) {
    throw new Error("leftover plant escaped");
  }
  // BANK-F91346 leftover plant — HOSStatusSection
  const hosPlanted = {
    ...source,
    hosSection: `${source.hosSection}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`,
  };
  if (!leftoverProblems(hosPlanted).some((p) => p.includes("HOSStatusSection.tsx: leftover text-[11px]"))) {
    throw new Error("HOSStatusSection leftover plant escaped");
  }
  console.log("verify:driver-profile-hos-source SELFTEST PASS — 5/5 producer/refresh/error mutations red + leftover plant rejected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify:driver-profile-hos-source FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify:driver-profile-hos-source PASS — canonical HOS source + honest retryable refresh");
