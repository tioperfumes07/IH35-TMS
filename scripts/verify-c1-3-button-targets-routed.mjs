#!/usr/bin/env node
/**
 * Static guard: C1-3 dead-end buttons stay wired.
 *
 * Audit finding C1-3 (Frontend/Routing): three live buttons dead-ended to Home because their
 * `to=` targets had no matching route in the manifest — two orphan pages (FraudAlertsListPage,
 * DriverLayoverHistory) that existed but were never routed, plus one path typo
 * (/maintenance/severe-repair-oos instead of /maintenance/severe-repairs).
 *
 * This guard fails CI if any of the three known button targets regresses: either the source link
 * reverts to a bad path, or its target route disappears from the manifest. Per locked rule:
 * "every bug fix gets a static CI guard."
 *
 * 2026-08-21 (CC-3): the Layovers check's `linkMustContain` was a literal href string
 * (`"/dispatch/layovers/driver/"`), but DriverProfilePage.tsx was since upgraded to route through
 * the centralized `EntityLink kind="driver_layover_history"` registry instead of a hardcoded href —
 * the registry (`components/shared/EntityLink.tsx`) resolves that kind to the exact same
 * `/dispatch/layovers/driver/${id}` path, so the button was never actually dead; the guard's literal
 * string match just went stale. `linkMustContainAny` (either shape counts as satisfied) fixes this
 * without weakening the check for a genuine regression on either shape.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-c1-3-button-targets-routed";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function loadRoutePaths(root) {
  const manifest = readFileSync(path.join(root, MANIFEST), "utf8");
  const routePaths = new Set();
  const pathRe = /path=["'`](\/[a-zA-Z0-9_\-/:*]*)["'`]/g;
  let pm;
  while ((pm = pathRe.exec(manifest))) routePaths.add(pm[1]);
  return routePaths;
}

// Each check: the source file must contain `linkMustContain` (or, if `linkMustContainAny` is set,
// at least one of those alternate shapes), must NOT contain `linkMustNotContain` (guards the typo),
// and the manifest must declare `route`.
const CHECKS = [
  {
    name: "Fuel Home → Fraud Alerts",
    file: "apps/frontend/src/pages/fuel/FuelHome.tsx",
    linkMustContain: 'to="/fuel/fraud-alerts"',
    route: "/fuel/fraud-alerts",
  },
  {
    name: "Home Fleet Restore card → Severe Repairs OOS",
    file: "apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx",
    linkMustContain: 'to="/maintenance/severe-repairs"',
    linkMustNotContain: "/maintenance/severe-repair-oos",
    route: "/maintenance/severe-repairs",
  },
  {
    name: "Driver profile Layovers card → Layover history",
    file: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    // Either a literal href, OR the centralized EntityLink registry kind that resolves to the exact
    // same path (components/shared/EntityLink.tsx: driver_layover_history -> /dispatch/layovers/driver/${id}).
    linkMustContainAny: ["/dispatch/layovers/driver/", 'kind="driver_layover_history"'],
    route: "/dispatch/layovers/driver/:driverId",
  },
];

function runChecks(root = ROOT) {
  const routePaths = loadRoutePaths(root);
  const errors = [];
  for (const c of CHECKS) {
    let src;
    try {
      src = readFileSync(path.join(root, c.file), "utf8");
    } catch {
      errors.push(`${c.name}: source file missing (${c.file})`);
      continue;
    }
    const candidates = c.linkMustContainAny ?? [c.linkMustContain];
    if (!candidates.some((needle) => src.includes(needle))) {
      errors.push(`${c.name}: ${c.file} no longer links to any of [${candidates.join(", ")}] (button would dead-end).`);
    }
    if (c.linkMustNotContain && src.includes(c.linkMustNotContain)) {
      errors.push(`${c.name}: ${c.file} still contains the dead path "${c.linkMustNotContain}".`);
    }
    if (!routePaths.has(c.route)) {
      errors.push(`${c.name}: manifest has no route for "${c.route}" — button target is orphaned.`);
    }
  }
  return errors;
}

function selftest() {
  const live = runChecks();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red:\n${live.map((e) => `  ✗ ${e}`).join("\n")}`);
    process.exit(1);
  }
  const tmp = fs_mkdtemp();
  try {
    // Poison 1: strip both alternate shapes from the layover file — must fail.
    const layoverAbs = path.join(tmp, CHECKS[2].file);
    mkdirAndWrite(layoverAbs, readFileSync(path.join(ROOT, CHECKS[2].file), "utf8")
      .replaceAll("/dispatch/layovers/driver/", "")
      .replaceAll('kind="driver_layover_history"', ""));
    copyOthers(tmp, [CHECKS[0].file, CHECKS[1].file, MANIFEST]);
    const poisoned = runChecks(tmp);
    if (!poisoned.some((e) => e.includes("Driver profile Layovers card"))) {
      console.error(`${LABEL} SELFTEST FAIL — stripping both link shapes not caught`);
      process.exit(1);
    }
  } finally {
    rmrf(tmp);
  }
  // Confirm the EntityLink-only shape (no literal href) is still accepted — that's the real-world
  // shape today, and this is the mutation this fix exists to stop being a false positive on.
  const entityLinkOnlySrc = readFileSync(path.join(ROOT, CHECKS[2].file), "utf8");
  if (!entityLinkOnlySrc.includes('kind="driver_layover_history"')) {
    console.error(`${LABEL} SELFTEST FAIL — expected the live file to use the EntityLink kind shape`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — catches a real dead-end, accepts either the literal href or the EntityLink kind shape`);
}

// --- tiny fs helpers (no external deps) ---
import fs from "node:fs";
function fs_mkdtemp() {
  return fs.mkdtempSync(path.join(ROOT, "scripts", ".c1-3-button-targets-selftest-"));
}
function mkdirAndWrite(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
function copyOthers(tmp, relFiles) {
  for (const rel of relFiles) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, readFileSync(path.join(ROOT, rel), "utf8"));
  }
}
function rmrf(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of fails) console.error(`  ✗ ${e}`);
  console.error("\nFix: keep each button's link path in sync with a real manifest route (do not reintroduce the typo).");
  process.exit(1);
}
console.log(`${LABEL}: OK — ${CHECKS.length} button targets routed.`);
