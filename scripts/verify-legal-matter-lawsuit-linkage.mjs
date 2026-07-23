#!/usr/bin/env node
/**
 * Law §9 reverse drill-through — Legal matter → insurance lawsuit → back to lawsuit row.
 *
 * `legal.matters.insurance_lawsuit_id` has had a schema FK + create/edit pickers since
 * PR #3175 / phase4-crossmodule-fks, but LegalMatterDetailPage rendered it as a bare
 * <Link to="/safety/insurance/lawsuits"> with no id — a dead-end (list-only, no row
 * selected). This guard proves the fix stays wired:
 *
 *   1. EntityLink declares a "lawsuit" kind resolving to
 *      /safety/insurance/lawsuits?lawsuit_id=${id} (never a bare list route).
 *   2. LegalMatterDetailPage renders insurance_lawsuit_id via <EntityLink kind="lawsuit" .../>,
 *      not a bare <Link to="/safety/insurance/lawsuits">.
 *   3. LawsuitsTab reads ?lawsuit_id= from useSearchParams and seeds the selected/highlighted
 *      row from it (mirrors ClaimsTab's claim_id deep-link pattern) — so the link is not an
 *      orphan route with nothing on the other end.
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
 * @param {{ entityLink: string, matterDetail: string, lawsuitsTab: string }} sources
 * @returns {string[]}
 */
export function assertLegalMatterLawsuitLinkage(sources) {
  const errors = [];
  const { entityLink, matterDetail, lawsuitsTab } = sources;

  if (!/\|\s*"lawsuit"/.test(entityLink)) {
    errors.push('EntityLink: EntityKind union must declare "lawsuit"');
  }
  if (
    !/case "lawsuit":\s*\n\s*return `\/safety\/insurance\/lawsuits\?lawsuit_id=\$\{id\}`/.test(entityLink)
  ) {
    errors.push(
      'EntityLink: resolveEntityRoute case "lawsuit" must return `/safety/insurance/lawsuits?lawsuit_id=${id}`',
    );
  }

  if (!/kind="lawsuit"/.test(matterDetail)) {
    errors.push("LegalMatterDetailPage: insurance_lawsuit_id must render via <EntityLink kind=\"lawsuit\" ... />");
  }
  if (/<Link[^>]*to="\/safety\/insurance\/lawsuits"/.test(matterDetail)) {
    errors.push(
      "LegalMatterDetailPage: bare <Link to=\"/safety/insurance/lawsuits\"> (no id) is forbidden — use EntityLink kind=\"lawsuit\"",
    );
  }
  if (!/data-testid=["']matter-insurance-lawsuit-link["']/.test(matterDetail)) {
    errors.push("LegalMatterDetailPage: insurance lawsuit link must keep data-testid=\"matter-insurance-lawsuit-link\"");
  }

  if (!/useSearchParams/.test(lawsuitsTab)) {
    errors.push("LawsuitsTab: must call useSearchParams to honor ?lawsuit_id= deep-links");
  }
  if (!/searchParams\.get\(\s*["']lawsuit_id["']\s*\)/.test(lawsuitsTab)) {
    errors.push('LawsuitsTab: must read searchParams.get("lawsuit_id")');
  }
  if (!/setSelectedLawsuitId\(deepLinkLawsuitId\)/.test(lawsuitsTab)) {
    errors.push("LawsuitsTab: deep-linked lawsuit_id must seed/select selectedLawsuitId (row highlight)");
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
      return \`/safety/insurance/claims?claim_id=\${id}\`;
    case "lawsuit":
      return \`/safety/insurance/lawsuits?lawsuit_id=\${id}\`;
    case "matter":
      return \`/legal/matters/\${id}\`;
  }
}
`,
    matterDetail: `
<EntityLink kind="lawsuit" id={String(matter.insurance_lawsuit_id)} data-testid="matter-insurance-lawsuit-link" />
`,
    lawsuitsTab: `
const [searchParams] = useSearchParams();
const deepLinkLawsuitId = searchParams.get("lawsuit_id");
const [selectedLawsuitId, setSelectedLawsuitId] = useState(deepLinkLawsuitId);
useEffect(() => {
  if (deepLinkLawsuitId) setSelectedLawsuitId(deepLinkLawsuitId);
}, [deepLinkLawsuitId]);
`,
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
          "return `/safety/insurance/lawsuits?lawsuit_id=${id}`;",
          "return `/safety/insurance/lawsuits`;",
        ),
      },
    ],
    ["bare-link-regression", null, { ...good, matterDetail: '<Link to="/safety/insurance/lawsuits" data-testid="matter-insurance-lawsuit-link">x</Link>' }],
    ["missing-testid", null, { ...good, matterDetail: '<EntityLink kind="lawsuit" id={String(matter.insurance_lawsuit_id)} />' }],
    ["no-search-params-hook", "lawsuitsTab", { ...good, lawsuitsTab: good.lawsuitsTab.replace("useSearchParams", "useState") }],
    ["no-param-read", "lawsuitsTab", { ...good, lawsuitsTab: good.lawsuitsTab.replace('searchParams.get("lawsuit_id")', '""') }],
    ["dead-deep-link", "lawsuitsTab", { ...good, lawsuitsTab: good.lawsuitsTab.replace("setSelectedLawsuitId(deepLinkLawsuitId)", "doNothing()") }],
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
    lawsuitsTab: read("apps/frontend/src/pages/insurance/LawsuitsTab.tsx"),
  };

  const failures = assertLegalMatterLawsuitLinkage(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: matter → lawsuit EntityLink wired; LawsuitsTab honors ?lawsuit_id= reverse drill.`);
}

main();
