#!/usr/bin/env node
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

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ listPage, entityLink, manifest }) {
  const f = [];

  if (!listPage) {
    f.push(`${LIST_PAGE}: missing`);
  } else {
    if (!/onRowClick\s*=/.test(listPage)) {
      f.push(`${LIST_PAGE}: must wire ParityTable onRowClick to open matter detail`);
    }
    if (!/navigate\s*\(\s*[`'"]\/legal\/matters\/\$\{/.test(listPage)) {
      f.push(`${LIST_PAGE}: onRowClick must navigate to /legal/matters/\${row.id}`);
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
  } else if (!/case\s+["']matter["']\s*:[\s\S]*?\/legal\/matters\/\$\{id\}/.test(entityLink)) {
    f.push(`${ENTITY_LINK}: resolveEntityRoute(matter) must return /legal/matters/:id`);
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else if (!/path\s*=\s*["']\/legal\/matters\/:id["']/.test(manifest)) {
    f.push(`${MANIFEST}: must register /legal/matters/:id detail route`);
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
  });
}

if (process.argv.includes("--selftest")) {
  const goodList = `
    import { useNavigate } from "react-router-dom";
    import { EntityLink } from "../../../components/shared/EntityLink";
    <EntityLink kind="matter" id={String(row.id ?? "")} label={String(row.matter_number ?? "")} />
    onRowClick={(row) => navigate(\`/legal/matters/\${String(row.id ?? "")}\`)}
  `;
  const goodEntity = `
    case "matter":
      return \`/legal/matters/\${id}\`;
  `;
  const goodManifest = `path="/legal/matters/:id"`;

  const checks = [
    ["healthy wiring pass", check({ listPage: goodList, entityLink: goodEntity, manifest: goodManifest }).length === 0],
    [
      "missing onRowClick caught",
      check({
        listPage: goodList.replace(/onRowClick\s*=\{[^}]+\}/, ""),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes("onRowClick")),
    ],
    [
      "missing navigate path caught",
      check({
        listPage: goodList.replace("/legal/matters/", "/legal/matters"),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes("/legal/matters/${row.id}")),
    ],
    [
      "missing EntityLink matter caught",
      check({
        listPage: goodList.replace('kind="matter"', 'kind="invoice"'),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes('kind="matter"')),
    ],
    [
      "missing matter detail route caught",
      check({
        listPage: goodList,
        entityLink: goodEntity,
        manifest: `path="/legal/matters"`,
      }).some((x) => x.includes("/legal/matters/:id")),
    ],
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
    `${LABEL}: OK — LegalMattersListPage onRowClick + EntityLink matter → /legal/matters/:id`,
  );
  process.exit(0);
}
