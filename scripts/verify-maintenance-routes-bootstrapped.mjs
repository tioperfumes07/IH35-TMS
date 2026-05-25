#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const INDEX_PATH =
  process.env.VERIFY_MAINTENANCE_ROUTES_INDEX_PATH ??
  path.join(ROOT, "apps/backend/src/index.ts");
const MAINTENANCE_DIR =
  process.env.VERIFY_MAINTENANCE_ROUTES_DIR ??
  path.join(ROOT, "apps/backend/src/maintenance");

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function discoverMaintenanceRouteModules(maintenanceDir) {
  if (!fs.existsSync(maintenanceDir)) return [];
  return fs
    .readdirSync(maintenanceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".routes.ts"))
    .map((entry) => entry.name)
    .filter((name) => !name.includes("/scripts/__tests__/fixtures/"));
}

function parseIndexImportsAndRegistrations(indexPath) {
  const source = readSource(indexPath);
  const sf = ts.createSourceFile(indexPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importedMaintenanceFns = new Map();
  const registeredFns = new Set();

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith("./maintenance/") &&
      node.moduleSpecifier.text.endsWith(".routes.js")
    ) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.name.text;
          importedMaintenanceFns.set(importedName, node.moduleSpecifier.text);
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      if (ts.isIdentifier(firstArg) && firstArg.text === "app") {
        registeredFns.add(node.expression.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { importedMaintenanceFns, registeredFns };
}

function main() {
  const routeFiles = discoverMaintenanceRouteModules(MAINTENANCE_DIR);
  const expectedSpecifiers = new Set(routeFiles.map((name) => `./maintenance/${name.replace(".ts", ".js")}`));
  const { importedMaintenanceFns, registeredFns } = parseIndexImportsAndRegistrations(INDEX_PATH);

  const importedSpecifiers = new Set(importedMaintenanceFns.values());
  const missingModules = [...expectedSpecifiers].filter((spec) => !importedSpecifiers.has(spec));
  const unregisteredFns = [...importedMaintenanceFns.keys()].filter((fn) => !registeredFns.has(fn));
  const extraRegisteredModules = [...importedSpecifiers].filter((spec) => !expectedSpecifiers.has(spec));

  if (missingModules.length || unregisteredFns.length || extraRegisteredModules.length) {
    console.error("verify:maintenance-routes-bootstrapped FAIL");
    if (missingModules.length) {
      console.error("Missing imports in apps/backend/src/index.ts:");
      for (const modulePath of missingModules) {
        console.error(`- ${modulePath.replace("./maintenance/", "apps/backend/src/maintenance/").replace(".js", ".ts")}`);
      }
    }
    if (unregisteredFns.length) {
      console.error("Imported maintenance route functions not registered with app:");
      for (const fn of unregisteredFns) {
        console.error(`- ${fn}`);
      }
    }
    if (extraRegisteredModules.length) {
      console.error("Maintenance route imports in index.ts with no matching file in maintenance/ directory:");
      for (const modulePath of extraRegisteredModules) {
        console.error(`- ${modulePath}`);
      }
    }
    process.exit(1);
  }

  console.log("verify:maintenance-routes-bootstrapped OK");
}

main();
