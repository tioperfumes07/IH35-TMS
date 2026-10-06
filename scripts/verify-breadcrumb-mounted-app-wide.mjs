#!/usr/bin/env node
/**
 * R433 (U18) — the breadcrumb is mounted app-wide from ONE point (Shell), and no page shows two.
 *   1. Shell.tsx mounts <StructuralBreadcrumb />
 *   2. StructuralBreadcrumb hides when a page claims the slot, uses skipClaim, and has the Accounting fallback
 *   3. shared Breadcrumb + both PageHeaders claim the slot (so a page's own trail replaces the Shell one)
 *   4. no page/component file renders <Breadcrumb> more than once, and none mounts <StructuralBreadcrumb> except Shell
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE = "apps/frontend/src";
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === "__tests__" || n === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) out.push(p);
  }
  return out;
}

/** files: { relPath: source }. Returns failure strings. */
export function check(files) {
  const f = [];
  const get = (p) => strip(files[p] ?? "");
  if (!/<StructuralBreadcrumb\s*\/>/.test(get(`${FE}/components/Shell.tsx`))) f.push("Shell.tsx must mount <StructuralBreadcrumb />");
  const sb = get(`${FE}/components/shared/StructuralBreadcrumb.tsx`);
  if (!/useBreadcrumbClaimed/.test(sb) || !/skipClaim/.test(sb)) f.push("StructuralBreadcrumb must step aside when claimed and render with skipClaim");
  if (!/accountingFallbackCrumbs/.test(sb)) f.push("StructuralBreadcrumb must use accountingFallbackCrumbs so Accounting pages get a crumb");
  if (!/useClaimBreadcrumb\(\s*!skipClaim\s*\)/.test(get(`${FE}/components/shared/Breadcrumb.tsx`))) f.push("shared Breadcrumb must claim the slot unless skipClaim");
  for (const h of ["components/layout/PageHeader.tsx", "components/forms/shared/PageHeader.tsx"]) {
    if (!/useClaimBreadcrumb\(/.test(get(`${FE}/${h}`))) f.push(`${h} must claim the breadcrumb slot when it renders a trail`);
  }
  for (const [p, src] of Object.entries(files)) {
    if (p.endsWith("components/shared/Breadcrumb.tsx") || p.endsWith("components/shared/StructuralBreadcrumb.tsx")) continue;
    const s = strip(src);
    const n = (s.match(/<Breadcrumb[\s/>]/g) ?? []).length;
    if (n > 1) f.push(`${p}: renders <Breadcrumb> ${n}x — one breadcrumb per page`);
    if (/<StructuralBreadcrumb[\s/>]/.test(s) && !p.endsWith("components/Shell.tsx")) f.push(`${p}: mounts StructuralBreadcrumb outside Shell`);
  }
  return f;
}

function load() {
  const files = {};
  for (const p of walk(path.join(ROOT, FE))) files[path.relative(ROOT, p)] = readFileSync(p, "utf8");
  return files;
}

if (process.argv.includes("--selftest")) {
  const live = load();
  const good = check(live);
  if (good.length) { console.error("✗ SELFTEST FAIL — live tree not clean:", good); process.exit(1); }
  const plants = [
    ["no Shell mount", { ...live, [`${FE}/components/Shell.tsx`]: "export const Shell=1" }, "Shell.tsx must mount"],
    ["no claim in Breadcrumb", { ...live, [`${FE}/components/shared/Breadcrumb.tsx`]: "export function Breadcrumb(){}" }, "shared Breadcrumb must claim"],
    ["no claim in PageHeader", { ...live, [`${FE}/components/layout/PageHeader.tsx`]: "export function PageHeader(){}" }, "must claim the breadcrumb slot"],
    ["no accounting fallback", { ...live, [`${FE}/components/shared/StructuralBreadcrumb.tsx`]: "useBreadcrumbClaimed skipClaim" }, "accountingFallbackCrumbs"],
    ["double breadcrumb", { ...live, [`${FE}/pages/Plant.tsx`]: "<Breadcrumb items={a} /><Breadcrumb items={b} />" }, "one breadcrumb per page"],
    ["structural outside shell", { ...live, [`${FE}/pages/Plant2.tsx`]: "<StructuralBreadcrumb />" }, "outside Shell"],
  ];
  for (const [name, tree, needle] of plants) {
    if (!check(tree).some((m) => m.includes(needle))) { console.error(`✗ SELFTEST FAIL — plant "${name}" escaped`); process.exit(1); }
  }
  console.log(`✓ verify-breadcrumb-mounted-app-wide SELFTEST PASS — ${plants.length} plants rejected`);
  process.exit(0);
}

const fails = check(load());
if (fails.length) {
  console.error("✗ verify-breadcrumb-mounted-app-wide: FAIL");
  for (const m of fails) console.error(`  - ${m}`);
  process.exit(1);
}
console.log("✓ verify-breadcrumb-mounted-app-wide: Shell mounts the breadcrumb app-wide; pages with their own trail claim the slot; no page renders two.");
