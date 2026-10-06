#!/usr/bin/env node
/**
 * ROUND 435-CUR — a back arrow NEVER crosses a module boundary.
 *
 * Static, against the route manifest + page backHref/backTo/fallbackTo literals.
 * Shrink-only: any new cross-module back target is a FAIL.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";

const LABEL = "verify-back-arrow-stays-in-module";
const fails = [];
const read = (p) => readFileSync(p, "utf8");
const strip = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");

const MODULE_PREFIXES = [
  "/safety/insurance",
  "/driver-finance",
  "/driver-hub",
  "/work-orders",
  "/cash-advances",
  "/cash-flow",
  "/daily-tasks",
  "/maintenance",
  "/dispatch",
  "/banking",
  "/factoring",
  "/customers",
  "/vendors",
  "/drivers",
  "/reports",
  "/finance",
  "/inventory",
  "/compliance",
  "/program",
  "/system",
  "/settings",
  "/safety",
  "/fleet",
  "/fuel",
  "/lists",
  "/legal",
  "/tasks",
  "/users",
  "/help",
  "/docs",
  "/eld",
  "/425c",
  "/form-425c",
  "/admin",
  "/home",
  "/accounting",
  "/qbo",
  "/integrations",
];

function modulePrefix(pathname) {
  const pathOnly = (pathname.split("?")[0] || pathname).replace(/\/+$/, "") || "/";
  if (pathOnly === "/" || pathOnly === "") return null;
  for (const prefix of MODULE_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) return prefix;
  }
  const segs = pathOnly.split("/").filter(Boolean);
  return segs[0] ? `/${segs[0]}` : null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const FILE_MODULE = [
  [/\/pages\/home\/DriverHubReportingPage\.tsx$/, "/driver-hub"],
  [/\/pages\/reports\/form-425c\//, "/425c"],
  [/\/pages\/samsara-vendor-mapping\//, "/samsara"],
  [/\/pages\/CustomerDetail\.tsx$/, "/customers"],
  [/\/pages\/Customers\.tsx$/, "/customers"],
  [/\/pages\/customers\//, "/customers"],
  [/\/pages\/VendorDetail\.tsx$/, "/vendors"],
  [/\/pages\/Vendors\.tsx$/, "/vendors"],
  [/\/pages\/vendors\//, "/vendors"],
  [/\/pages\/DriverDetail\.tsx$/, "/drivers"],
  [/\/pages\/Drivers\.tsx$/, "/drivers"],
  [/\/pages\/drivers\//, "/drivers"],
  [/\/pages\/alerts\//, "/drivers"],
  [/\/pages\/units\//, "/fleet"],
  [/\/pages\/qbo-sync-detail\//, "/qbo"],
  [/\/pages\/form425c\//, "/425c"],
  [/\/pages\/Dispatch\.tsx$/, "/dispatch"],
  [/\/pages\/dispatch\//, "/dispatch"],
];

function fileModulePrefix(file) {
  const norm = file.replace(/\\/g, "/");
  for (const [re, prefix] of FILE_MODULE) {
    if (re.test(norm)) return prefix;
  }
  const m = norm.match(/\/pages\/([^/]+)\//);
  if (!m) return null;
  const folder = m[1];
  const mapped = {
    accounting: "/accounting",
    banking: "/banking",
    safety: "/safety",
    fleet: "/fleet",
    fuel: "/fuel",
    "cash-flow": "/cash-flow",
    inventory: "/inventory",
    system: "/system",
    factoring: "/factoring",
    maintenance: "/maintenance",
    legal: "/legal",
    reports: "/reports",
    finance: "/finance",
    "driver-finance": "/driver-finance",
    lists: "/lists",
    settings: "/settings",
    compliance: "/compliance",
    program: "/program",
    home: "/home",
    users: "/users",
    help: "/help",
    docs: "/docs",
    eld: "/eld",
    insurance: "/safety/insurance",
    "work-orders": "/work-orders",
    "driver-hub": "/driver-hub",
    "cash-advances": "/cash-advances",
    tasks: "/tasks",
    admin: "/admin",
  };
  return mapped[folder] ?? `/${folder}`;
}

// 1. Shared writers clamp.
const headers = [
  "apps/frontend/src/components/layout/PageHeader.tsx",
  "apps/frontend/src/components/forms/shared/PageHeader.tsx",
  "apps/frontend/src/components/shared/BackButton.tsx",
  "apps/frontend/src/components/layout/BackArrowHeader.tsx",
];
for (const f of headers) {
  const src = strip(read(f));
  if (!/inModuleBackHref/.test(src)) {
    fails.push(`${f}: back writer must call inModuleBackHref`);
  }
  if (/navigate\(\s*-1\s*\)|history\.back\s*\(/.test(src)) {
    fails.push(`${f}: history-back is forbidden`);
  }
}

const helper = read("apps/frontend/src/lib/structuralBreadcrumb.ts");
if (!/export function inModuleBackHref/.test(helper)) {
  fails.push("structuralBreadcrumb.ts must export inModuleBackHref");
}

// 2. Page literals: backHref / backTo / fallbackTo must share the page's module prefix.
const BACK_RE = /\b(?:backHref|backTo|fallbackTo)\s*=\s*["'](\/[^"']*)["']/g;
const pages = walk("apps/frontend/src/pages");
let scanned = 0;
let crossed = 0;
for (const f of pages) {
  const src = strip(read(f));
  const pageMod = fileModulePrefix(f);
  if (!pageMod) continue;
  if (/\/pages\/legal\/(PrivacyPolicyPage|TermsOfServicePage)\.tsx$/.test(f.replace(/\\/g, "/"))) continue;
  let m;
  BACK_RE.lastIndex = 0;
  while ((m = BACK_RE.exec(src))) {
    scanned += 1;
    const target = m[1];
    if (target === "/" || target === "") {
      fails.push(`${f}: back target ${target} leaves ${pageMod}`);
      crossed += 1;
      continue;
    }
    const targetMod = modulePrefix(target);
    if (!targetMod || targetMod !== pageMod) {
      fails.push(`${f}: back target ${target} (${targetMod ?? "none"}) leaves ${pageMod}`);
      crossed += 1;
    }
  }
}

// 3. Manifest: structural parent of each sample path stays in the same module.
const manifest = read("apps/frontend/src/routes/manifest.tsx");
const pathLiterals = new Set();
for (const m of manifest.matchAll(/path\s*=\s*["']([^"']+)["']/g)) pathLiterals.add(m[1]);
for (const m of manifest.matchAll(/path:\s*["']([^"']+)["']/g)) pathLiterals.add(m[1]);

function samplePath(routePath) {
  return routePath
    .split("/")
    .map((seg) => {
      if (!seg.startsWith(":")) return seg;
      if (/id|uuid/i.test(seg)) return "11111111-1111-4111-8111-111111111111";
      if (/number|load/i.test(seg)) return "13561";
      return "sample";
    })
    .join("/");
}

function structuralParentLite(pathname) {
  const pathOnly = pathname.split("?")[0] || pathname;
  const segs = pathOnly.split("/").filter(Boolean);
  if (segs.length === 0) return "/home";
  if (segs.length === 1) return `/${segs[0]}`;
  return `/${segs.slice(0, -1).join("/")}`;
}

let manifestChecked = 0;
for (const raw of pathLiterals) {
  if (raw.includes("*") || raw === "/" || raw === "") continue;
  const sample = samplePath(raw);
  const pageMod = modulePrefix(sample);
  if (!pageMod) continue;
  const parent = structuralParentLite(sample);
  const parentMod = modulePrefix(parent);
  manifestChecked += 1;
  if (parentMod && parentMod !== pageMod) {
    fails.push(`manifest ${raw}: parent ${parent} (${parentMod}) leaves ${pageMod}`);
  }
}

if (fails.length) {
  console.error(`${LABEL}: FAIL (${fails.length})\n  ${fails.join("\n  ")}`);
  process.exit(1);
}

console.log(
  `${LABEL}: PASS — ${headers.length} writers clamp inModuleBackHref; ${scanned} page back literals in-module; ${manifestChecked} manifest routes keep parent prefix; ${crossed} cross-module`,
);

function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest(LABEL, [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-600) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}

if (process.argv.includes("--selftest")) selftest();
