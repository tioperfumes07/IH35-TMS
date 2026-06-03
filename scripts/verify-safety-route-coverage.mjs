#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_ROUTE_ROOT ?? process.cwd();
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");
const safetyDir = path.resolve(ROOT, "apps/backend/src/safety");
const reportsDir = path.resolve(ROOT, "apps/backend/src/safety/reports");

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function collectRouteFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".routes.ts"))
    .map((entry) => path.join(dir, entry.name));
}

function registrarName(source) {
  const match = source.match(/export async function (register\w+)/);
  return match?.[1] ?? null;
}

function main() {
  const indexSource = read(indexPath);
  const routeFiles = [...collectRouteFiles(safetyDir), ...collectRouteFiles(reportsDir)];
  const failures = [];

  for (const filePath of routeFiles) {
    const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const source = read(filePath);
    const registrar = registrarName(source);
    const deprecated = /^\/\/ DEPRECATED/m.test(source.trimStart());

    if (!registrar) {
      failures.push(`${rel}: missing register export`);
      continue;
    }

    const registered = indexSource.includes(`${registrar}(`);
    if (!registered && !deprecated) {
      failures.push(`${rel}: neither registered in index.ts nor marked DEPRECATED`);
    }
    if (registered && deprecated) {
      failures.push(`${rel}: marked DEPRECATED but still registered in index.ts`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:safety-route-coverage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log(`verify:safety-route-coverage OK (${routeFiles.length} modules)`);
}

main();
