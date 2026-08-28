#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["legal_matter"],"leaves":["matters.list","matters.create","matters.detail"],"task":"LEGAL-F7062-MATTER-IDENTITY-VERTICAL","vertical":"column-wave"} */
/**
 * verify-legal-matters-list-row-deeplink.mjs
 *
 * LegalMattersListPage rows must open LegalMatterDetailPage — not dead text with only a tiny Open link.
 *
 * Static invariants (no DB, no network):
 *  1. LegalMattersListPage passes onRowClick → /legal/matters/:id
 *  2. LegalMattersListPage renders EntityLink kind="matter" for the matter number column
 *  3. EntityLink resolves matter → /legal/matters/:id
 *  4. manifest registers /legal/matters/:id
 *
 * Usage:
 *   node scripts/verify-legal-matters-list-row-deeplink.mjs
 *   node scripts/verify-legal-matters-list-row-deeplink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-matters-list-row-deeplink";
const LIST_PAGE = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const NEW_PAGE = "apps/frontend/src/pages/legal/matters/LegalMatterNewPage.tsx";
const DETAIL_PAGE = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ listPage, entityLink, manifest, newPage, detailPage }) {
  const f = [];

  if (!listPage) {
    f.push(`${LIST_PAGE}: missing`);
  } else {
    if (!/onRowClick\s*=/.test(listPage)) {
      f.push(`${LIST_PAGE}: must wire ParityTable onRowClick to open matter detail`);
    }
    if (!/matterDetailPath\(/.test(listPage) || !/if \(path\) navigate\(path\)/.test(listPage)) {
      f.push(`${LIST_PAGE}: onRowClick must navigate via matterDetailPath UUID guard`);
    }
    if (!/kind\s*=\s*["']matter["']/.test(listPage) || !/EntityLink/.test(listPage)) {
      f.push(`${LIST_PAGE}: matter number column must use EntityLink kind="matter"`);
    }
    if (!/useNavigate/.test(listPage)) {
      f.push(`${LIST_PAGE}: must import/use useNavigate for row deep-link`);
    }
  }

  if (!entityLink) {
    f.push(`${ENTITY_LINK}: missing`);
  } else if (
    !/case\s+["']matter["']\s*:\s*return\s+`\/legal\/matters\/\$\{id\}`/.test(entityLink)
  ) {
    f.push(`${ENTITY_LINK}: resolveEntityRoute(matter) must return /legal/matters/:id`);
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else if (!/path\s*=\s*["']\/legal\/matters\/:id["']/.test(manifest)) {
    f.push(`${MANIFEST}: must register /legal/matters/:id detail route`);
  }
  if (!/legalMattersApi\.create\(companyId, formStateToCreatePayload\(form\)\)/.test(newPage ?? "") || !/onSuccess: \(data\) => navigate\(`\/legal\/matters\/\$\{String\(data\.matter\.id \?\? ""\)\}`\)/.test(newPage ?? "")) {
    f.push(`${NEW_PAGE}: create must write under the selected company and navigate to the persisted matter id`);
  }
  if (!/queryFn: \(\) => legalMattersApi\.get\(companyId, id\)/.test(detailPage ?? "") || !/title=\{matter \? String\(matter\.matter_number \?\? "Matter"\) : "Matter"\}/.test(detailPage ?? "")) {
    f.push(`${DETAIL_PAGE}: detail must read exact company/id and render the human matter number`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    listPage: read(LIST_PAGE),
    entityLink: read(ENTITY_LINK),
    manifest: read(MANIFEST),
    newPage: read(NEW_PAGE),
    detailPage: read(DETAIL_PAGE),
  });
}

if (process.argv.includes("--selftest")) {
  const goodList = `
    import { useNavigate } from "react-router-dom";
    import { EntityLink } from "../../../components/shared/EntityLink";
    <EntityLink kind="matter" id={String(row.id ?? "")} label={String(row.matter_number ?? "")} />
    onRowClick={(row) => {
      const path = matterDetailPath(String(row.id ?? ""));
      if (path) navigate(path);
    }}
    function matterDetailPath(id) {
      return \`/legal/matters/\${id}\`;
    }
  `;
  const goodEntity = `
    case "matter":
      return \`/legal/matters/\${id}\`;
  `;
  const goodManifest = `path="/legal/matters/:id"`;
  const goodNew = `legalMattersApi.create(companyId, formStateToCreatePayload(form)); onSuccess: (data) => navigate(\`/legal/matters/\${String(data.matter.id ?? "")}\`)`;
  const goodDetail = `queryFn: () => legalMattersApi.get(companyId, id); title={matter ? String(matter.matter_number ?? "Matter") : "Matter"}`;

  const checks = [
    ["healthy wiring pass", check({ listPage: goodList, entityLink: goodEntity, manifest: goodManifest, newPage: goodNew, detailPage: goodDetail }).length === 0],
    [
      "missing onRowClick caught",
      check({
        listPage: goodList.replace("onRowClick={(row)", "onRowClickDisabled={(row)"),
        entityLink: goodEntity,
        manifest: goodManifest,
        newPage: goodNew,
        detailPage: goodDetail,
      }).some((x) => x.includes("onRowClick")),
    ],
    [
      "missing navigate path caught",
      check({
        listPage: goodList.replace("if (path) navigate(path)", "if (path) return"),
        entityLink: goodEntity,
        manifest: goodManifest,
        newPage: goodNew,
        detailPage: goodDetail,
      }).some((x) => x.includes("matterDetailPath UUID guard")),
    ],
    [
      "missing EntityLink matter caught",
      check({
        listPage: goodList.replace('kind="matter"', 'kind="invoice"'),
        entityLink: goodEntity,
        manifest: goodManifest,
        newPage: goodNew,
        detailPage: goodDetail,
      }).some((x) => x.includes('kind="matter"')),
    ],
    [
      "missing matter detail route caught",
      check({
        listPage: goodList,
        entityLink: goodEntity,
        manifest: `path="/legal/matters"`,
        newPage: goodNew,
        detailPage: goodDetail,
      }).some((x) => x.includes("/legal/matters/:id")),
    ],
    ["create identity caught", check({ listPage: goodList, entityLink: goodEntity, manifest: goodManifest, newPage: goodNew.replace("data.matter.id", "null"), detailPage: goodDetail }).some((x) => x.includes("persisted matter id"))],
    ["detail identity caught", check({ listPage: goodList, entityLink: goodEntity, manifest: goodManifest, newPage: goodNew, detailPage: goodDetail.replace("companyId, id", "companyId, ''") }).some((x) => x.includes("exact company/id"))],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — legal matter create→list→exact detail preserves canonical id and human number`,
  );
  process.exit(0);
}
