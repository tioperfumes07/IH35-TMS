#!/usr/bin/env node
/**
 * verify-program-matrix-system-querykey-disambiguate.mjs
 * LV-SYSTEM-MATRIX-LEAVES-NOT-ITERABLE
 *
 * All-modules rollup (scope=system) and the System *module* board (module=system)
 * MUST NOT share a React Query cache key. A shared key lets the rollup payload
 * (no iterable `leaves`) poison the module board → ErrorBoundary crash.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-program-matrix-system-querykey-disambiguate";
const PREVIEW = "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx";
const SYSTEM = "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const preview = read(PREVIEW);
  const system = read(SYSTEM);

  // Preview: per-module key must include a "module" discriminator + moduleId
  if (!/queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*"module"\s*,\s*moduleId\s*\]/.test(preview)) {
    failures.push(
      'ModuleMatrixPreviewPage must use queryKey ["program","module-matrix","module",moduleId]',
    );
  }
  // Forbidden: bare moduleId as third segment (collides when moduleId==="system")
  if (/queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*moduleId\s*\]/.test(preview)) {
    failures.push(
      "ModuleMatrixPreviewPage must not use bare moduleId as the third queryKey segment (collides with system rollup)",
    );
  }

  // liveOk / liveByLeaf must refuse non-array leaves (defense in depth)
  if (!/liveOk[\s\S]{0,120}Array\.isArray\(\s*live\.leaves\s*\)/.test(preview)) {
    failures.push("liveOk must require Array.isArray(live.leaves)");
  }
  if (!/liveByLeaf[\s\S]{0,200}Array\.isArray\(\s*live\.leaves\s*\)/.test(preview)) {
    failures.push("liveByLeaf must guard Array.isArray(live.leaves) before for-of");
  }
  if (!/Array\.isArray\(\s*map\?\.leaves\s*\)\s*\?\s*map\.leaves/.test(preview)) {
    failures.push("buildRows must Array.isArray-guard map.leaves before for-of");
  }

  // System rollup: scope discriminator
  if (!/queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*"scope"\s*,\s*"system"\s*\]/.test(system)) {
    failures.push(
      'ModuleMatrixSystemView must use queryKey ["program","module-matrix","scope","system"]',
    );
  }
  if (/queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*"system"\s*\]/.test(system)) {
    failures.push(
      'ModuleMatrixSystemView must not use colliding queryKey ["program","module-matrix","system"]',
    );
  }

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const previewPath = path.join(process.cwd(), PREVIEW);
  const systemPath = path.join(process.cwd(), SYSTEM);
  const previewOrig = fs.readFileSync(previewPath, "utf8");
  const systemOrig = fs.readFileSync(systemPath, "utf8");
  try {
    const badPreview = previewOrig.replace(
      /queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*"module"\s*,\s*moduleId\s*\]/,
      'queryKey: ["program", "module-matrix", moduleId]',
    );
    const badSystem = systemOrig.replace(
      /queryKey:\s*\[\s*"program"\s*,\s*"module-matrix"\s*,\s*"scope"\s*,\s*"system"\s*\]/,
      'queryKey: ["program", "module-matrix", "system"]',
    );
    if (badPreview === previewOrig) fail("selftest could not plant colliding preview queryKey");
    if (badSystem === systemOrig) fail("selftest could not plant colliding system queryKey");
    fs.writeFileSync(previewPath, badPreview);
    fs.writeFileSync(systemPath, badSystem);
    const planted = analyze();
    if (
      !planted.some((m) => /bare moduleId|colliding|scope/.test(m)) ||
      planted.length < 2
    ) {
      fail(`selftest planted collision but analyze missed it: ${JSON.stringify(planted)}`);
    }
    console.log(`${LABEL} --selftest OK (planted collision detected)`);
  } finally {
    fs.writeFileSync(previewPath, previewOrig);
    fs.writeFileSync(systemPath, systemOrig);
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze();
  if (failures.length) {
    for (const m of failures) console.error(`${LABEL} FAIL: ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — system rollup and system module board queryKeys are disambiguated`);
}

main();
