#!/usr/bin/env node
/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 1 — load_id reverse-drill filter + Load Detail reverse
 * panel + nested driver create on Claim Create (no migrations, no GL posting).
 *
 * Static guards:
 *   1. listClaimsQuerySchema + GET /insurance/claims accept an optional load_id filter
 *      (mirrors the existing driver_id / unit_id reverse-drill pattern).
 *   2. Frontend insurance API client (insuranceClaimsApi.list + listInsuranceClaims) exposes
 *      load_id so callers can pass it type-safely.
 *   3. InsuranceClaimsReverseSection's Filter union accepts load_id (Load Detail reverse drill).
 *   4. LoadDetailDrawer mounts InsuranceClaimsReverseSection filtered by load_id — Law §9 total
 *      connectivity requires the load side of the claim ↔ load FK to drill through too, not only
 *      the claim → load forward link already on ClaimsTab.
 *   5. ClaimCreateModal's driver field is a nested-create picker (Combobox + CreateDriverModal,
 *      Blueprint 4.2.2.1 canonical creator) — never a bare <select> with no +Create when the gold
 *      pattern exists (Rule 21). The nested modal must stack with shell="drawer" (CHROME-11)
 *      because ClaimCreateModal itself renders inside a ParityDrawer.
 *
 * Self-test: node scripts/verify-claim-load-reverse-and-driver-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-load-reverse-and-driver-create";

/**
 * @param {{
 *   claimShared: string,
 *   claimRoutes: string,
 *   insuranceApi: string,
 *   reverseSection: string,
 *   loadDetailDrawer: string,
 *   claimCreate: string,
 * }} sources
 * @returns {string[]}
 */
export function computeFailures(sources) {
  const errors = [];
  const { claimShared, claimRoutes, insuranceApi, reverseSection, loadDetailDrawer, claimCreate } = sources;

  // 1) Backend list filter
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts listClaimsQuerySchema must accept optional load_id");
  }
  if (!/parsed\.data\.load_id/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must filter by parsed.data.load_id");
  }
  if (!/\.replace\(\/\^load_id\/,\s*["']c\.load_id["']\)/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must scope load_id to c.load_id (tenant-scoped column, not a bare identifier)");
  }

  // 2) Frontend API client
  if (!/list\([\s\S]{0,400}?load_id\?:\s*string/.test(insuranceApi)) {
    errors.push("api/insurance.ts insuranceClaimsApi.list params must accept load_id?: string");
  }
  if (!/function listInsuranceClaims\([\s\S]{0,300}?load_id\?:\s*string/.test(insuranceApi)) {
    errors.push("api/insurance.ts listInsuranceClaims params must accept load_id?: string");
  }

  // 3) Reverse-section Filter union
  if (!/\{\s*load_id:\s*string;[\s\S]{0,40}?\}/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection Filter union must accept { load_id: string }");
  }

  // 4) Load Detail mounts the reverse panel
  if (!/InsuranceClaimsReverseSection/.test(loadDetailDrawer)) {
    errors.push("LoadDetailDrawer must mount InsuranceClaimsReverseSection (Law §9 load-side reverse drill)");
  }
  if (!/filter=\{\{\s*load_id:\s*load\.id\s*\}\}/.test(loadDetailDrawer)) {
    errors.push("LoadDetailDrawer claims reverse must filter by load_id: load.id");
  }

  // 5) ClaimCreateModal driver picker is the canonical nested-create pattern, not a bare <select>
  if (!/import\s*\{\s*CreateDriverModal\s*\}\s*from\s*["']\.\.\/drivers\/CreateDriverModal["']/.test(claimCreate)) {
    errors.push("ClaimCreateModal must import the canonical CreateDriverModal (Blueprint 4.2.2.1)");
  }
  if (!/<CreateDriverModal[\s\S]{0,300}?shell="drawer"/.test(claimCreate)) {
    errors.push('ClaimCreateModal must render <CreateDriverModal> with shell="drawer" — it nests inside the Claim create ParityDrawer (CHROME-11)');
  }
  if (!/allowAddNew=\{\{\s*label:\s*["']\+ Create driver["']/.test(claimCreate)) {
    errors.push('ClaimCreateModal driver field must expose a "+ Create driver" allowAddNew row (Combobox nested-create pattern)');
  }
  // Regression guard: the driver field must no longer be a bare <select> bound to form.driver_id.
  if (/<select[\s\S]{0,200}?value=\{form\.driver_id\}/.test(claimCreate)) {
    errors.push("ClaimCreateModal driver field regressed to a bare <select> — must use the Combobox + CreateDriverModal nested-create pattern");
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function goodFixture() {
  return {
    claimShared: `
      load_id: z.string().uuid().optional(),
    `,
    claimRoutes: `
      if (PARSED_DATA_LOAD_ID_MARKER) {
        values.push(PARSED_DATA_LOAD_ID_MARKER);
        filters.push(\`load_id = $\${values.length}::uuid\`);
      }
      const scopedFilters = filters.map((f) =>
        f.replace(/^load_id/, "c.load_id"),
      );
    `.replaceAll("PARSED_DATA_LOAD_ID_MARKER", "parsed.data.load_id"),
    insuranceApi: `
      list(params: {
        operating_company_id: string;
        LIST_LOAD_ID_MARKER
      }) {}
      export function listInsuranceClaims(params: {
        operating_company_id: string;
        FN_LOAD_ID_MARKER
      }) {}
    `
      .replace("LIST_LOAD_ID_MARKER", "load_id?: string;")
      .replace("FN_LOAD_ID_MARKER", "load_id?: string;"),
    reverseSection: `
      type Filter =
        | { driver_id: string; unit_id?: never; load_id?: never }
        | { load_id: string; driver_id?: never; unit_id?: never };
    `,
    loadDetailDrawer: `
      import { INSURANCE_CLAIMS_REVERSE_SECTION_MARKER } from "../insurance/InsuranceClaimsReverseSection";
      <INSURANCE_CLAIMS_REVERSE_SECTION_MARKER filter={{ load_id: load.id }} />
    `.replaceAll("INSURANCE_CLAIMS_REVERSE_SECTION_MARKER", "InsuranceClaimsReverseSection"),
    claimCreate: `
      import { CreateDriverModal } from "../drivers/CreateDriverModal";
      <Combobox allowAddNew={{ label: "+ Create driver", onAdd: () => setDriverCreateOpen(true) }} />
      <CreateDriverModal open={driverCreateOpen} shell="drawer" />
    `,
  };
}

function selftest() {
  const good = goodFixture();
  const goodFails = computeFailures(good);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} selftest FAIL: good fixture rejected:`, goodFails);
    process.exit(1);
  }

  const cases = [
    ["claimShared", (f) => { f.claimShared = ""; }, "listClaimsQuerySchema must accept optional load_id"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replaceAll("parsed.data.load_id", "parsed.data.nope"); }, "GET list must filter by parsed.data.load_id"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace('"c.load_id"', '"load_id"'); }, "scope load_id to c.load_id"],
    ["insuranceApi", (f) => { f.insuranceApi = f.insuranceApi.replace(/(export function listInsuranceClaims\(params: \{[\s\S]*?)load_id\?: string;/, "$1"); }, "listInsuranceClaims params must accept load_id"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace("load_id: string", "loadId: string"); }, "Filter union must accept { load_id: string }"],
    ["loadDetailDrawer", (f) => { f.loadDetailDrawer = f.loadDetailDrawer.replaceAll("InsuranceClaimsReverseSection", "SomethingElse"); }, "must mount InsuranceClaimsReverseSection"],
    ["loadDetailDrawer", (f) => { f.loadDetailDrawer = f.loadDetailDrawer.replace("load_id: load.id", "unit_id: load.id"); }, "must filter by load_id: load.id"],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace('shell="drawer"', ""); }, 'shell="drawer"'],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace("+ Create driver", "+ Add driver"); }, '"+ Create driver" allowAddNew row'],
    ["claimCreate", (f) => { f.claimCreate += `\n<select value={form.driver_id} />`; }, "regressed to a bare <select>"],
  ];

  const problems = [];
  for (const [key, mutate, expectFragment] of cases) {
    const fixture = goodFixture();
    mutate(fixture);
    const failures = computeFailures(fixture);
    if (!failures.some((msg) => msg.includes(expectFragment))) {
      problems.push(`planted regression in ${key} ("${expectFragment}") was NOT caught`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`✓ ${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = {
    claimShared: read("apps/backend/src/insurance/claim.shared.ts"),
    claimRoutes: read("apps/backend/src/insurance/claim.routes.ts"),
    insuranceApi: read("apps/frontend/src/api/insurance.ts"),
    reverseSection: read("apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx"),
    loadDetailDrawer: read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
    claimCreate: read("apps/frontend/src/components/insurance/ClaimCreateModal.tsx"),
  };

  const failures = computeFailures(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: claim ↔ load reverse filter + Load Detail reverse panel + nested driver create wired.`);
}

main();
