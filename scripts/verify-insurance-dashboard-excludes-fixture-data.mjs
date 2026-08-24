#!/usr/bin/env node
/** @matrix-built {"modules":["insurance","safety"],"cols":["connectivity"],"leaves":["insurance.summary","insurance.coverage_gaps","insurance.policies","insurance.claims","insurance.lawsuits","fleet.unit_profile.insurance_summary"]} */
/**
 * INSURANCE-DASHBOARD-FIXTURE-LEAK (2026-08-23): live-verified on prod (Neon tiny-field-89581227,
 * USMCA 5c854333-6ea5-4faa-af31-67cb272fef80, bypass_rls('lucia')) that insurance.policy/claim/lawsuit
 * carried ZERO real rows -- 100% of what the /safety/insurance Dashboard reported as TOTAL ACTIVE
 * POLICIES (3), POLICIES EXPIRING IN 30 DAYS (3), OPEN CLAIMS COUNT (4), and OPEN LAWSUITS COUNT (1)
 * were agent-created live-gate-proof / guard-selftest fixture rows (SAMPLE-POL-5743-SIMPLE,
 * SAMPLE-REPROVE-5094-VENDOR-0809, SAMPLE-VENDOR-UX-0809, SAMPLE-CLAIM-V4-0809, CLM-CASCADE-USMCA-01,
 * LIVE-GATE-PROVE-CLAIM-CC2, CODEX-LAWSUIT-NESTED-CLM-20260816-0354, CODEX-LAWSUIT-20260816-0410).
 * Two of the fixture policies are linked via insurance.policy_unit to REAL fleet units T120/T151, so
 * the Coverage Gap KPI and the Fleet Unit Profile "Insurance summary" card also falsely showed those
 * two real trucks as insured -- a false negative masking real risk. See insurance-visibility.ts for
 * the full evidence.
 *
 * This guard proves, by static source assertion, that every query site touching
 * insurance.policy/claim/lawsuit for a dashboard KPI, a list, or a per-unit summary applies the
 * canonical excludeInsuranceFixtureSql() predicate (or, for the coverage-gap unit scan, the existing
 * Fleet excludeDemoPhantomSql/excludeSampleDataSql pair) -- never a private, divergent copy.
 *
 * Self-test: node scripts/verify-insurance-dashboard-excludes-fixture-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  helper: "apps/backend/src/insurance/insurance-visibility.ts",
  summary: "apps/backend/src/insurance/summary.routes.ts",
  coverageGap: "apps/backend/src/insurance/coverage-gap-units.shared.ts",
  policyList: "apps/backend/src/insurance/policy.routes.ts",
  claimList: "apps/backend/src/insurance/claim.routes.ts",
  lawsuitList: "apps/backend/src/insurance/lawsuit.routes.ts",
  unitAggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
};
const LABEL = "verify-insurance-dashboard-excludes-fixture-data";

function countCalls(text, re) {
  return (text.match(new RegExp(re.source, "g")) ?? []).length;
}

export function audit(src) {
  const failures = [];

  // The helper's actual SQL predicate (not just the doc/array) must still catch 'SAMPLE-%' — the one
  // pattern that inflated the live dashboard and that the pre-existing Fleet pattern (SAM-%) does NOT
  // match (no hyphen after SAM). Scope the check to the function body so a doc-comment mention alone
  // cannot satisfy it.
  const fnIdx = src.helper.indexOf("export function excludeInsuranceFixtureSql");
  if (fnIdx === -1) {
    failures.push(`${FILES.helper}: excludeInsuranceFixtureSql() export is missing.`);
  } else if (!/["']SAMPLE-%["']/.test(src.helper.slice(fnIdx))) {
    failures.push(`${FILES.helper}: excludeInsuranceFixtureSql()'s predicate must still exclude 'SAMPLE-%'.`);
  }

  const fixtureRe = (col) => new RegExp(`excludeInsuranceFixtureSql\\(\\s*["']${col.replace(/[.]/g, "\\.")}["']\\s*\\)`);

  // summary.routes.ts — the 4 KPI counts that have no is_sample_data column to fall back on.
  const summaryPolicyCount = countCalls(src.summary, fixtureRe("policy_number"));
  if (summaryPolicyCount < 2) {
    failures.push(
      `${FILES.summary}: expected excludeInsuranceFixtureSql("policy_number") on BOTH active-policy ` +
        `count queries (total_active_policies + policies_expiring_30d), found ${summaryPolicyCount}.`,
    );
  }
  if (!fixtureRe("claim_number").test(src.summary)) {
    failures.push(`${FILES.summary}: open_claims count must apply excludeInsuranceFixtureSql("claim_number").`);
  }
  if (!fixtureRe("case_number").test(src.summary)) {
    failures.push(`${FILES.summary}: open_lawsuits count must apply excludeInsuranceFixtureSql("case_number").`);
  }

  // coverage-gap-units.shared.ts — the shared definition behind BOTH the coverage-gap KPI and its
  // detail drill-down. Must exclude fixture-named policies (mask-prevention) AND fixture/sample units
  // (the same Fleet helpers already used for the roster/KPI parity fix).
  if (!fixtureRe("p.policy_number").test(src.coverageGap)) {
    failures.push(
      `${FILES.coverageGap}: the policy LATERAL join must apply excludeInsuranceFixtureSql("p.policy_number") ` +
        `— a fixture policy must not mask a real unit's real coverage gap.`,
    );
  }
  if (!/excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/.test(src.coverageGap)) {
    failures.push(`${FILES.coverageGap}: unit scan must apply excludeDemoPhantomSql("u.unit_number").`);
  }
  if (!/excludeSampleDataSql\(\s*["']u\.is_sample_data["']\s*\)/.test(src.coverageGap)) {
    failures.push(`${FILES.coverageGap}: unit scan must apply excludeSampleDataSql("u.is_sample_data").`);
  }

  // The 3 list endpoints — must stay in parity with the KPI counts above (a list showing rows its own
  // headline count excludes is the FLEET-KPI-PARITY bug class, already fixed once for Fleet).
  if (!fixtureRe("p.policy_number").test(src.policyList)) {
    failures.push(`${FILES.policyList}: GET /api/v1/insurance/policies must apply excludeInsuranceFixtureSql("p.policy_number").`);
  }
  if (!fixtureRe("c.claim_number").test(src.claimList)) {
    failures.push(`${FILES.claimList}: GET /api/v1/insurance/claims must apply excludeInsuranceFixtureSql("c.claim_number").`);
  }
  if (!fixtureRe("lawsuit.case_number").test(src.lawsuitList)) {
    failures.push(`${FILES.lawsuitList}: GET /api/v1/insurance/lawsuits must apply excludeInsuranceFixtureSql("lawsuit.case_number").`);
  }

  // unit-aggregate.service.ts — the Fleet Unit Profile "Insurance summary" card + its premium lookup.
  const unitAggCount = countCalls(src.unitAggregate, fixtureRe("p.policy_number"));
  if (unitAggCount < 2) {
    failures.push(
      `${FILES.unitAggregate}: expected excludeInsuranceFixtureSql("p.policy_number") on BOTH ` +
        `lookupLinkedPolicies() and lookupPolicyMonthlyPremiumCents(), found ${unitAggCount} — a fixture ` +
        `policy must not show a real truck as insured on its profile page.`,
    );
  }

  return failures;
}

function loadSrc(root) {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = fs.readFileSync(path.join(root, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { key: "helper", from: "NOT ILIKE 'SAMPLE-%' AND ${col} NOT ILIKE 'SAM-%'", to: "NOT ILIKE 'SAM-%'" },
    { key: "helper", from: "export function excludeInsuranceFixtureSql", to: "function excludeInsuranceFixtureSqlRenamed" },
    { key: "summary", from: '\n             AND ${excludeInsuranceFixtureSql("policy_number")}`\n      );\n      const policies_expiring_30d', to: "`\n      );\n      const policies_expiring_30d" },
    { key: "summary", from: '\n             AND ${excludeInsuranceFixtureSql("policy_number")}`\n      );\n      const open_claims', to: "`\n      );\n      const open_claims" },
    { key: "summary", from: '\n             AND ${excludeInsuranceFixtureSql("claim_number")}`', to: "`" },
    { key: "summary", from: '\n             AND ${excludeInsuranceFixtureSql("case_number")}`', to: "`" },
    { key: "coverageGap", from: '\n     AND ${excludeInsuranceFixtureSql("p.policy_number")}', to: "" },
    { key: "coverageGap", from: '\n    AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { key: "coverageGap", from: '\n    AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
    { key: "policyList", from: ', excludeInsuranceFixtureSql("p.policy_number")', to: "" },
    { key: "claimList", from: ', excludeInsuranceFixtureSql("c.claim_number")', to: "" },
    { key: "lawsuitList", from: ', excludeInsuranceFixtureSql("lawsuit.case_number")', to: "" },
    { key: "unitAggregate", from: '\n            AND ${excludeInsuranceFixtureSql("p.policy_number")}\n        `,\n        [operatingCompanyId, unitNumber, policyNumber]', to: "`,\n        [operatingCompanyId, unitNumber, policyNumber]" },
    { key: "unitAggregate", from: '\n            AND ${excludeInsuranceFixtureSql("p.policy_number")}\n          ORDER BY', to: "\n          ORDER BY" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutatedSrc = { ...good, [m.key]: good[m.key].split(m.from).join(m.to) };
    if (mutatedSrc[m.key] === good[m.key]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m)}`);
      process.exit(1);
    }
    if (audit(mutatedSrc).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m)}`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — insurance dashboard KPIs, lists, and the Fleet unit profile insurance card all exclude agent-fixture rows`);
