#!/usr/bin/env node
/**
 * 443.325 ENG-31 — every Shell page gets a breadcrumb without per-page copy-paste.
 *   1. Shell mounts StructuralBreadcrumb (app-wide slot; pages with their own trail claim it).
 *   2. Every non-Accounting manifest route resolves a stable structural crumb (delegate guard).
 *   3. Page-local <Breadcrumb> under apps/frontend/src/pages is shrink-only (PINNED allowlist).
 *
 * Measured 2026-10-24 on origin/main: 9 page files render <Breadcrumb>; all other routes rely on Shell.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE_PAGES = path.join(ROOT, "apps/frontend/src/pages");
const LABEL = "verify-page-has-breadcrumb";

/** Shrink-only ceiling for page files that render their own <Breadcrumb> (not Shell structural). */
const LOCAL_BREADCRUMB_BASELINE = 9;

/**
 * Each page file allowed to render <Breadcrumb> (Accounting wrapper + a few program/settlement leaves).
 * count = occurrences of `<Breadcrumb` in file today.
 */
const PINNED_LOCAL = [
  {
    rel: "pages/accounting/AccountingSubNavWrapper.tsx",
    count: 1,
    reason: "Accounting module sub-nav shell; /accounting routes skip global structural crumbs (ROUND 367.9).",
  },
  {
    rel: "pages/accounting/LoadCostsBoardPage.tsx",
    count: 1,
    reason: "Load costs board uses explicit Dispatch › Load costs trail (U18 module path).",
  },
  {
    rel: "pages/driver-finance/SettlementDetailPage.tsx",
    count: 1,
    reason: "Settlement detail custom trail until structural helper covers driver-finance depth.",
  },
  {
    rel: "pages/driver-finance/SettlementStatementWorkflowPage.tsx",
    count: 1,
    reason: "Statement workflow custom trail (multi-step settlement surface).",
  },
  {
    rel: "pages/program/FinalAdditionsPage.tsx",
    count: 1,
    reason: "Internal program tracker surface (non-operator module).",
  },
  {
    rel: "pages/program/ModuleCompletionPage.tsx",
    count: 1,
    reason: "Internal program tracker surface (non-operator module).",
  },
  {
    rel: "pages/program/ProgramBoardPage.tsx",
    count: 1,
    reason: "Internal program tracker surface (non-operator module).",
  },
  {
    rel: "pages/program/ProgramTrackerPage.tsx",
    count: 1,
    reason: "Internal program tracker surface (non-operator module).",
  },
  {
    rel: "pages/work-orders/WorkOrdersConsoleDetailPage.tsx",
    count: 1,
    reason: "WO console detail custom trail (maintenance console grammar).",
  },
];

const strip = (t) =>
  String(t ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");

function walkPages(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "__tests__" || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkPages(p, out);
    else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.")) out.push(p);
  }
  return out;
}

function runAppWideMountGuard() {
  const script = path.join(ROOT, "scripts/verify-breadcrumb-mounted-app-wide.mjs");
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    return { ok: false, detail: (r.stdout || "") + (r.stderr || "") };
  }
  return { ok: true, detail: (r.stdout || "").trim() };
}

function checkAppWideMountFromFiles(files) {
  const fails = [];
  const shell = strip(files["apps/frontend/src/components/Shell.tsx"] ?? "");
  if (!/<StructuralBreadcrumb\s*\/>/.test(shell)) {
    fails.push("Shell.tsx must mount <StructuralBreadcrumb /> so every page gets a breadcrumb");
  }
  return fails;
}

function loadFrontendFiles() {
  const files = {};
  const feRoot = path.join(ROOT, "apps/frontend/src");
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "__tests__" || ent.name === "node_modules") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.")) {
        files[path.relative(ROOT, p)] = fs.readFileSync(p, "utf8");
      }
    }
  }
  walk(feRoot);
  return files;
}

export function measureLocalPageBreadcrumbs(pageSources) {
  const byFile = new Map();
  let total = 0;
  const feSrc = path.join(ROOT, "apps/frontend/src");
  const entries =
    pageSources ??
    walkPages(FE_PAGES).map((abs) => ({
      rel: path.relative(feSrc, abs),
      src: fs.readFileSync(abs, "utf8"),
    }));

  for (const { rel, src } of entries) {
    if (!rel.startsWith("pages/") && !rel.startsWith(`pages${path.sep}`)) continue;
    const n = (strip(src).match(/<Breadcrumb[\s/>]/g) ?? []).length;
    if (n > 0) {
      byFile.set(rel.replace(/\\/g, "/"), n);
      total += n;
    }
  }
  return { byFile, total };
}

function pageSourcesFromFiles(files) {
  const prefix = "apps/frontend/src/";
  const out = [];
  for (const [relPath, src] of Object.entries(files)) {
    if (!relPath.startsWith(prefix)) continue;
    const rel = relPath.slice(prefix.length);
    if (!rel.startsWith("pages/")) continue;
    out.push({ rel, src });
  }
  return out;
}

function checkLocalAllowlist(pageSources) {
  const fails = [];
  const { byFile, total } = measureLocalPageBreadcrumbs(pageSources);
  const pinnedByRel = new Map(PINNED_LOCAL.map((p) => [p.rel, p]));

  if (total > LOCAL_BREADCRUMB_BASELINE) {
    fails.push(
      `page-local <Breadcrumb> count ${total} exceeds baseline ${LOCAL_BREADCRUMB_BASELINE} — convert to Shell structural crumbs or shrink PINNED`,
    );
  }

  for (const [rel, count] of byFile) {
    const pin = pinnedByRel.get(rel);
    if (!pin) {
      fails.push(`${rel}: renders <Breadcrumb> ${count}x but is not in PINNED_LOCAL — use Shell structural breadcrumb`);
      continue;
    }
    if (pin.count !== count) {
      fails.push(`${rel}: <Breadcrumb> count ${count} !== pinned ${pin.count}`);
    }
  }

  for (const pin of PINNED_LOCAL) {
    const got = byFile.get(pin.rel) ?? 0;
    if (got !== pin.count) {
      fails.push(`${pin.rel}: expected pinned count ${pin.count}, measured ${got}`);
    }
  }

  const pageFileCount = pageSources ? pageSources.length : walkPages(FE_PAGES).length;
  return { fails, total, pageFileCount, localFileCount: byFile.size };
}

function runStructuralRouteGuard() {
  const script = path.join(ROOT, "scripts/verify-every-route-has-a-structural-breadcrumb.mjs");
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    return { ok: false, detail: (r.stdout || "") + (r.stderr || "") };
  }
  return { ok: true, detail: (r.stdout || "").trim() };
}

export function checkPageHasBreadcrumb(files) {
  const fails = [...checkAppWideMountFromFiles(files)];
  const local = checkLocalAllowlist(pageSourcesFromFiles(files));
  fails.push(...local.fails);
  return { fails, local };
}

if (process.argv.includes("--selftest")) {
  const live = loadFrontendFiles();
  const { fails: liveFails } = checkPageHasBreadcrumb(live);
  if (liveFails.length) {
    console.error(`✗ ${LABEL} SELFTEST FAIL — live tree not clean:`, liveFails);
    process.exit(1);
  }
  const mount = runAppWideMountGuard();
  if (!mount.ok) {
    console.error(`✗ ${LABEL} SELFTEST FAIL — app-wide mount guard:\n${mount.detail}`);
    process.exit(1);
  }
  const route = runStructuralRouteGuard();
  if (!route.ok) {
    console.error(`✗ ${LABEL} SELFTEST FAIL — structural route guard:\n${route.detail}`);
    process.exit(1);
  }

  const plants = [
    [
      "no Shell mount",
      { ...live, ["apps/frontend/src/components/Shell.tsx"]: "export function Shell(){return null}" },
      "Shell.tsx must mount",
    ],
    [
      "extra page breadcrumb",
      {
        ...live,
        ["apps/frontend/src/pages/PlantBreadcrumb.tsx"]: "export function P(){return <Breadcrumb items={[]} />}",
      },
      "not in PINNED_LOCAL",
    ],
  ];
  for (const [name, tree, needle] of plants) {
    const { fails } = checkPageHasBreadcrumb(tree);
    if (!fails.some((m) => m.includes(needle))) {
      console.error(`✗ ${LABEL} SELFTEST FAIL — plant "${name}" escaped`);
      process.exit(1);
    }
  }
  console.log(`✓ ${LABEL} SELFTEST PASS — ${plants.length} plants rejected; structural route guard OK`);
  process.exit(0);
}

const mount = runAppWideMountGuard();
if (!mount.ok) {
  console.error(`✗ ${LABEL}: app-wide mount guard failed\n${mount.detail}`);
  process.exit(1);
}

const files = loadFrontendFiles();
const { fails, local } = checkPageHasBreadcrumb(files);
if (fails.length) {
  console.error(`✗ ${LABEL}: FAIL (${fails.length})`);
  for (const m of fails) console.error(`  - ${m}`);
  process.exit(1);
}

const route = runStructuralRouteGuard();
if (!route.ok) {
  console.error(`✗ ${LABEL}: structural route guard failed\n${route.detail}`);
  process.exit(1);
}

console.log(
  `✓ ${LABEL}: PASS — ${mount.detail}; ${local.localFileCount} page files with local <Breadcrumb> (${local.total}/${LOCAL_BREADCRUMB_BASELINE} baseline); ` +
    `${local.pageFileCount} page files scanned; ${route.detail}`,
);
