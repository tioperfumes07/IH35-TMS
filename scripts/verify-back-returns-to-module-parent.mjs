#!/usr/bin/env node
/**
 * ROUND 443.254 N2 — Back = parent screen of the SAME module (route-manifest parent),
 * never browser history into another module.
 *
 * Reuses / extends verify-back-arrow-stays-in-module.mjs. Selftest plants a
 * cross-module backHref and asserts FAIL.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { reportSelftest } from "./lib/guard-selftest.mjs";

const LABEL = "verify-back-returns-to-module-parent";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INNER = path.join(ROOT, "scripts/verify-back-arrow-stays-in-module.mjs");

function runInner(cwd = ROOT, extraArgs = []) {
  return spawnSync(process.execPath, [INNER, ...extraArgs], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

const real = runInner();
if (real.status !== 0) {
  console.error(`${LABEL}: FAIL — inner verify-back-arrow-stays-in-module red\n${real.stdout || ""}${real.stderr || ""}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${String(real.stdout || "").trim()}`);

function selftest() {
  // Real tree must pass.
  const ok = runInner();
  // Plant a cross-module back on a driver-finance page → must FAIL.
  const fixture = mkdtempSync(path.join(tmpdir(), "back-module-"));
  try {
    mkdirSync(path.join(fixture, "scripts"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/pages/driver-finance"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/components/layout"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/components/forms/shared"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/components/shared"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/lib"), { recursive: true });
    mkdirSync(path.join(fixture, "apps/frontend/src/routes"), { recursive: true });
    mkdirSync(path.join(fixture, "scripts/lib"), { recursive: true });

    cpSync(INNER, path.join(fixture, "scripts/verify-back-arrow-stays-in-module.mjs"));
    cpSync(path.join(ROOT, "scripts/lib/guard-selftest.mjs"), path.join(fixture, "scripts/lib/guard-selftest.mjs"));

    const writers = [
      "apps/frontend/src/components/layout/PageHeader.tsx",
      "apps/frontend/src/components/forms/shared/PageHeader.tsx",
      "apps/frontend/src/components/shared/BackButton.tsx",
      "apps/frontend/src/components/layout/BackArrowHeader.tsx",
    ];
    for (const f of writers) {
      writeFileSync(
        path.join(fixture, f),
        `export function X() { navigate(inModuleBackHref(pathname, backHref)); }\n`,
      );
    }
    writeFileSync(
      path.join(fixture, "apps/frontend/src/lib/structuralBreadcrumb.ts"),
      `export function inModuleBackHref(a,b){return b;}\nexport function modulePrefixForPath(){return "/driver-finance";}\n`,
    );
    writeFileSync(
      path.join(fixture, "apps/frontend/src/routes/manifest.tsx"),
      `<Route path="/driver-finance/escrow/:driverId" element={null} />\n`,
    );
    // CROSS-MODULE back — must fail the guard.
    writeFileSync(
      path.join(fixture, "apps/frontend/src/pages/driver-finance/PlantedBadBack.tsx"),
      `export function PlantedBadBack() {\n  return <PageHeader backHref="/accounting/escrow" />;\n}\n`,
    );

    const planted = spawnSync(process.execPath, ["scripts/verify-back-arrow-stays-in-module.mjs"], {
      cwd: fixture,
      encoding: "utf8",
    });
    const plantedFails = planted.status !== 0;
    const mentionsCross =
      /leaves|cross-module|accounting/i.test(`${planted.stdout || ""}${planted.stderr || ""}`);

    reportSelftest(LABEL, [
      {
        name: "real repo tree passes",
        pass: ok.status === 0,
        detail: ok.status === 0 ? undefined : `${ok.stdout || ""}${ok.stderr || ""}`.slice(-600),
      },
      {
        name: "cross-module back FAILS",
        pass: plantedFails && mentionsCross,
        detail: plantedFails
          ? mentionsCross
            ? undefined
            : `exit ${planted.status} but output missing cross-module signal:\n${(planted.stdout || planted.stderr || "").slice(-400)}`
          : `expected FAIL, got exit 0:\n${(planted.stdout || "").slice(-400)}`,
      },
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) selftest();
