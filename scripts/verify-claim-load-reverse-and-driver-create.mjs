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
  if (!/withCompanyScope\(user\.uuid,\s*parsed\.data\.operating_company_id/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must execute inside the selected operating company scope");
  }
  if (!/values(?:\s*:\s*unknown\[\])?\s*=\s*\[parsed\.data\.operating_company_id\]/.test(claimRoutes) ||
      !/filters\s*=\s*\[\s*["'`]tenant_id = \$1::uuid["'`]\s*\]/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must seed the query with the selected operating company predicate");
  }
  if (!/if\s*\(parsed\.data\.load_id\)\s*\{[\s\S]{0,180}?values\.push\(parsed\.data\.load_id\)[\s\S]{0,180}?filters\.push\(`load_id = \$\$\{values\.length\}::uuid`\)/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must bind load_id as a UUID query parameter");
  }
  if (!/\.replace\(\/\^load_id\/,\s*["']c\.load_id["']\)/.test(claimRoutes)) {
    errors.push("claim.routes.ts GET list must scope load_id to c.load_id (tenant-scoped column, not a bare identifier)");
  }
  if (!/LEFT JOIN mdata\.loads cload[\s\S]{0,120}?cload\.id = c\.load_id[\s\S]{0,120}?cload\.operating_company_id = \$\{scope\}/.test(claimRoutes)) {
    errors.push("claim.routes.ts claim rows must resolve load labels through a same-company mdata.loads join");
  }

  // 2) Frontend API client
  if (!/list\([\s\S]{0,400}?load_id\?:\s*string/.test(insuranceApi)) {
    errors.push("api/insurance.ts insuranceClaimsApi.list params must accept load_id?: string");
  }
  if (!/function listInsuranceClaims\([\s\S]{0,300}?load_id\?:\s*string/.test(insuranceApi)) {
    errors.push("api/insurance.ts listInsuranceClaims params must accept load_id?: string");
  }
  if (!/return insuranceClaimsApi\.list\(params\)/.test(insuranceApi)) {
    errors.push("api/insurance.ts listInsuranceClaims must forward the typed load filter to insuranceClaimsApi.list");
  }

  // 3) Reverse-section Filter union. Window is generous (not just load_id's own union member) because
  // WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 legitimately adds a 4th trailer_id member to the same union
  // type, lengthening every member's "never" companion list — this checks the union TYPE still accepts
  // load_id, not the exact byte distance to the type's closing brace.
  if (!/type Filter =[\s\S]{0,600}?\{\s*load_id:\s*string;[\s\S]{0,120}?\}/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection Filter union must accept { load_id: string }");
  }
  if (!/queryKey:\s*\["insurance-claims",\s*"reverse",\s*operatingCompanyId,\s*filter\]/.test(reverseSection) ||
      !/insuranceClaimsApi\.list\(\{\s*operating_company_id:\s*operatingCompanyId,\s*\.\.\.filter,?\s*\}\)/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection query identity and GET must include company plus the exact reverse filter");
  }
  if (!/enabled:\s*canView\s*&&\s*Boolean\(operatingCompanyId\)\s*&&\s*Boolean\(Object\.values\(filter\)\[0\]\)/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection must not issue an unscoped or empty-id reverse read");
  }
  if (!/["']load_id["'] in filter[\s\S]{0,100}?["']insurance_claims_load["']/.test(reverseSection) ||
      !/const openId = String\(Object\.values\(filter\)\[0\] \?\? ["']["']\)/.test(reverseSection) ||
      !/<EntityLink kind=\{openKind\} id=\{openId\}/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection must drill from the exact load filter into the scoped claims route");
  }
  if (!/claims\.map\(\(claim\) => \([\s\S]{0,240}?<li key=\{claim\.id\}[\s\S]{0,240}?kind=["']claim["'][\s\S]{0,120}?id=\{claim\.id\}[\s\S]{0,160}?entityLabel\(claim\.claim_number, claim\.id, ["']Claim["']\)/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection must drill each returned claim by canonical id with a human claim-number label");
  }

  // 4) Load Detail mounts the reverse panel
  if (!/InsuranceClaimsReverseSection/.test(loadDetailDrawer)) {
    errors.push("LoadDetailDrawer must mount InsuranceClaimsReverseSection (Law §9 load-side reverse drill)");
  }
  if (!/filter=\{\{\s*load_id:\s*load\.id\s*\}\}/.test(loadDetailDrawer)) {
    errors.push("LoadDetailDrawer claims reverse must filter by load_id: load.id");
  }
  if (!/operatingCompanyId=\{load\.operating_company_id\}[\s\S]{0,160}?filter=\{\{\s*load_id:\s*load\.id\s*\}\}[\s\S]{0,160}?data-testid=["']load-detail-insurance-claims["']/.test(loadDetailDrawer)) {
    errors.push("LoadDetailDrawer must bind the claims reverse panel to the loaded row's company and id");
  }

  // 5) ClaimCreateModal driver picker — nested create via gold pattern (Rule 21 / PLUS-DRIVER-SYSTEM).
  // Prefer DriverPickerWithCreate (composes Combobox + CreateDriverModal). Direct CreateDriverModal
  // + Combobox allowAddNew also OK. Bare <select> is forbidden.
  const hasPickerWithCreate =
    /DriverPickerWithCreate[\s\S]{0,400}?shell="drawer"/.test(claimCreate) &&
    /import\s*\{\s*DriverPickerWithCreate\s*\}\s*from\s*["']\.\.\/drivers\/DriverPickerWithCreate["']/.test(claimCreate);
  const hasInlineCreateDriver =
    /import\s*\{\s*CreateDriverModal\s*\}\s*from\s*["']\.\.\/drivers\/CreateDriverModal["']/.test(claimCreate) &&
    /<CreateDriverModal[\s\S]{0,300}?shell="drawer"/.test(claimCreate) &&
    /allowAddNew=\{\{\s*label:\s*["']\+ Create driver["']/.test(claimCreate);
  if (!hasPickerWithCreate && !hasInlineCreateDriver) {
    errors.push(
      'ClaimCreateModal driver field must use DriverPickerWithCreate shell="drawer" (preferred) or Combobox + CreateDriverModal shell="drawer" — never a bare <select>',
    );
  }
  if (!/DriverPickerWithCreate[\s\S]{0,260}?operatingCompanyId=\{operatingCompanyId\}[\s\S]{0,160}?value=\{form\.driver_id \|\| null\}[\s\S]{0,160}?onChange=\{\(next\) => updateField\(["']driver_id["'], next \?\? ["']["']\)\}/.test(claimCreate)) {
    errors.push("ClaimCreateModal driver picker must read the selected company and write the selected canonical driver id");
  }
  if (/<select[\s\S]{0,200}?value=\{form\.driver_id\}/.test(claimCreate)) {
    errors.push("ClaimCreateModal driver field regressed to a bare <select> — must use nested-create gold pattern");
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = loadSources();
  const goodFails = computeFailures(good);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} selftest FAIL: production sources rejected:`, goodFails);
    process.exit(1);
  }

  const cases = [
    ["claimShared", (f) => { f.claimShared = f.claimShared.replace("load_id: z.string().uuid().optional()", "load_id: z.string().optional()"); }, "listClaimsQuerySchema must accept optional load_id"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("withCompanyScope(user.uuid, parsed.data.operating_company_id", "withCompanyScope(user.uuid, user.operating_company_id"); }, "selected operating company scope"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("const values: unknown[] = [parsed.data.operating_company_id]", "const values: unknown[] = []"); }, "seed the query with the selected operating company"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("values.push(parsed.data.load_id);", "values.push(parsed.data.driver_id);"); }, "bind load_id as a UUID query parameter"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace('.replace(/^load_id/, "c.load_id")', '.replace(/^load_id/, "load_id")'); }, "scope load_id to c.load_id"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("AND cload.operating_company_id = ${scope}", "AND cload.operating_company_id IS NOT NULL"); }, "same-company mdata.loads join"],
    ["insuranceApi", (f) => { f.insuranceApi = f.insuranceApi.replace(/(export function listInsuranceClaims\(params: \{[\s\S]*?)load_id\?: string;/, "$1"); }, "listInsuranceClaims params must accept load_id"],
    ["insuranceApi", (f) => { f.insuranceApi = f.insuranceApi.replace("return insuranceClaimsApi.list(params);", "return insuranceClaimsApi.list({ operating_company_id: params.operating_company_id });"); }, "must forward the typed load filter"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace("| { load_id: string", "| { loadId: string"); }, "Filter union must accept { load_id: string }"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace('queryKey: ["insurance-claims", "reverse", operatingCompanyId, filter]', 'queryKey: ["insurance-claims", "reverse", operatingCompanyId]'); }, "query identity and GET must include company"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace("enabled: canView && Boolean(operatingCompanyId) && Boolean(Object.values(filter)[0])", "enabled: canView"); }, "must not issue an unscoped or empty-id reverse read"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replaceAll('"insurance_claims_load"', '"insurance_claims_unit"'); }, "drill from the exact load filter"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace("id={claim.id}", "id={claim.load_id}"); }, "drill each returned claim by canonical id"],
    ["reverseSection", (f) => { f.reverseSection = f.reverseSection.replace('entityLabel(claim.claim_number, claim.id, "Claim")', 'entityLabel(claim.id, claim.id, "Claim")'); }, "human claim-number label"],
    ["loadDetailDrawer", (f) => { f.loadDetailDrawer = f.loadDetailDrawer.replaceAll("filter={{ load_id: load.id }}", "filter={{ unit_id: load.id }}"); }, "must filter by load_id: load.id"],
    ["loadDetailDrawer", (f) => { f.loadDetailDrawer = f.loadDetailDrawer.replace(/(<InsuranceClaimsReverseSection\s+)operatingCompanyId=\{load\.operating_company_id\}/, "$1operatingCompanyId={operatingCompanyId}"); }, "loaded row's company and id"],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace('shell="drawer"', ""); }, "DriverPickerWithCreate shell=\"drawer\""],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace('onChange={(next) => updateField("driver_id", next ?? "")}', 'onChange={() => {}}'); }, "write the selected canonical driver id"],
    ["claimCreate", (f) => { f.claimCreate += `\n<select value={form.driver_id} />`; }, "regressed to a bare <select>"],
  ];

  const problems = [];
  for (const [key, mutate, expectFragment] of cases) {
    const fixture = { ...good };
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
  console.log(`✓ ${LABEL} --selftest OK — production sources pass; ${cases.length} source-injected regressions all caught`);
}

function loadSources() {
  return {
    claimShared: read("apps/backend/src/insurance/claim.shared.ts"),
    claimRoutes: read("apps/backend/src/insurance/claim.routes.ts"),
    insuranceApi: read("apps/frontend/src/api/insurance.ts"),
    reverseSection: read("apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx"),
    loadDetailDrawer: read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
    claimCreate: read("apps/frontend/src/components/insurance/ClaimCreateModal.tsx"),
  };
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = loadSources();

  const failures = computeFailures(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: claim ↔ load reverse filter + Load Detail reverse panel + nested driver create wired.`);
}

main();
