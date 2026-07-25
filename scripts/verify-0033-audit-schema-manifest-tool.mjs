#!/usr/bin/env node
/**
 * ACCT-R-02 — verify-0033-audit-schema-manifest-tool
 *
 * ROOT DEFECT: scripts/audit-schema.mjs and docs/schema/SCHEMA-MANIFEST.json were never built.
 * The substitute verify-backend-schema-contract.mjs is migration-file-only and blind to prod drift.
 *
 * THIS GUARD (CI-static, no live DB required):
 *   1. scripts/audit-schema.mjs exists and exports live pull + validate helpers
 *   2. docs/schema/SCHEMA-MANIFEST.json exists with live-introspection metadata (not migration-parsed)
 *   3. verify-backend-schema-contract.mjs header documents the static/live split
 *
 * --selftest plants a migration-parsed fake manifest and asserts validateManifest FAILS,
 * then asserts the committed manifest PASSES.
 *
 *   node scripts/verify-0033-audit-schema-manifest-tool.mjs
 *   node scripts/verify-0033-audit-schema-manifest-tool.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-0033-audit-schema-manifest-tool";
const AUDIT_SCRIPT = path.join(ROOT, "scripts/audit-schema.mjs");
const MANIFEST_PATH = path.join(ROOT, "docs/schema/SCHEMA-MANIFEST.json");
const STATIC_CONTRACT = path.join(ROOT, "scripts/verify-backend-schema-contract.mjs");

const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertToolingPresent(root = ROOT) {
  const problems = [];
  const auditPath = path.join(root, "scripts/audit-schema.mjs");
  const manifestPath = path.join(root, "docs/schema/SCHEMA-MANIFEST.json");
  const staticPath = path.join(root, "scripts/verify-backend-schema-contract.mjs");

  if (!fs.existsSync(auditPath)) {
    problems.push("missing scripts/audit-schema.mjs — live-Neon-pull manifest generator not built");
    return problems;
  }

  const auditSrc = fs.readFileSync(auditPath, "utf8");
  if (!/--database-url/.test(auditSrc)) {
    problems.push("audit-schema.mjs must require explicit --database-url (§1.5, no .env auto-connect)");
  }
  if (!/pullLiveSchema/.test(auditSrc)) {
    problems.push("audit-schema.mjs must export pullLiveSchema for live introspection");
  }
  if (!/bypass_rls/.test(auditSrc)) {
    problems.push("audit-schema.mjs must SET app.bypass_rls='lucia' for RLS-immune introspection");
  }
  if (!/pg_catalog|information_schema/.test(auditSrc)) {
    problems.push("audit-schema.mjs must query pg_catalog/information_schema, not parse migrations");
  }
  if (!/SCHEMA-MANIFEST\.json/.test(auditSrc)) {
    problems.push("audit-schema.mjs must write docs/schema/SCHEMA-MANIFEST.json");
  }

  if (!fs.existsSync(manifestPath)) {
    problems.push("missing docs/schema/SCHEMA-MANIFEST.json — run audit-schema.mjs against Neon");
    return problems;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    problems.push(`docs/schema/SCHEMA-MANIFEST.json is not valid JSON: ${e.message}`);
    return problems;
  }

  if (!fs.existsSync(staticPath)) {
    problems.push("missing scripts/verify-backend-schema-contract.mjs");
  } else {
    const staticSrc = fs.readFileSync(staticPath, "utf8");
    if (!/STATIC|migration.*parse|live.*split|audit-schema/i.test(staticSrc)) {
      problems.push(
        "verify-backend-schema-contract.mjs header must document static (migration-parse) vs live (audit-schema) split"
      );
    }
  }

  return problems;
}

export function assertManifestValid(manifest, validateFn) {
  return validateFn(manifest);
}

async function loadValidateFn() {
  const mod = await import(pathToFileURL(AUDIT_SCRIPT).href);
  if (typeof mod.validateManifest !== "function") {
    throw new Error(`${LABEL}: audit-schema.mjs must export validateManifest`);
  }
  return mod.validateManifest;
}

function runSelftest(validateManifest) {
  const failures = [];

  // 1) migration-parsed fake must FAIL validateManifest
  const fakeMigrationParsed = {
    note: "Parses all migration SQL files",
    source: "migration-parsed baseline",
    branch: "fake",
    as_of: "2020-01-01T00:00:00Z",
    database: { name: "fake", host: "local" },
    relations: { "accounting.bills": { kind: "table", columns: [], foreign_keys: [] } },
    summary: { relation_count: 1, column_count: 0 },
  };
  const fakeProblems = validateManifest(fakeMigrationParsed);
  if (fakeProblems.length === 0) {
    failures.push("selftest: migration-parsed fake manifest must FAIL validateManifest");
  }
  if (!fakeProblems.some((p) => /migration-parsed|information_schema|pg_catalog/i.test(p))) {
    failures.push("selftest: fake manifest rejection must mention live-introspection requirement");
  }

  // 2) missing relations must FAIL
  const noRels = {
    source: "pg_catalog + information_schema",
    branch: "br-fake",
    as_of: "2020-01-01T00:00:00Z",
    database: { name: "fake", host: "local" },
    relations: {},
    summary: { relation_count: 0 },
  };
  if (validateManifest(noRels).length === 0) {
    failures.push("selftest: empty relations must FAIL validateManifest");
  }

  // 3) committed manifest must PASS tooling + validate
  const toolProblems = assertToolingPresent();
  if (toolProblems.length) {
    failures.push(`selftest: live tree tooling incomplete: ${toolProblems[0]}`);
  } else {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const manifestProblems = validateManifest(manifest);
    if (manifestProblems.length) {
      failures.push(`selftest: committed manifest must PASS: ${manifestProblems[0]}`);
    }
  }

  // 4) assertToolingPresent must catch absent audit-schema.mjs
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-audit-schema-selftest-"));
  try {
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "docs/schema"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "scripts/verify-backend-schema-contract.mjs"), "// STATIC vs live split\n");
    const absentProblems = assertToolingPresent(tmp);
    if (!absentProblems.some((p) => /audit-schema\.mjs/.test(p))) {
      failures.push("selftest: assertToolingPresent must fail when audit-schema.mjs is absent");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — migration-parsed fake FAILS; committed manifest + tooling PASS`);
}

async function main() {
  const validateManifest = await loadValidateFn();

  if (SELFTEST) {
    runSelftest(validateManifest);
    return;
  }

  const problems = assertToolingPresent();
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const manifestProblems = validateManifest(manifest);
  if (manifestProblems.length) {
    console.error(`${LABEL} FAILED — manifest shape (${manifestProblems.length}):`);
    for (const p of manifestProblems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `${LABEL} OK — audit-schema.mjs + SCHEMA-MANIFEST.json present ` +
      `(${manifest.summary.relation_count} relations, branch ${manifest.branch}, as_of ${manifest.as_of})`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`${LABEL} FAILED — ${e.message}`);
    process.exit(1);
  });
}
