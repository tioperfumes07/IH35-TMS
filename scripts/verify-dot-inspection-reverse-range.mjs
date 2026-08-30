#!/usr/bin/env node
import fs from "node:fs";

const files = {
  api: "apps/frontend/src/api/safety.ts",
  driver: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  asset: "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
};
const s = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));
const checks = [
  ["client range", () => /getDotInspections\(companyId: string, params: \{ driver_id\?: string; unit_id\?: string; trailer_id\?: string; limit\?: number; offset\?: number \}/.test(s.api) && /dot_inspections: Array<Record<string, unknown>>; total_count: number/.test(s.api)],
  ["driver range", () => /offset: \(inspectionPage - 1\) \* inspectionPageSize/.test(s.driver)],
  ["driver exact total", () => /dotInspectionTotal[\s\S]*count=\{dotInspectionTotal\}/.test(s.driver)],
  ["driver reset", () => /useEffect\(\(\) => \{[\s\S]*?setInspectionPage\(1\);[\s\S]*?\}, \[operatingCompanyId, driverId\]\);/.test(s.driver)],
  ["driver pager", () => /driver-safety-reverse-dot-inspections-pager/.test(s.driver)],
  ["asset range", () => /offset: \(inspectionPage - 1\) \* inspectionPageSize/.test(s.asset)],
  ["asset exact total", () => /inspectionTotal[\s\S]*count=\{inspectionTotal\}/.test(s.asset)],
  ["asset reset", () => /useEffect\(\(\) => \{[\s\S]*?setInspectionPage\(1\);[\s\S]*?\}, \[operatingCompanyId, assetKind, assetId\]\);/.test(s.asset)],
  ["asset pager", () => /asset-safety-reverse-dot-inspections-pager/.test(s.asset)],
];
const failed = () => checks.filter(([, fn]) => !fn()).map(([name]) => name);
if (failed().length) { console.error(`FAIL verify-dot-inspection-reverse-range: ${failed().join("; ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const original = structuredClone(s);
  const mutations = [
    ["api", "getDotInspections(companyId: string, params: { driver_id?: string; unit_id?: string; trailer_id?: string; limit?: number; offset?: number }", "getDotInspections(companyId: string, params: { driver_id?: string; unit_id?: string; trailer_id?: string }"],
    ["driver", "offset: (inspectionPage - 1) * inspectionPageSize", "offset: 0"],
    ["driver", "count={dotInspectionTotal}", "count={dotInspections.length}"],
    ["driver", "}, [operatingCompanyId, driverId]);", "}, []);"],
    ["driver", "driver-safety-reverse-dot-inspections-pager", "driver-dot-summary"],
    ["asset", "offset: (inspectionPage - 1) * inspectionPageSize", "offset: 0"],
    ["asset", "count={inspectionTotal}", "count={inspections.length}"],
    ["asset", "}, [operatingCompanyId, assetKind, assetId]);", "}, []);"],
    ["asset", "asset-safety-reverse-dot-inspections-pager", "asset-dot-summary"],
  ];
  for (const [key, needle, replacement] of mutations) {
    s[key] = original[key].replace(needle, replacement);
    if (!failed().length) { console.error(`FAIL selftest: mutation survived (${key}:${needle})`); process.exit(1); }
    s[key] = original[key];
  }
  console.log(`PASS verify-dot-inspection-reverse-range --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else console.log(`PASS verify-dot-inspection-reverse-range (${checks.length}/${checks.length} checks)`);
