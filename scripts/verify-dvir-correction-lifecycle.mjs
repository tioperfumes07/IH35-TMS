#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  shared: "packages/shared-types/src/dvir.ts",
  submit: "apps/backend/src/safety/dvir-submit.service.ts",
  driverRoute: "apps/backend/src/driver/dvir.routes.ts",
  officeRoute: "apps/backend/src/safety/dvir.routes.ts",
  pwaApi: "apps/driver-pwa/src/api/dvir.ts",
  pwaPage: "apps/driver-pwa/src/pages/DVIR.tsx",
  officeList: "apps/frontend/src/pages/safety/IdvrPage.tsx",
  officeDetail: "apps/frontend/src/pages/safety/IdvrDetailPage.tsx",
};
const REQUIRED = {
  shared: ["corrects_dvir_id?: string"],
  submit: [
    "corrects_dvir_id: z.string().uuid().optional()",
    "original.operating_company_id = $2::uuid",
    "original.driver_id = $3::uuid",
    "original.load_id = $4::uuid",
    "original.unit_id = $5::uuid",
    'return { error: "correction_source_not_found" }',
    "corrects_dvir_id\n      )",
    "body.corrects_dvir_id ?? null",
  ],
  driverRoute: [
    'z.enum(["pre_trip", "post_trip"]).default("pre_trip")',
    "AND type = $3",
    'result.error === "correction_source_not_found"',
  ],
  officeRoute: [
    "ds.corrects_dvir_id",
    "correction.corrects_dvir_id = ds.id",
    "correction.corrects_dvir_id = $1::uuid",
    "original.id = $1::uuid",
    "corrected_submission: correctedRes.rows[0] ?? null",
  ],
  pwaApi: ["getLatestDvir", "error instanceof ApiError && error.status === 404"],
  pwaPage: [
    "getLatestDvir(loadId, dvirType)",
    "corrects_dvir_id: correctsDvirId ?? undefined",
    'data-testid="dvir-correct-latest"',
    "setItems(prior.items)",
  ],
  officeList: ['key: "correction_count"', 'label: "Corrections"'],
  officeDetail: [
    'data-testid="idvr-corrects-link"',
    'data-testid="idvr-corrections-history"',
    'kind="dvir"',
  ],
};

function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  }
  return missing;
}
const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) {
      const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
      if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
      mutations += 1;
    }
  }
  console.log(`verify-dvir-correction-lifecycle --selftest PASS ${mutations}/${mutations}`);
  process.exit(0);
}
const missing = verify(sources);
if (missing.length) {
  console.error(`verify-dvir-correction-lifecycle FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-dvir-correction-lifecycle PASS — PWA create, scoped persistence, forward and reverse office drills wired");
