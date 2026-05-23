#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD_MODULE = "apps/backend/src/db/startup-migration-drift-guard.ts";
const BOOTSTRAP_FILE = "apps/backend/src/index.ts";
const MIGRATIONS_DIR = "db/migrations";

function fail(message) {
  console.error(`verify:startup-migration-drift-guard FAILED\n- ${message}`);
  process.exit(1);
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    fail(`missing required file: ${relPath}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, out);
      continue;
    }
    out.push(absolute);
  }
  return out;
}

read(GUARD_MODULE);

const bootstrap = read(BOOTSTRAP_FILE);
if (!bootstrap.includes('from "./db/startup-migration-drift-guard.js"')) {
  fail(`${BOOTSTRAP_FILE} must import startup migration drift guard`);
}

const invokeIdx = bootstrap.indexOf("await runStartupMigrationDriftGuard(");
if (invokeIdx < 0) {
  fail(`${BOOTSTRAP_FILE} must invoke runStartupMigrationDriftGuard(...)`);
}

const firstRegisterIdx = bootstrap.indexOf("await app.register(");
if (firstRegisterIdx < 0) {
  fail(`${BOOTSTRAP_FILE} missing app route registration`);
}
if (invokeIdx > firstRegisterIdx) {
  fail("startup migration drift guard must run before route registration");
}

const listenIdx = bootstrap.indexOf("await app.listen(");
if (listenIdx < 0) {
  fail(`${BOOTSTRAP_FILE} missing app.listen`);
}
if (invokeIdx > listenIdx) {
  fail("startup migration drift guard must run before app.listen()");
}

const migrationsAbs = path.join(ROOT, MIGRATIONS_DIR);
if (!fs.existsSync(migrationsAbs)) {
  fail("db/migrations directory must exist");
}
const sqlFiles = fs
  .readdirSync(migrationsAbs)
  .filter((name) => /^\d{4}[a-z]?_.+\.sql$/i.test(name));
if (sqlFiles.length === 0) {
  fail("db/migrations must contain at least one SQL migration");
}

const scanRoots = ["apps", "packages"];
const explicitFiles = ["render.yaml", ".env.example"];
const offenders = [];
const riskyPattern = /SKIP_MIGRATION_DRIFT_GUARD\s*=\s*true/;
const deploymentJsonPattern = /(deploy|render|production|prod|release)/i;

for (const root of scanRoots) {
  const abs = path.join(ROOT, root);
  for (const file of walk(abs)) {
    const text = fs.readFileSync(file, "utf8");
    if (riskyPattern.test(text)) {
      offenders.push(path.relative(ROOT, file).split(path.sep).join("/"));
    }
  }
}

for (const rel of explicitFiles) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, "utf8");
  if (riskyPattern.test(text)) offenders.push(rel);
}

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (!rel.endsWith(".json")) continue;
  if (!deploymentJsonPattern.test(path.basename(rel))) continue;
  const text = fs.readFileSync(file, "utf8");
  if (riskyPattern.test(text)) offenders.push(rel);
}

if (offenders.length > 0) {
  fail(`forbidden ${"SKIP_MIGRATION_DRIFT_GUARD=true"} found in: ${offenders.join(", ")}`);
}

console.log("verify:startup-migration-drift-guard OK");

