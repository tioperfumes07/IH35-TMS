#!/usr/bin/env node
/** @matrix-built {"modules":["insurance","legal","drivers","fleet"],"cols":["driver","unit","connectivity","reverse_link"],"task":"INSURANCE-LAWSUIT-CLAIM-IDENTITY","leafRe":"lawsuits\\.(list|create)"} */
/**
 * Law §9 reverse drill-through for lawsuits — ENG-60 (Claude Lead, 2026-11-02; supersedes the 443.334 shape).
 *
 * Owner 10-24 (LEAD 443.332): "lawsuits only in Legal". A lawsuit IS a legal matter (legal.matters type 'lawsuit').
 * Migration 202616310100 dropped insurance.lawsuit, legal.matters.insurance_lawsuit_id and insurance.claim.lawsuit_id
 * (0 rows / 0 links measured live, all entities). So the drill-through is now one hop, matter id to matter page:
 *
 *   1. EntityLink declares a "lawsuit" kind resolving to /legal/matters/${id} (the id IS the matter id — the claim
 *      graph returns lawsuit matters, never an insurance.lawsuit id).
 *   2. LegalMatterDetailPage carries NO insurance_lawsuit_id link (that column no longer exists — a link to it is a
 *      dead end) and no bare <Link to="/insurance/lawsuits">.
 *   3. /legal/lawsuits = <LegalMattersListPage fixedType="lawsuit" /> (the canonical board), never the retired
 *      insurance LawsuitsTab.
 *   4. LegalMattersListPage no longer reads ?insurance_lawsuit_id= (the filter column is dropped; a stale param must not
 *      reach the API, which no longer accepts it).
 *   5. Insurance › Claims reverse lists the claim's lawsuits through <EntityLink kind="lawsuit" ...>.
 *
 * Static source guards only — no migrations, no money.
 * Self-test: node scripts/verify-legal-matter-lawsuit-linkage.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-matter-lawsuit-linkage";

/**
 * @param {{ entityLink: string, matterDetail: string, lawsuitsPage: string, mattersList: string, claimsTab: string }} sources
 * @returns {string[]}
 */
export function assertLegalMatterLawsuitLinkage(sources) {
  const errors = [];
  const { entityLink, matterDetail, lawsuitsPage, mattersList, claimsTab } = sources;

  if (!/\|\s*"lawsuit"/.test(entityLink)) {
    errors.push('EntityLink: EntityKind union must declare "lawsuit"');
  }
  if (!/case "lawsuit":\s*\n\s*return `\/legal\/matters\/\$\{id\}`/.test(entityLink)) {
    errors.push('EntityLink: resolveEntityRoute case "lawsuit" must return `/legal/matters/${id}` (a lawsuit IS a matter)');
  }
  if (/insurance_lawsuit_id/.test(entityLink)) {
    errors.push("EntityLink: must not route through the dropped insurance_lawsuit_id");
  }

  if (/insurance_lawsuit/.test(matterDetail)) {
    errors.push("LegalMatterDetailPage: must not render the dropped insurance_lawsuit_id link (dead end)");
  }
  if (/<Link[^>]*to="\/insurance\/lawsuits"/.test(matterDetail)) {
    errors.push('LegalMatterDetailPage: bare <Link to="/insurance/lawsuits"> is forbidden');
  }

  if (!/<LegalMattersListPage\s+fixedType="lawsuit"\s*\/>/.test(lawsuitsPage)) {
    errors.push('LegalLawsuitsPage: must mount <LegalMattersListPage fixedType="lawsuit" /> (lawsuits are legal matters)');
  }
  if (/LawsuitsTab/.test(lawsuitsPage)) {
    errors.push("LegalLawsuitsPage: must not mount the retired insurance LawsuitsTab");
  }

  if (/insurance_lawsuit_id/.test(mattersList)) {
    errors.push("LegalMattersListPage: must not read or send the dropped insurance_lawsuit_id filter");
  }

  if (!/graph\.reverse\.lawsuits\.map[\s\S]{0,200}<EntityLink[\s\S]{0,60}kind="lawsuit"/.test(claimsTab)) {
    errors.push('ClaimsTab: claim reverse lawsuits must render <EntityLink kind="lawsuit" ...>');
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
      return \`/legal/matters/\${id}\`;
    case "matter":
      return \`/legal/matters/\${id}\`;
  }
}
`,
    matterDetail: `<EntityLinkOrTombstone kind="claim" id={String(matter.insurance_claim_id)} />`,
    lawsuitsPage: `import { LegalMattersListPage } from "../matters/LegalMattersListPage";
export function LegalLawsuitsPage() {
  return <LegalMattersListPage fixedType="lawsuit" />;
}`,
    mattersList: `const insuranceClaimId = searchParams.get("insurance_claim_id")?.trim() || "";`,
    claimsTab: `{graph.reverse.lawsuits.map((l) => (
                  <EntityLink
                    key={l.id}
                    kind="lawsuit"
                    id={l.id}`,
  };

  const badCases = [
    ["missing-kind", "entityLink", { ...good, entityLink: good.entityLink.replace('  | "lawsuit"\n', "") }],
    ["old-route", "entityLink", { ...good, entityLink: good.entityLink.replace("    case \"lawsuit\":\n      return `/legal/matters/${id}`;", "    case \"lawsuit\":\n      return `/legal/lawsuits?insurance_lawsuit_id=${id}`;") }],
    ["dead-detail-link", null, { ...good, matterDetail: '<EntityLink kind="lawsuit" id={String(matter.insurance_lawsuit_id)} />' }],
    ["bare-link-regression", null, { ...good, matterDetail: '<Link to="/insurance/lawsuits">x</Link>' }],
    ["old-tab-mounted", null, { ...good, lawsuitsPage: 'import { LawsuitsTab } from "x"; export function LegalLawsuitsPage() { return <LawsuitsTab />; }' }],
    ["not-locked-to-lawsuit", "lawsuitsPage", { ...good, lawsuitsPage: good.lawsuitsPage.replace(' fixedType="lawsuit"', "") }],
    ["stale-filter", null, { ...good, mattersList: 'const id = searchParams.get("insurance_lawsuit_id");' }],
    ["claims-reverse-wrong-kind", "claimsTab", { ...good, claimsTab: good.claimsTab.replace('kind="lawsuit"', 'kind="matter"') }],
  ];

  const problems = [];
  const goodFails = assertLegalMatterLawsuitLinkage(good);
  if (goodFails.length !== 0) problems.push(`good fixture should pass, got: ${goodFails.join(" | ")}`);
  for (const [name, mutatedField, sources] of badCases) {
    if (mutatedField && sources[mutatedField] === good[mutatedField]) {
      problems.push(`planted regression "${name}" did not mutate ${mutatedField} — selftest is inert`);
      continue;
    }
    if (assertLegalMatterLawsuitLinkage(sources).length === 0) {
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
    claimsTab: read("apps/frontend/src/pages/insurance/ClaimsTab.tsx"),
  };
  const failures = assertLegalMatterLawsuitLinkage(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: lawsuit = legal matter; EntityLink lawsuit → /legal/matters/:id; /legal/lawsuits = matters board (type lawsuit); claim reverse wired.`);
}

main();
