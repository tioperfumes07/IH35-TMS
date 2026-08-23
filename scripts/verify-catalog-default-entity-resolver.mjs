#!/usr/bin/env node
/**
 * GUARD: per-entity catalog routes resolve the default company canonically, not by lowest UUID.
 *
 * WHY THIS EXISTS (LST-F05, verified 2026-07-24)
 * When operating_company_id is omitted, load-cancellation-reasons and void-cancel-reasons resolved
 * it with an inline `SELECT default … UNION SELECT any accessible … ORDER BY id LIMIT 1`. The UNION
 * put the user's DEFAULT company and every accessible company on equal footing, then took the lowest
 * UUID — LOSING the default. USMCA (5c854333…) sorts below TRANSP (91e0bf0a…), so a param-omitting
 * call to these catalogs hijacked TRANSP's default to USMCA. The canonical resolveOperatingCompanyId
 * already does COALESCE(default, lowest) AND validates membership (403 on a foreign id instead of a
 * silent empty list); items/accounts/classes already use it. This guard keeps these routes on it and
 * bans the inline lowest-UUID fallback from returning.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = [
  "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts",
  "apps/backend/src/catalogs/void-cancel-reasons.routes.ts",
  // Added 2026-07-25: this third named surface still carried the defect while the other two were fixed.
  "apps/backend/src/catalogs/fmcsa.routes.ts",
];
const FMCSA_API = "apps/frontend/src/api/fmcsa.ts";
const FMCSA_MODAL = "apps/frontend/src/components/customers/FMCSAVerificationModal.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const MDATA_API = "apps/frontend/src/api/mdata.ts";
const GUARDED = [...ROUTES, FMCSA_API, FMCSA_MODAL, CUSTOMER_DETAIL, MDATA_API];
// The ONE module allowed to contain the lowest-UUID fallback, because there it is the second arm of an
// explicit COALESCE(default, lowest) — the correct behaviour, not the bug.
const CANONICAL_MODULE = "apps/backend/src/auth/operating-company-scope.ts";
const BACKEND_SRC = "apps/backend/src";
const LABEL = "verify-catalog-default-entity-resolver";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// `SELECT default … UNION SELECT any accessible … ORDER BY id LIMIT 1` — the UNION puts the user's default
// and every accessible company on equal footing, then takes the minimum UUID, so the default is LOST.
const HIJACK = /user_accessible_company_ids\(\)\s*\)?\s*ORDER BY id\s+LIMIT 1/s;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

export function assertCanonicalResolver(sources) {
  const problems = [];
  for (const rel of ROUTES) {
    const src = stripComments(sources?.[rel] ?? read(rel));
    if (!/resolveOperatingCompanyId\(/.test(src)) {
      problems.push(`${rel}: does not use resolveOperatingCompanyId — a per-entity catalog that omits operating_company_id must resolve the caller's DEFAULT, not an ad-hoc fallback.`);
    }
    if (HIJACK.test(src)) {
      problems.push(`${rel}: still contains an inline \`UNION … ORDER BY id LIMIT 1\` default resolver — it picks the lowest accessible UUID and hijacks the user's default (USMCA < TRANSP).`);
    }
  }
  const fmcsaRoute = stripComments(sources?.[ROUTES[2]] ?? read(ROUTES[2]));
  const fmcsaApi = stripComments(sources?.[FMCSA_API] ?? read(FMCSA_API));
  const fmcsaModal = stripComments(sources?.[FMCSA_MODAL] ?? read(FMCSA_MODAL));
  const customerDetail = stripComments(sources?.[CUSTOMER_DETAIL] ?? read(CUSTOMER_DETAIL));
  const mdataApi = stripComments(sources?.[MDATA_API] ?? read(MDATA_API));
  if ((fmcsaRoute.match(/operating_company_id: z\.string\(\)\.uuid\(\),/g) ?? []).length < 3) {
    problems.push(`${ROUTES[2]}: lookup, history, and customer-link contracts must all require operating_company_id.`);
  }
  if (!/FROM catalogs\.fmcsa_lookups[\s\S]{0,160}operating_company_id = \$2::uuid/.test(fmcsaRoute) ||
      !/UPDATE mdata\.customers[\s\S]{0,260}operating_company_id = \$5::uuid/.test(fmcsaRoute)) {
    problems.push(`${ROUTES[2]}: customer FMCSA link must scope both lookup and customer to the selected company.`);
  }
  if (!/lookupFmcsa\(body: \{ type: FmcsaLookupType; value: string; operating_company_id: string \}\)/.test(fmcsaApi) ||
      !/linkFmcsaLookupToCustomer\(customerId: string, lookupId: string, operatingCompanyId: string\)/.test(fmcsaApi) ||
      !/listFmcsaLookups\(operatingCompanyId: string/.test(fmcsaApi)) {
    problems.push(`${FMCSA_API}: lookup, link, and history helpers must require selected operating company.`);
  }
  if (!/lookupFmcsa\(\{ \.\.\.payload, operating_company_id: operatingCompanyId \}\)/.test(fmcsaModal) ||
      !/linkFmcsaLookupToCustomer\(customerId, lookupId, operatingCompanyId\)/.test(fmcsaModal)) {
    problems.push(`${FMCSA_MODAL}: lookup and link writes must forward selected operating company.`);
  }
  if (!/listFmcsaLookups\(operatingCompanyId!, \{ limit: 25 \}\)/.test(customerDetail) ||
      !/operatingCompanyId=\{operatingCompanyId!\}/.test(customerDetail) ||
      !/verifyCustomerFmcsa\(id, operatingCompanyId!\)/.test(customerDetail) ||
      !/verifyCustomerFmcsa\(id: string, operatingCompanyId: string\)/.test(mdataApi)) {
    problems.push(`${CUSTOMER_DETAIL}: history, modal, and forced verify must share selected operating company.`);
  }

  // ── SYSTEMIC SWEEP (added 2026-07-25) ──────────────────────────────────────────────────────────────
  // A three-route allowlist was not enough. The packet named cancel/void/fmcsa; a repo-wide sweep found
  // the SAME hijack in five places — fmcsa.routes.ts plus assets.routes.ts, mdata/units.routes.ts,
  // mdata/equipment.routes.ts and reports/scheduled-report-admin.routes.ts (that last one fed the wrong id
  // into set_config('app.operating_company_id', …), poisoning the GUC for the whole request). Two of them
  // hid behind a LOCAL function called resolveOperatingCompanyId that shadowed the canonical import, so a
  // grep for the canonical name showed call sites and read as already-fixed. Both shapes are now banned
  // everywhere, so copy six cannot land.
  const files = Object.keys(sources ?? {}).filter((f) => f.startsWith(`${BACKEND_SRC}/`));
  for (const f of walk(BACKEND_SRC)) if (!files.includes(f)) files.push(f);

  for (const rel of files) {
    if (rel === CANONICAL_MODULE) continue;
    let src;
    try {
      src = stripComments(sources?.[rel] ?? read(rel));
    } catch {
      continue;
    }
    if (HIJACK.test(src)) {
      problems.push(
        `${rel}: contains the lowest-UUID default resolver (\`… user_accessible_company_ids() … ORDER BY id LIMIT 1\`). Call resolveDefaultOperatingCompanyId() from ${CANONICAL_MODULE} instead — it does COALESCE(default, lowest).`,
      );
    }
    // A local definition shadowing the canonical name is how the fmcsa instance evaded detection.
    if (/(?:async\s+)?function resolveOperatingCompanyId\s*\(/.test(src)) {
      problems.push(
        `${rel}: defines a LOCAL resolveOperatingCompanyId, shadowing the canonical one from ${CANONICAL_MODULE}. Import it; a same-named local copy makes a grep look clean while the defect survives.`,
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(GUARDED.map((r) => [r, read(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) { failures.push(`${name}: inert`); return; }
    const p = assertCanonicalResolver(mutated);
    if (!p.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${p.join(" | ") || "none"})`);
  };
  const [a, b] = ROUTES;
  expectCaught("resolver-removed",
    { ...live, [a]: live[a].replace(/resolveOperatingCompanyId/g, "someOtherResolver") },
    "does not use resolveOperatingCompanyId");
  expectCaught("inline-fallback-returns",
    { ...live, [b]: live[b].replace("const operatingCompanyId = await resolveOperatingCompanyId(",
        "const _x = await client.query(`SELECT c.id FROM org.companies c WHERE c.id IN (SELECT org.user_accessible_company_ids()) ORDER BY id LIMIT 1`);\n      const operatingCompanyId = await resolveOperatingCompanyId(") },
    "inline `UNION");
  // New systemic assertions (2026-07-25): both shapes that let five copies survive.
  const SHADOW_FILE = "apps/backend/src/catalogs/fmcsa.routes.ts";
  expectCaught("hijack-reintroduced-anywhere",
    { ...live, [SHADOW_FILE]: live[SHADOW_FILE] + "\nconst _q = `SELECT c.id FROM org.companies c WHERE c.id IN (SELECT org.user_accessible_company_ids()) ORDER BY id LIMIT 1`;\n" },
    "contains the lowest-UUID default resolver");
  expectCaught("local-shadow-reintroduced",
    { ...live, [SHADOW_FILE]: live[SHADOW_FILE] + "\nasync function resolveOperatingCompanyId(a, b) { return null; }\n" },
    "defines a LOCAL resolveOperatingCompanyId");
  expectCaught("fmcsa-link-lookup-scope-removed",
    { ...live, [SHADOW_FILE]: live[SHADOW_FILE].replace("AND operating_company_id = $2::uuid", "AND TRUE") },
    "scope both lookup and customer");
  expectCaught("fmcsa-history-company-removed",
    { ...live, [CUSTOMER_DETAIL]: live[CUSTOMER_DETAIL].replace("listFmcsaLookups(operatingCompanyId!, { limit: 25 })", "listFmcsaLookups({ limit: 25 })") },
    "history, modal, and forced verify");
  expectCaught("fmcsa-modal-link-company-removed",
    { ...live, [FMCSA_MODAL]: live[FMCSA_MODAL].replace("linkFmcsaLookupToCustomer(customerId, lookupId, operatingCompanyId)", "linkFmcsaLookupToCustomer(customerId, lookupId)") },
    "lookup and link writes");

  const liveProblems = assertCanonicalResolver(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) { console.error(`${LABEL} SELFTEST FAILED:`); for (const f of failures) console.error(`  ${f}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 7 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCanonicalResolver();
if (problems.length) { console.error(`${LABEL} FAILED:`); for (const p of problems) console.error(`  ${p}`); process.exit(1); }
console.log(`${LABEL} OK — cancellation-reason catalogs resolve the default company via resolveOperatingCompanyId; no lowest-UUID hijack.`);
