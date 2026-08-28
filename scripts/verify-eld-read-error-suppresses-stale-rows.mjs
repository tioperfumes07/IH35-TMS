#!/usr/bin/env node
import fs from "node:fs";

const files = {
  live: fs.readFileSync("apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx", "utf8"),
  violations: fs.readFileSync("apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx", "utf8"),
  unidentified: fs.readFileSync("apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx", "utf8"),
};

function verify(source) {
  const failures = [];
  if (!source.live.includes("const rows = query.isError ? [] : query.data?.drivers ?? []")) failures.push("Live Duty stale rows remain mounted on error");
  if (!source.live.includes("const counts = query.isError ? null : query.data?.counts")) failures.push("Live Duty stale KPIs remain mounted on error");
  if (!source.violations.includes("query.isError ? [] : query.data?.hos_violations ?? []")) failures.push("Violations stale rows remain mounted on error");
  if (!source.violations.includes("[query.data?.hos_violations, query.isError]")) failures.push("Violations memo does not react to error transitions");
  if (!source.unidentified.includes("const rows = query.isError ? [] : query.data?.rows ?? []")) failures.push("Unidentified Driving stale alerts remain mounted on error");
  for (const [name, text] of Object.entries(source)) {
    if (!text.includes("query.isError")) failures.push(`${name} error state missing`);
    if (!text.includes("query.refetch()")) failures.push(`${name} retry binding missing`);
  }
  return failures;
}

const failures = verify(files);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, live: files.live.replace("const rows = query.isError ? [] :", "const rows =") },
    { ...files, live: files.live.replace("const counts = query.isError ? null :", "const counts =") },
    { ...files, violations: files.violations.replace("query.isError ? [] : query.data?.hos_violations ?? []", "query.data?.hos_violations ?? []") },
    { ...files, unidentified: files.unidentified.replace("const rows = query.isError ? [] :", "const rows =") },
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) { console.error(`selftest caught ${caught}/${mutations.length}`); process.exit(1); }
  console.log(`PASS selftest: ${caught}/${mutations.length} planted regressions caught`);
} else {
  console.log("PASS: all 3 ELD reads suppress stale rows/KPIs on failure and retain Retry");
}
