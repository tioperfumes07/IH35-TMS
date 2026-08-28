#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const service = read("apps/backend/src/dispatch/assignments/quicksave.service.ts");

function scopedWriterFailures(source) {
  const issues = [];
  for (const { label, setColumn, result } of [
    { label: "unit", setColumn: "assigned_unit_id", result: "unitUpdate" },
    { label: "driver", setColumn: "assigned_primary_driver_id", result: "driverUpdate" },
  ]) {
    const pattern = new RegExp(
      `const ${result} = await client\\.query<\\{ id: string \\}>\\([\\s\\S]*?` +
        `SET ${setColumn} = \\$2, updated_at = now\\(\\)[\\s\\S]*?` +
        `WHERE id = \\$1 AND operating_company_id = \\$3::uuid[\\s\\S]*?` +
        `RETURNING id[\\s\\S]*?input\\.operating_company_id[\\s\\S]*?` +
        `if \\(!${result}\\.rows\\[0\\]\\) throw new Error\\("E_LOAD_NOT_FOUND"\\)`
    );
    if (!pattern.test(source)) issues.push(`${label} quicksave must scope and check the canonical load UPDATE`);
  }
  return issues;
}

const writerIssues = scopedWriterFailures(service);
for (const issue of writerIssues) fail(issue);

if (process.argv.includes("--selftest")) {
  if (writerIssues.length) throw new Error(`clean failed: ${writerIssues.join("; ")}`);
  const mutations = [
    service.replace("WHERE id = $1 AND operating_company_id = $3::uuid", "WHERE id = $1"),
    service.replaceAll("WHERE id = $1 AND operating_company_id = $3::uuid", "WHERE id = $1"),
    service.replace("if (!unitUpdate.rows[0])", "if (false)"),
    service.replace("if (!driverUpdate.rows[0])", "if (false)"),
    service.replace("[input.load_uuid, input.unit_uuid, input.operating_company_id]", "[input.load_uuid, input.unit_uuid]"),
    service.replace("[input.load_uuid, input.driver_uuid, input.operating_company_id]", "[input.load_uuid, input.driver_uuid]"),
  ];
  const escaped = mutations.filter((fixture) => scopedWriterFailures(fixture).length === 0);
  if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} mutations escaped`);
  console.log(`verify:assignments-quicksave SELFTEST PASS — ${mutations.length}/${mutations.length}`);
  process.exit(0);
}
contains("apps/backend/src/dispatch/assignments/quicksave.service.ts", service, [
  { pattern: /reassignUnit/, label: "reassignUnit" },
  { pattern: /reassignDriver/, label: "reassignDriver" },
  { pattern: /prior_value/, label: "audit prior_value" },
]);

const routes = read("apps/backend/src/dispatch/assignments/quicksave.routes.ts");
contains("apps/backend/src/dispatch/assignments/quicksave.routes.ts", routes, [
  { pattern: /assign-unit/, label: "assign-unit route" },
  { pattern: /assign-driver/, label: "assign-driver route" },
  { pattern: /registerDispatchAssignmentsQuicksaveRoutes/, label: "route registration export" },
]);

const index = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", index, [
  { pattern: /registerDispatchAssignmentsQuicksaveRoutes/, label: "routes bootstrapped in index" },
]);

read("apps/backend/src/dispatch/assignments/__tests__/quicksave.test.ts");
read("apps/frontend/src/lib/optimisticPatch.ts");
read("apps/frontend/src/components/dispatch/InlineUnitPicker.tsx");
read("apps/frontend/src/components/dispatch/InlineDriverPicker.tsx");
read("apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx");

const dispatchList = read("apps/frontend/src/components/dispatch/DispatchList.tsx");
contains("apps/frontend/src/components/dispatch/DispatchList.tsx", dispatchList, [
  { pattern: /InlineUnitPicker/, label: "inline unit picker wired" },
  { pattern: /InlineDriverPicker/, label: "inline driver picker wired" },
  { pattern: /inlineQuicksaveEnabled/, label: "inline quicksave flag" },
]);

const dispatchBoard = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
contains("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", dispatchBoard, [
  { pattern: /inlineQuicksaveEnabled/, label: "DispatchBoard enables inline quicksave" },
]);

const docs = read("docs/specs/gap-8-assignments-quicksave.md");
contains("docs/specs/gap-8-assignments-quicksave.md", docs, [
  { pattern: /GAP-8/, label: "GAP-8 identifier" },
  { pattern: /assign-unit/, label: "routes documented" },
]);

const manifest = read(".block-ready/GAP-8.json");
contains(".block-ready/GAP-8.json", manifest, [
  { pattern: /GAP-8/, label: "GAP-8 block id in per-block manifest" },
]);

if (failures.length > 0) {
  console.error("verify:assignments-quicksave — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:assignments-quicksave — OK");
