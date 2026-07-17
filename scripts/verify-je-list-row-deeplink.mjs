#!/usr/bin/env node
/**
 * verify-je-list-row-deeplink.mjs
 *
 * GUARD 0441-mod7 (Desktop audit accounting connectivity):
 * ManualJEListPage rows must open JournalEntryDetailPage — not dead text with no navigation.
 *
 * Static invariants (no DB, no network):
 *  1. ManualJEListPage passes onRowClick → /accounting/journal-entries/:id
 *  2. ManualJEListPage renders EntityLink kind="journal_entry" for the JE id column
 *  3. EntityLink resolves journal_entry → /accounting/journal-entries/:id
 *  4. manifest registers /accounting/journal-entries/:id
 *
 * Usage:
 *   node scripts/verify-je-list-row-deeplink.mjs            # scan
 *   node scripts/verify-je-list-row-deeplink.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-list-row-deeplink";
const JE_LIST = "apps/frontend/src/pages/accounting/ManualJEListPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ jeList, entityLink, manifest }) {
  const f = [];

  if (!jeList) {
    f.push(`${JE_LIST}: missing`);
  } else {
    if (!/onRowClick\s*=/.test(jeList)) {
      f.push(`${JE_LIST}: must wire ParityTable onRowClick to open JE detail`);
    }
    if (!/navigate\s*\(\s*[`'"]\/accounting\/journal-entries\/\$\{/.test(jeList)) {
      f.push(`${JE_LIST}: onRowClick must navigate to /accounting/journal-entries/\${entry.id}`);
    }
    if (!/kind\s*=\s*["']journal_entry["']/.test(jeList) || !/EntityLink/.test(jeList)) {
      f.push(`${JE_LIST}: JE id column must use EntityLink kind="journal_entry"`);
    }
    if (!/useNavigate/.test(jeList)) {
      f.push(`${JE_LIST}: must import/use useNavigate for row deep-link`);
    }
  }

  if (!entityLink) {
    f.push(`${ENTITY_LINK}: missing`);
  } else if (
    !/case\s+["']journal_entry["']\s*:\s*return\s+`\/accounting\/journal-entries\/\$\{id\}`/.test(entityLink)
  ) {
    f.push(`${ENTITY_LINK}: resolveEntityRoute(journal_entry) must return /accounting/journal-entries/:id`);
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else if (!/path\s*=\s*["']\/accounting\/journal-entries\/:id["']/.test(manifest)) {
    f.push(`${MANIFEST}: must register /accounting/journal-entries/:id detail route`);
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
    jeList: read(JE_LIST),
    entityLink: read(ENTITY_LINK),
    manifest: read(MANIFEST),
  });
}

if (process.argv.includes("--selftest")) {
  const goodList = `
    import { useNavigate } from "react-router-dom";
    import { EntityLink } from "../../components/shared/EntityLink";
    <EntityLink kind="journal_entry" id={entry.id} label={entry.id.slice(0, 8)} />
    onRowClick={(entry) => navigate(\`/accounting/journal-entries/\${entry.id}\`)}
  `;
  const goodEntity = `
    case "journal_entry":
      return \`/accounting/journal-entries/\${id}\`;
  `;
  const goodManifest = `path="/accounting/journal-entries/:id"`;

  const checks = [
    ["healthy wiring pass", check({ jeList: goodList, entityLink: goodEntity, manifest: goodManifest }).length === 0],
    [
      "missing onRowClick caught",
      check({
        jeList: goodList.replace(/onRowClick\s*=\{[^}]+\}/, ""),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes("onRowClick")),
    ],
    [
      "missing navigate path caught",
      check({
        jeList: goodList.replace("/accounting/journal-entries/", "/accounting/journal-entries"),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes("/accounting/journal-entries/${entry.id}")),
    ],
    [
      "missing EntityLink journal_entry caught",
      check({
        jeList: goodList.replace('kind="journal_entry"', 'kind="invoice"'),
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes('kind="journal_entry"')),
    ],
    [
      "missing JE detail route caught",
      check({
        jeList: goodList,
        entityLink: goodEntity,
        manifest: `path="/accounting/journal-entries"`,
      }).some((x) => x.includes("/accounting/journal-entries/:id")),
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
    `${LABEL}: OK — ManualJEListPage onRowClick + EntityLink journal_entry → /accounting/journal-entries/:id`,
  );
  process.exit(0);
}
