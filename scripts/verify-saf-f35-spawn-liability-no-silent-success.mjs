#!/usr/bin/env node
/**
 * SAF-F35 / CLS-SILENT-SUCCESS — spawn-liability must not return 2xx success with a null id
 * while the UI toasts success.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-saf-f35-spawn-liability-no-silent-success";
const ROUTE = join(ROOT, "apps/backend/src/safety/safety.routes.ts");
const DRAWER = join(ROOT, "apps/frontend/src/components/safety/AccidentReportDrawer.tsx");

function audit(routeSrc, drawerSrc) {
  const problems = [];
  // Backend must not return a bare payload with null id as the success path.
  if (/spawn-liability[\s\S]{0,1200}return\s+\{\s*accident_id:[\s\S]{0,200}spawned_liability_id:\s*null/.test(routeSrc)) {
    problems.push("route still returns { spawned_liability_id: null } as a success payload (silent success)");
  }
  if (!/reply\.code\(422\)/.test(routeSrc) || !/spawn_liability_not_implemented/.test(routeSrc)) {
    problems.push("route must fail-closed with HTTP 422 + error spawn_liability_not_implemented");
  }
  if (/Spawn liability requested/.test(drawerSrc) && /success/.test(drawerSrc)) {
    // success toast with that exact string is the old defect
    if (/pushToast\(\s*"Spawn liability requested"\s*,\s*"success"\s*\)/.test(drawerSrc)) {
      problems.push('UI still toasts "Spawn liability requested" as success');
    }
  }
  if (!/FINANCIAL-HOLD/.test(drawerSrc)) {
    problems.push("UI must disclose FINANCIAL-HOLD / not-live when spawn liability cannot create a row");
  }
  return problems;
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), "saf-f35-"));
  try {
    const badRoute = join(tmp, "route.ts");
    const badDrawer = join(tmp, "drawer.tsx");
    copyFileSync(ROUTE, badRoute);
    copyFileSync(DRAWER, badDrawer);
    // Plant old defect shapes
    writeFileSync(
      badRoute,
      readFileSync(badRoute, "utf8").replace(
        /return reply\.code\(422\)\.send\(\{[\s\S]*?\}\);/,
        "return { accident_id: params.data.id, spawned_liability_id: null };",
      ),
    );
    writeFileSync(
      badDrawer,
      readFileSync(badDrawer, "utf8").replace(
        /pushToast\(\s*[\s\S]*?FINANCIAL-HOLD[\s\S]*?"error"\s*\)/,
        'pushToast("Spawn liability requested", "success")',
      ),
    );
    const hits = audit(readFileSync(badRoute, "utf8"), readFileSync(badDrawer, "utf8"));
    if (hits.length < 2) {
      console.error(`${LABEL}: selftest FAIL — planted defects not caught (${hits.length}): ${hits.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: selftest PASS — planted silent-success caught`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = audit(readFileSync(ROUTE, "utf8"), readFileSync(DRAWER, "utf8"));
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — spawn-liability fails closed; UI does not toast success on null id`);
}

main();
