#!/usr/bin/env node
/**
 * CROSS-PACKAGE-IMPORTS-RESOLVE — FAIL when @ih35/shared-types barrel exports a missing file
 * or when apps/** imports a named symbol not exported from the package source files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cross-package-imports-resolve";
const SHARED_INDEX = path.join(ROOT, "packages/shared-types/src/index.ts");
const SHARED_SRC = path.join(ROOT, "packages/shared-types/src");
const APPS_ROOT = path.join(ROOT, "apps");

const IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']@ih35\/shared-types["']/g;
const EXPORT_STAR_RE = /export\s+\*\s+from\s+["']\.\/([^"']+)["']/g;
const EXPORT_SYM_RE = /export\s+(?:async\s+)?function\s+(\w+)|export\s+(?:const|type|enum)\s+(\w+)/g;

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function resolveExportPath(rel) {
  const base = rel.replace(/\.js$/, "");
  for (const ext of [".ts", ".tsx"]) {
    const p = path.join(SHARED_SRC, `${base}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function collectExportedSymbols() {
  const indexSrc = read(SHARED_INDEX);
  const symbols = new Set();
  const fails = [];

  for (const m of indexSrc.matchAll(EXPORT_STAR_RE)) {
    const resolved = resolveExportPath(m[1]);
    if (!resolved) {
      fails.push(`packages/shared-types/src/index.ts exports missing file: ./${m[1]}`);
      continue;
    }
    const src = read(resolved);
    for (const em of src.matchAll(EXPORT_SYM_RE)) {
      symbols.add(em[1] || em[2]);
    }
  }
  return { symbols, fails };
}

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walkTsFiles(p, out);
    } else if (/\.(tsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseNamedImports(spec) {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      return m ? m[1] : part.split(/\s+/)[0];
    })
    .filter(Boolean);
}

export function assertCrossPackageImportsResolve() {
  const fails = [];
  const { symbols, fails: barrelFails } = collectExportedSymbols();
  fails.push(...barrelFails);

  if (!symbols.has("getOfficeTransitionButtons")) {
    fails.push("packages/shared-types must export getOfficeTransitionButtons (LoadDetailDrawer dependency)");
  }

  for (const file of walkTsFiles(APPS_ROOT)) {
    const src = read(file);
    for (const m of src.matchAll(IMPORT_RE)) {
      for (const sym of parseNamedImports(m[1])) {
        if (!symbols.has(sym)) {
          fails.push(`${path.relative(ROOT, file)} imports "${sym}" — not exported from @ih35/shared-types`);
        }
      }
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = assertCrossPackageImportsResolve();
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — current tree should pass`);
    for (const f of good) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  const indexBackup = read(SHARED_INDEX);
  const badIndex = indexBackup.replace(
    "./dispatch/load-state-machine.js",
    "./dispatch/missing-fake-module.js"
  );
  fs.writeFileSync(SHARED_INDEX, badIndex);
  try {
    const planted = assertCrossPackageImportsResolve();
    if (!planted.some((f) => f.includes("missing file"))) {
      console.error(`${LABEL} SELFTEST FAIL — planted missing export not detected`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(SHARED_INDEX, indexBackup);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = assertCrossPackageImportsResolve();
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
