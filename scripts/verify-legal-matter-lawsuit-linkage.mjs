#!/usr/bin/env node
/** @matrix-built {"modules":["insurance","legal","drivers","fleet"],"cols":["driver","unit","connectivity","reverse_link"],"task":"INSURANCE-LAWSUIT-CLAIM-IDENTITY","leafRe":"lawsuits\\.(list|create)|insurance\\.modal\\.lawsuit_create"} */
/**
 * Law §9 reverse drill-through — Legal matter → insurance lawsuit → back to lawsuit row.
 *
 * `legal.matters.insurance_lawsuit_id` has had a schema FK + create/edit pickers since
 * PR #3175 / phase4-crossmodule-fks, but LegalMatterDetailPage rendered it as a bare
 * <Link to="/insurance/lawsuits"> with no id — a dead-end (list-only, no row
 * selected). This guard proves the fix stays wired:
 *
 *   1. EntityLink declares a "lawsuit" kind resolving to
 *      /legal/lawsuits?insurance_lawsuit_id=${id} (never a bare list route).
 *   2. LegalMatterDetailPage renders insurance_lawsuit_id via <EntityLink kind="lawsuit" .../>,
 *      not a bare <Link to="/insurance/lawsuits">.
 *   3. LEAD 443.334: /legal/lawsuits is the legal-matters board locked to type "lawsuit"
 *      (LegalLawsuitsPage mounts <LegalMattersListPage fixedType="lawsuit" />) and that board reads
 *      ?insurance_lawsuit_id= into its list query — so the link lands on the linked matters, never an
 *      orphan route. (The old insurance.lawsuit LawsuitsTab is retired; owner 10-24 "lawsuits only in Legal".)
 *
 * Static source guards only — no migrations, no money. Rule 17: this file + its verify-step
 * wrapper only; no package.json / locked-guards.yml / ci.yml edits.
 *
 * Self-test: node scripts/verify-legal-matter-lawsuit-linkage.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-matter-lawsuit-linkage";

/**
 * @param {{ entityLink: string, matterDetail: string, lawsuitsPage: string, mattersList: string }} sources
 * @returns {string[]}
 */
export function assertLegalMatterLawsuitLinkage(sources) {
  const errors = [];
  const { entityLink, matterDetail, lawsuitsPage, mattersList } = sources;

  if (!/\|\s*"lawsuit"/.test(entityLink)) {
    errors.push('EntityLink: EntityKind union must declare "lawsuit"');
  }
  if (
    !/case "lawsuit":\s*\n\s*return `\/legal\/lawsuits\?insurance_lawsuit_id=\$\{id\}`/.test(entityLink)
  ) {
    errors.push(
      'EntityLink: resolveEntityRoute case "lawsuit" must return `/legal/lawsuits?insurance_lawsuit_id=${id}`',
    );
  }

  if (!/kind="lawsuit"/.test(matterDetail)) {
    errors.push("LegalMatterDetailPage: insurance_lawsuit_id must render via <EntityLink kind=\"lawsuit\" ... />");
  }
  if (/<Link[^>]*to="\/insurance\/lawsuits"/.test(matterDetail)) {
    errors.push(
      "LegalMatterDetailPage: bare <Link to=\"/legal/lawsuits\"> (no id) is forbidden — use EntityLink kind=\"lawsuit\"",
    );
  }
  if (!/data-testid=["']matter-insurance-lawsuit-link["']/.test(matterDetail)) {
    errors.push("LegalMatterDetailPage: insurance lawsuit link must keep data-testid=\"matter-insurance-lawsuit-link\"");
  }

  if (!/<LegalMattersListPage\s+fixedType="lawsuit"\s*\/>/.test(lawsuitsPage)) {
    errors.push('LegalLawsuitsPage: must mount <LegalMattersListPage fixedType="lawsuit" /> (lawsuits are legal matters)');
  }
  if (/LawsuitsTab/.test(lawsuitsPage)) {
    errors.push("LegalLawsuitsPage: must not mount the retired insurance.lawsuit LawsuitsTab");
  }
  if (!/searchParams\.get\(\s*["']insurance_lawsuit_id["']\s*\)/.test(mattersList)) {
    errors.push('LegalMattersListPage: must read searchParams.get("insurance_lawsuit_id")');
  }
  if (!/insurance_lawsuit_id:\s*insuranceLawsuitId/.test(mattersList)) {
    errors.push("LegalMattersListPage: insurance_lawsuit_id must reach the list query");
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = {
    entityLink: `
export type EntityKind =
  | "claim"
  | "lawsuit"
  | "matter";
export function resolveEntityRoute(kind, id) {
  switch (kind) {
    case "claim":
      return \`/insurance/claims?claim_id=\${id}\`;
    case "lawsuit":
      return \`/legal/lawsuits?insurance_lawsuit_id=\${id}\`;
    case "matter":
      return \`/legal/matters/\${id}\`;
  }
}
`,
    matterDetail: `
<EntityLink kind="lawsuit" id={String(matter.insurance_lawsuit_id)} data-testid="matter-insurance-lawsuit-link" />
`,
    lawsuitsPage: `import { LegalMattersListPage } from "../matters/LegalMattersListPage";
export function LegalLawsuitsPage() {
  return <LegalMattersListPage fixedType="lawsuit" />;
}`,
    mattersList: `const insuranceLawsuitId = searchParams.get("insurance_lawsuit_id")?.trim() || "";
legalMattersApi.list(companyId, { insurance_lawsuit_id: insuranceLawsuitId || undefined });`,
  };

  // [name, mutatedField, sources]. `mutatedField` is null for cases that supply a wholesale-distinct
  // fixture value (guaranteed to differ from `good` by inspection) rather than a `.replace()` of it —
  // only the `.replace()`-derived cases need the "did it actually mutate" check below.
  const badCases = [
    ["missing-kind", "entityLink", { ...good, entityLink: good.entityLink.replace('  | "lawsuit"\n', "") }],
    [
      "wrong-route",
      "entityLink",
      {
        ...good,
        entityLink: good.entityLink.replace(
          "return `/legal/lawsuits?insurance_lawsuit_id=${id}`;",
          "return `/legal/lawsuits`;",
        ),
      },
    ],
    ["bare-link-regression", null, { ...good, matterDetail: '<Link to="/legal/lawsuits" data-testid="matter-insurance-lawsuit-link">x</Link>' }],
    ["missing-testid", null, { ...good, matterDetail: '<EntityLink kind="lawsuit" id={String(matter.insurance_lawsuit_id)} />' }],
    ["old-tab-mounted", null, { ...good, lawsuitsPage: 'import { LawsuitsTab } from "x"; export function LegalLawsuitsPage() { return <LawsuitsTab />; }' }],
    ["not-locked-to-lawsuit", "lawsuitsPage", { ...good, lawsuitsPage: good.lawsuitsPage.replace(' fixedType="lawsuit"', "") }],
    ["no-param-read", "mattersList", { ...good, mattersList: good.mattersList.replace('searchParams.get("insurance_lawsuit_id")', '""') }],
    ["param-not-in-query", "mattersList", { ...good, mattersList: good.mattersList.replace("insurance_lawsuit_id: insuranceLawsuitId", "foo: 1") }],
  ];

  const problems = [];

  const goodFails = assertLegalMatterLawsuitLinkage(good);
  if (goodFails.length !== 0) problems.push(`good fixture should pass, got: ${goodFails.join(" | ")}`);

  for (const [name, mutatedField, sources] of badCases) {
    if (mutatedField && sources[mutatedField] === good[mutatedField]) {
      problems.push(`planted regression "${name}" did not mutate ${mutatedField} — selftest is inert`);
      continue;
    }
    const fails = assertLegalMatterLawsuitLinkage(sources);
    if (fails.length === 0) {
      problems.push(`planted regression "${name}" was NOT caught — bad fixture unexpectedly passed`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL} selftest PASS — good fixture passes; ${badCases.length} planted regressions all caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = {
    entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
    matterDetail: read("apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx"),
    lawsuitsPage: read("apps/frontend/src/pages/legal/lawsuits/LegalLawsuitsPage.tsx"),
    mattersList: read("apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx"),
  };

  const failures = assertLegalMatterLawsuitLinkage(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: matter → lawsuit EntityLink wired; /legal/lawsuits = legal matters (type lawsuit) honoring ?insurance_lawsuit_id=.`);
}

main();
