#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/0408_search_universal_index.sql");
contains("db/migrations/0408_search_universal_index.sql", migration, [
  { pattern: /search\.universal_index/, label: "universal_index table" },
  { pattern: /idx_search_tsvector/, label: "GIN tsvector index" },
]);

const routes = read("apps/backend/src/search/universal/routes.ts");
contains("apps/backend/src/search/universal/routes.ts", routes, [
  { pattern: /\/api\/search\/universal/, label: "universal search route" },
  { pattern: /registerUniversalSearchRoutes/, label: "route registrar export" },
]);

const indexer = read("apps/backend/src/search/universal/indexer.service.ts");
contains("apps/backend/src/search/universal/indexer.service.ts", indexer, [
  { pattern: /indexEntity/, label: "indexEntity export" },
]);

const worker = read("apps/backend/src/jobs/search-indexer-incremental.ts");
contains("apps/backend/src/jobs/search-indexer-incremental.ts", worker, [
  { pattern: /initializeSearchIndexerIncremental/, label: "incremental worker init" },
]);

const switcher = read("apps/frontend/src/components/shared/CmdKQuickSwitcher.tsx");
contains("apps/frontend/src/components/shared/CmdKQuickSwitcher.tsx", switcher, [
  { pattern: /cmd-k-quick-switcher/, label: "cmd-k test id" },
  { pattern: /metaKey|ctrlKey/, label: "keyboard shortcut listener" },
  { pattern: /150/, label: "150ms debounce" },
]);

const appLayout = read("apps/frontend/src/layouts/AppLayout.tsx");
contains("apps/frontend/src/layouts/AppLayout.tsx", appLayout, [
  { pattern: /CmdKQuickSwitcher/, label: "CmdK mounted in AppLayout" },
]);

const shell = read("apps/frontend/src/components/Shell.tsx");
contains("apps/frontend/src/components/Shell.tsx", shell, [
  { pattern: /AppLayout/, label: "AppLayout wired in Shell" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerUniversalSearchRoutes/, label: "routes registered in index" },
  { pattern: /initializeSearchIndexerIncremental/, label: "indexer worker registered" },
]);

read("apps/backend/src/search/universal/__tests__/query.test.ts");
read("apps/backend/src/search/universal/__tests__/indexer.test.ts");

const docs = read("docs/specs/gap-89-cmd-k-quick-switcher.md");
contains("docs/specs/gap-89-cmd-k-quick-switcher.md", docs, [
  { pattern: /GAP-89/, label: "GAP-89 identifier" },
  { pattern: /\/api\/search\/universal/, label: "API documented" },
]);

const manifest = read(".block-ready.json");
contains(".block-ready.json", manifest, [
  { pattern: /GAP-89-UNIVERSAL-SEARCH-CMD-K/, label: "GAP-89 block id in manifest" },
]);

if (failures.length > 0) {
  console.error("verify:cmd-k-quick-switcher — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:cmd-k-quick-switcher — OK");
