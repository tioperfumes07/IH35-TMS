#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i += 1;
      continue;
    }
    args[key] = "true";
  }
  return args;
}

function fail(message) {
  console.error(`verify:accounting-autoload-coverage FAIL: ${message}`);
  process.exit(1);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseExpectedEndpoints(smokeScriptContent) {
  const endpointMatches = [...smokeScriptContent.matchAll(/name:\s*"([^"]+)"[\s\S]*?path:\s*"([^"]+)"/g)];
  if (endpointMatches.length === 0) {
    fail("could not extract endpoint list from smoke script");
  }
  return endpointMatches.map(([, name, routePath]) => ({
    name,
    method: "GET",
    path: routePath,
  }));
}

function collectRouteFiles(rootDir, extension) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(extension) && /\.routes\./.test(entry.name)) {
        out.push(fullPath);
      }
    }
  }
  if (!fs.existsSync(rootDir)) return out;
  walk(rootDir);
  return out;
}

function fileContainsRoute(fileSource, endpoint) {
  const escapedPath = escapeRegex(endpoint.path);
  const patterns = [
    new RegExp(`app\\.get\\(\\s*["'\`]${escapedPath}["'\`]`, "m"),
    new RegExp(`method\\s*:\\s*["'\`]GET["'\`][\\s\\S]{0,400}url\\s*:\\s*["'\`]${escapedPath}["'\`]`, "m"),
    new RegExp(`url\\s*:\\s*["'\`]${escapedPath}["'\`][\\s\\S]{0,400}method\\s*:\\s*["'\`]GET["'\`]`, "m"),
  ];
  return patterns.some((pattern) => pattern.test(fileSource));
}

function verifyRoot({ rootDir, extension, endpoints, rootLabel }) {
  const routeFiles = collectRouteFiles(rootDir, extension);
  if (routeFiles.length === 0) {
    fail(`${rootLabel}: no ${extension} route files found under ${path.relative(ROOT, rootDir)}`);
  }

  const sources = routeFiles.map((filePath) => ({
    filePath,
    source: fs.readFileSync(filePath, "utf8"),
  }));

  const missing = [];
  for (const endpoint of endpoints) {
    const foundIn = sources.find((file) => fileContainsRoute(file.source, endpoint));
    if (!foundIn) {
      missing.push(`${endpoint.method} ${endpoint.path} (${endpoint.name})`);
    }
  }

  if (missing.length > 0) {
    fail(`${rootLabel}: missing endpoints:\n${missing.map((line) => `  - ${line}`).join("\n")}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const smokeScriptPath = args["smoke-script"]
    ? path.resolve(args["smoke-script"])
    : path.resolve(ROOT, "scripts/smoke-tests/accounting-endpoints-e2e.ts");
  const srcRoot = args["src-root"] ? path.resolve(args["src-root"]) : path.resolve(ROOT, "apps/backend/src/accounting");
  const distRoot = args["dist-root"] ? path.resolve(args["dist-root"]) : path.resolve(ROOT, "dist/accounting");

  const smokeScript = readRequired(smokeScriptPath);
  const expectedEndpoints = parseExpectedEndpoints(smokeScript);

  verifyRoot({
    rootDir: srcRoot,
    extension: ".ts",
    endpoints: expectedEndpoints,
    rootLabel: "src",
  });
  verifyRoot({
    rootDir: distRoot,
    extension: ".js",
    endpoints: expectedEndpoints,
    rootLabel: "dist",
  });

  console.log(`verify:accounting-autoload-coverage OK (${expectedEndpoints.length} endpoints in src+dist)`);
}

main();
