#!/usr/bin/env node
// L.0 (OWNER-ISSUE-INVENTORY-2026-09-05.md #3, owner order 2026-09-05, surrendered Cursor -> CC-2
// 14:00Z): "Gate does not run the Render build command | pnpm gate != tsc -b && vite build."
//
// render.yaml's frontend service builds with `cd apps/frontend && npm install && npm run build`,
// and that "build" script (apps/frontend/package.json) is
// `generate-module-completion-data.mjs && tsc -b && vite build`. Before this guard, CI's
// "Frontend tsc -b" step and scripts/verify-local-ci.mjs both ran ONLY the tsc half — a pure
// Vite/Rollup failure (bad dynamic import, plugin error, asset resolution) could stay green on
// every gate and only surface as a Render build_failed alert. This guard pins that BOTH the CI
// workflow and the local verify:local-ci pipeline actually invoke `vite build`, not just `tsc -b`.
//
// node scripts/verify-render-build-parity-wired.mjs
// node scripts/verify-render-build-parity-wired.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-render-build-parity-wired";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const LOCAL_CI = "scripts/verify-local-ci.mjs";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const ci = readRel(root, CI_WORKFLOW);
  if (!ci) {
    problems.push(`missing ${CI_WORKFLOW}`);
  } else if (!/apps\/frontend[\s\S]{0,40}(npx vite build|npm run build)\b/.test(ci)) {
    problems.push(`${CI_WORKFLOW}: no step runs the actual frontend Vite/Rollup build (vite build) — tsc -b alone is not Render build-command parity`);
  }

  const localCi = readRel(root, LOCAL_CI);
  if (!localCi) {
    problems.push(`missing ${LOCAL_CI}`);
  } else if (!/(npx vite build|npm run build)\b/.test(localCi)) {
    problems.push(`${LOCAL_CI}: verify:local-ci does not run the frontend vite build — its "full build-typecheck reproduced" claim is incomplete without it`);
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "render-build-parity-guard-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, path.dirname(CI_WORKFLOW)), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, path.dirname(LOCAL_CI)), { recursive: true });
    // Planted stub: exactly the pre-fix shape — tsc -b only, no vite build, on both files.
    fs.writeFileSync(
      path.join(tmpRoot, CI_WORKFLOW),
      `- name: Frontend tsc -b\n  run: cd apps/frontend && npx tsc -b --pretty false\n`
    );
    fs.writeFileSync(path.join(tmpRoot, LOCAL_CI), `spawnSync("npx", ["tsc", "-b"], { cwd: "apps/frontend" });\n`);
    const planted = collectProblems(tmpRoot);
    if (planted.length !== 2) {
      console.error(
        `${LABEL} SELFTEST FAIL: expected 2 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`
      );
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — CI and verify:local-ci both run the actual Vite/Rollup build, matching Render's frontend build command`);
}
