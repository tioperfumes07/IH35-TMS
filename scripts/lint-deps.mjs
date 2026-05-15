#!/usr/bin/env node
/**
 * Workspace-aware dependency sanity checks (lint-deps v2):
 * - `apps/backend/src` imports must exist in `apps/backend/package.json` OR repo root `package.json`.
 * - Certain TS-only peer typings must exist in `apps/backend/package.json` (ex: `@types/luxon`).
 * - `scripts/` imports must exist in repo root `package.json`.
 * - `apps/frontend` + `apps/driver-pwa` imports must exist in each app's own package.json.
 */
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const BUILTINS = new Set(
  builtinModules.flatMap((m) => [m, m.startsWith("node:") ? m : `node:${m}`])
);

const IMPORT_FROM_RE = /\bfrom\s+["']([^"']+)["']/g;
const IMPORT_SIDE_RE = /\bimport\s+["']([^"']+)["']/g;
const IMPORT_DYNAMIC_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

const EXT_OK = new Set([".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs"]);

/** Root runtime deps allowed without a static import (CLI/transitive / migration tooling). */
const IGNORE_UNUSED_ROOT_RUNTIME = new Set(["drizzle-orm", "oslo"]);

/** Backend peer typings that must be declared in `apps/backend/package.json` for isolated installs. */
const BACKEND_PEER_TYPE_PACKAGES = new Map([["luxon", "@types/luxon"]]);

function readPkg(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function declaredKeys(pkgJson) {
  return new Set([
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.devDependencies ?? {}),
  ]);
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else if (EXT_OK.has(path.extname(ent.name))) acc.push(p);
  }
  return acc;
}

function toPackageName(spec) {
  if (!spec) return null;
  if (spec.startsWith("node:")) return null;
  if (spec.startsWith("@/")) return null;
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("@ih35/")) return null;

  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return spec.split("/")[0] ?? null;
}

function collectImportedPackages(roots) {
  const imported = new Set();
  const files = roots.flatMap((dir) => walkFiles(dir));

  for (const file of files) {
    const txt = fs.readFileSync(file, "utf8");
    const scan = (re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(txt))) {
        const spec = m[1];
        const pkgName = toPackageName(spec);
        if (!pkgName) continue;
        if (BUILTINS.has(pkgName) || BUILTINS.has(`node:${pkgName}`)) continue;
        imported.add(pkgName);
      }
    };
    scan(IMPORT_FROM_RE);
    scan(IMPORT_SIDE_RE);
    scan(IMPORT_DYNAMIC_RE);
    scan(REQUIRE_RE);
  }

  return imported;
}

function reportMissing(label, missing) {
  if (missing.length === 0) return false;
  console.error(`\n[lint-deps] (${label}) Missing package.json entries for imported modules:\n`);
  missing.forEach((name) => console.error(`  - ${name}`));
  console.error("");
  return true;
}

export async function runLintDeps(root = process.cwd()) {
  const ROOT = root;

  const rootPkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(rootPkgPath)) {
    console.error(`[lint-deps] Missing root package.json at ${rootPkgPath}`);
    return false;
  }

  const rootPkg = readPkg(rootPkgPath);
  const rootDeclared = declaredKeys(rootPkg);

  const frontendPkgPath = path.join(ROOT, "apps/frontend/package.json");
  const driverPkgPath = path.join(ROOT, "apps/driver-pwa/package.json");
  const backendPkgPath = path.join(ROOT, "apps/backend/package.json");

  const frontendPkg = fs.existsSync(frontendPkgPath) ? readPkg(frontendPkgPath) : { dependencies: {}, devDependencies: {} };
  const driverPkg = fs.existsSync(driverPkgPath) ? readPkg(driverPkgPath) : { dependencies: {}, devDependencies: {} };
  const backendPkg = fs.existsSync(backendPkgPath) ? readPkg(backendPkgPath) : { dependencies: {}, devDependencies: {} };

  const frontendDeclared = declaredKeys(frontendPkg);
  const driverDeclared = declaredKeys(driverPkg);
  const backendDeclared = declaredKeys(backendPkg);

  const backendImported = collectImportedPackages([path.join(ROOT, "apps/backend/src")]);
  const scriptsImported = collectImportedPackages([path.join(ROOT, "scripts")]);

  const frontendImported = collectImportedPackages([path.join(ROOT, "apps/frontend/src")]);
  const driverImported = collectImportedPackages([path.join(ROOT, "apps/driver-pwa/src")]);

  let failed = false;

  const backendAllowed = new Set([...backendDeclared, ...rootDeclared]);
  failed |= reportMissing(
    "apps/backend/src (must be declared in apps/backend/package.json OR repo root package.json)",
    [...backendImported].filter((name) => !backendAllowed.has(name)).sort()
  );

  const backendPeerTypeIssues = [];
  for (const [pkg, typesPkg] of BACKEND_PEER_TYPE_PACKAGES.entries()) {
    if (backendImported.has(pkg) && !backendDeclared.has(typesPkg)) {
      backendPeerTypeIssues.push(`${typesPkg} (peer typings for imported "${pkg}" must be listed in apps/backend/package.json)`);
    }
  }
  failed |= reportMissing("apps/backend TypeScript peer typings", backendPeerTypeIssues.sort());

  failed |= reportMissing(
    "scripts/ (must be declared in repo root package.json)",
    [...scriptsImported].filter((name) => !rootDeclared.has(name)).sort()
  );

  failed |= reportMissing(
    "apps/frontend",
    [...frontendImported].filter((name) => !frontendDeclared.has(name)).sort()
  );

  failed |= reportMissing(
    "apps/driver-pwa",
    [...driverImported].filter((name) => !driverDeclared.has(name)).sort()
  );

  const rootUsageImported = new Set([...backendImported, ...scriptsImported]);

  const unusedRootRuntime = Object.keys(rootPkg.dependencies ?? {})
    .filter((name) => !name.startsWith("@types/"))
    .filter((name) => !IGNORE_UNUSED_ROOT_RUNTIME.has(name))
    .filter((name) => !rootUsageImported.has(name))
    .sort();

  if (unusedRootRuntime.length > 0) {
    console.error(
      "\n[lint-deps] Root runtime dependencies not referenced under apps/backend/src or scripts/:\n"
    );
    unusedRootRuntime.forEach((name) => console.error(`  - ${name}`));
    console.error(
      "\nMove UI-only deps into apps/*/package.json or remove dead entries from the root manifest.\n"
    );
    failed = true;
  }

  const unusedFrontendRuntime = Object.keys(frontendPkg.dependencies ?? {})
    .filter((name) => !frontendImported.has(name))
    .sort();

  if (unusedFrontendRuntime.length > 0) {
    console.error("\n[lint-deps] Frontend runtime dependencies not referenced under apps/frontend/src:\n");
    unusedFrontendRuntime.forEach((name) => console.error(`  - ${name}`));
    console.error("");
    failed = true;
  }

  const unusedDriverRuntime = Object.keys(driverPkg.dependencies ?? {})
    .filter((name) => !driverImported.has(name))
    .sort();

  if (unusedDriverRuntime.length > 0) {
    console.error("\n[lint-deps] Driver PWA runtime dependencies not referenced under apps/driver-pwa/src:\n");
    unusedDriverRuntime.forEach((name) => console.error(`  - ${name}`));
    console.error("");
    failed = true;
  }

  if (!failed) {
    console.log(
      `[lint-deps] OK — backend=${backendImported.size}, scripts=${scriptsImported.size}, frontend=${frontendImported.size}, driver=${driverImported.size}.`
    );
  }

  return !failed;
}

const here = path.resolve(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invoked && here === invoked;

if (isMain) {
  const ok = await runLintDeps(process.cwd());
  process.exit(ok ? 0 : 1);
}
