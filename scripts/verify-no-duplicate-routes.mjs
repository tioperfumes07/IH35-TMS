#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    srcRoot: path.resolve(ROOT, "apps/backend/src"),
    autoloadRoot: path.resolve(ROOT, "apps/backend/src/accounting"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) continue;
    if (key === "--src-root") args.srcRoot = path.resolve(value);
    if (key === "--autoload-root") args.autoloadRoot = path.resolve(value);
    i += 1;
  }
  return args;
}

// Mirrors apps/backend/tsconfig.json's build "exclude" list so this src-based scan sees exactly
// the files that end up in the compiled dist/ output (test files never manually register routes
// in production; scanning them would only produce false-positive duplicates). Tested against the
// path RELATIVE TO srcRoot, never the absolute path — an absolute-path check would false-positive
// on any srcRoot that happens to be nested under a "__tests__" directory itself (e.g. this guard's
// own scripts/__tests__/fixtures/ test fixtures).
function isExcludedFromBuild(filePath, srcRoot) {
  const rel = path.relative(srcRoot, filePath);
  return (
    /\.test\.ts$/.test(rel) ||
    /\.integration\.test\.ts$/.test(rel) ||
    /\.deprecated\.ts$/.test(rel) ||
    /(^|[\\/])__tests__[\\/]/.test(rel)
  );
}

function extractBalancedBlock(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(openIndex + 1, i);
    }
  }
  return "";
}

function extractRouteDefsFromBody(body) {
  const routes = [];
  const directRouteRegex = /app\.(get|post|put|patch|delete|options|head)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of body.matchAll(directRouteRegex)) {
    routes.push({ method: match[1].toUpperCase(), url: match[2] });
  }

  const objectRouteRegex = /app\.route\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const match of body.matchAll(objectRouteRegex)) {
    const obj = match[1];
    const methodMatch = obj.match(/method\s*:\s*["'`]([A-Za-z]+)["'`]/);
    const urlMatch = obj.match(/url\s*:\s*["'`]([^"'`]+)["'`]/);
    if (methodMatch && urlMatch) {
      routes.push({ method: methodMatch[1].toUpperCase(), url: urlMatch[1] });
    }
  }

  return routes;
}

function parseRouteFunctionsInFile(filePath, source) {
  const result = new Map();
  const fnRegex = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*app\b/g;
  for (const match of source.matchAll(fnRegex)) {
    const fnName = match[1];
    const bodyStart = source.indexOf("{", match.index);
    if (bodyStart < 0) continue;
    const body = extractBalancedBlock(source, bodyStart);
    const routes = extractRouteDefsFromBody(body);
    if (routes.length > 0) {
      result.set(fnName, routes);
    }
  }
  return result;
}

function collectRouteFunctions(autoloadRoot) {
  const files = walkFiles(autoloadRoot).filter(
    (filePath) => filePath.endsWith(".routes.ts") && !isExcludedFromBuild(filePath, autoloadRoot)
  );
  const functionRoutes = new Map();
  const autoloadRegistrations = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const fnMap = parseRouteFunctionsInFile(filePath, source);
    for (const [fnName, routes] of fnMap.entries()) {
      functionRoutes.set(fnName, routes);
    }

    if (!/export\s+default\s+fp\(/.test(source)) continue;
    const defaultCalls = [...source.matchAll(/await\s+([A-Za-z0-9_]+)\(\s*app\s*\)/g)].map((m) => m[1]);
    for (const fnName of defaultCalls) {
      const routes = fnMap.get(fnName);
      if (!routes) continue;
      for (const route of routes) {
        autoloadRegistrations.push({
          ...route,
          source: `autoload:${path.relative(ROOT, filePath)}`,
          functionName: fnName,
        });
      }
    }
  }

  return { functionRoutes, autoloadRegistrations };
}

function collectManualRegistrations(srcRoot, functionRoutes) {
  const files = walkFiles(srcRoot).filter(
    (filePath) =>
      filePath.endsWith(".ts") && !filePath.endsWith(".routes.ts") && !isExcludedFromBuild(filePath, srcRoot)
  );
  const registrations = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const calls = [...source.matchAll(/await\s+([A-Za-z0-9_]+)\(\s*app\s*\)/g)].map((m) => m[1]);
    for (const fnName of calls) {
      const routes = functionRoutes.get(fnName);
      if (!routes) continue;
      for (const route of routes) {
        registrations.push({
          ...route,
          source: `manual:${path.relative(ROOT, filePath)}`,
          functionName: fnName,
        });
      }
    }
  }
  return registrations;
}

export function findDuplicateRoutes({ srcRoot, autoloadRoot }) {
  const { functionRoutes, autoloadRegistrations } = collectRouteFunctions(autoloadRoot);
  const manualRegistrations = collectManualRegistrations(srcRoot, functionRoutes);
  const all = [...autoloadRegistrations, ...manualRegistrations];

  const byKey = new Map();
  for (const item of all) {
    const key = `${item.method} ${item.url}`;
    const existing = byKey.get(key) ?? [];
    existing.push(item);
    byKey.set(key, existing);
  }

  const duplicates = [...byKey.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      items,
    }));

  return { duplicates, registrations: all };
}

function main() {
  const { srcRoot, autoloadRoot } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(srcRoot)) {
    console.error(`verify:no-duplicate-routes FAIL: src root not found: ${path.relative(ROOT, srcRoot)}`);
    process.exit(1);
  }
  if (!fs.existsSync(autoloadRoot)) {
    console.error(`verify:no-duplicate-routes FAIL: autoload root not found: ${path.relative(ROOT, autoloadRoot)}`);
    process.exit(1);
  }

  const { duplicates } = findDuplicateRoutes({ srcRoot, autoloadRoot });
  if (duplicates.length > 0) {
    console.error("verify:no-duplicate-routes FAIL: duplicate (method, url) registrations detected");
    for (const dup of duplicates) {
      console.error(`- ${dup.key}`);
      for (const item of dup.items) {
        console.error(`  - ${item.source} via ${item.functionName}`);
      }
    }
    process.exit(1);
  }

  console.log("verify:no-duplicate-routes OK (no dist/ required)");
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main();
