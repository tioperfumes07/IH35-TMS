#!/usr/bin/env node
/**
 * 0441-mod5-suspend-non-atomic — driver suspend must use one atomic backend endpoint.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-driver-suspend-atomic";
const paths = {
  backendRoutes: path.join(ROOT, "apps/backend/src/mdata/driver-safety-events.routes.ts"),
  suspendModal: path.join(ROOT, "apps/frontend/src/components/drivers/SuspendConfirmModal.tsx"),
  mdataApi: path.join(ROOT, "apps/frontend/src/api/mdata.ts"),
  actionBarTest: path.join(ROOT, "apps/frontend/src/components/driver-profile/__tests__/ActionBar.test.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[${LABEL}] ${msg}`);
  process.exit(1);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function checkSources({ backendRoutes, suspendModal, mdataApi, actionBarTest }) {
  const failures = [];
  const executableBackendRoutes = stripComments(backendRoutes);

  const exactRateLimitDefinition =
    /^\s*const\s+RL_SUSPEND\s*=\s*\{\s*config\s*:\s*\{\s*rateLimit\s*:\s*\{\s*max\s*:\s*30\s*,\s*timeWindow\s*:\s*["']1 minute["']\s*\}\s*\}\s*\}\s*;/gm;
  const exactSuspendRouteBinding =
    /^\s*app\.post\(\s*["']\/api\/v1\/mdata\/drivers\/:driver_id\/suspend["']\s*,\s*RL_SUSPEND\s*,\s*async\s*\(/gm;

  if (countMatches(executableBackendRoutes, exactRateLimitDefinition) !== 1) {
    failures.push('backend must define exactly one RL_SUSPEND with max 30 and timeWindow "1 minute"');
  }
  if (countMatches(executableBackendRoutes, exactSuspendRouteBinding) !== 1) {
    failures.push("suspend POST must bind RL_SUSPEND directly as its route options");
  }
  if (!backendRoutes.includes("UPDATE mdata.drivers") || !backendRoutes.includes("INSERT INTO mdata.driver_safety_events")) {
    failures.push("suspend route must update driver status and insert safety event in one handler");
  }
  if (!mdataApi.includes("export function suspendDriver")) {
    failures.push("mdata API must export suspendDriver");
  }
  if (!suspendModal.includes("suspendDriver(input.driverId, input.reason)")) {
    failures.push("SuspendConfirmModal must call suspendDriver");
  }
  if (suspendModal.includes("updateDriver(driverId") || suspendModal.includes("createSafetyEvent(driverId")) {
    failures.push("SuspendConfirmModal must not use sequential updateDriver + createSafetyEvent");
  }
  if (!actionBarTest.includes("suspendDriver")) {
    failures.push("ActionBar test must cover atomic suspendDriver call");
  }

  return failures;
}

function sourcesFromTree() {
  return {
    backendRoutes: read(paths.backendRoutes),
    suspendModal: read(paths.suspendModal),
    mdataApi: read(paths.mdataApi),
    actionBarTest: read(paths.actionBarTest),
  };
}

function selftest() {
  const good = {
    backendRoutes: `
      const RL_SUSPEND = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
      app.post("/api/v1/mdata/drivers/:driver_id/suspend", RL_SUSPEND, async (req, reply) => {
        await client.query("UPDATE mdata.drivers");
        await client.query("INSERT INTO mdata.driver_safety_events");
      });
    `,
    // DRV-F7356 — the modal snapshots driver/reason/generation before await;
    // the selftest must model that safe captured scope rather than stale props.
    suspendModal: "await suspendDriver(input.driverId, input.reason);",
    mdataApi: "export function suspendDriver() {}",
    actionBarTest: "expect(mdataApi.suspendDriver).toHaveBeenCalled();",
  };

  const cleanFailures = checkSources(good);
  if (cleanFailures.length) {
    fail(`--selftest clean fixture failed: ${cleanFailures.join("; ")}`);
  }

  const plantedMissingBinding = {
    ...good,
    backendRoutes: good.backendRoutes.replace(
      'app.post("/api/v1/mdata/drivers/:driver_id/suspend", RL_SUSPEND,',
      'app.post("/api/v1/mdata/drivers/:driver_id/suspend",'
    ),
  };
  const missingBindingFailures = checkSources(plantedMissingBinding);
  if (!missingBindingFailures.some((message) => message.includes("must bind RL_SUSPEND"))) {
    fail("--selftest planted missing route binding was not detected");
  }

  const plantedWrongLimit = {
    ...good,
    backendRoutes: good.backendRoutes.replace("max: 30", "max: 31"),
  };
  const wrongLimitFailures = checkSources(plantedWrongLimit);
  if (!wrongLimitFailures.some((message) => message.includes("max 30"))) {
    fail("--selftest planted wrong rate limit was not detected");
  }

  const plantedCommentDecoy = {
    ...plantedWrongLimit,
    backendRoutes:
      '// const RL_SUSPEND = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };\n' +
      plantedWrongLimit.backendRoutes,
  };
  const commentDecoyFailures = checkSources(plantedCommentDecoy);
  if (!commentDecoyFailures.some((message) => message.includes("max 30"))) {
    fail("--selftest commented decoy masked the planted wrong rate limit");
  }

  const plantedInlineCommentDecoy = {
    ...plantedWrongLimit,
    backendRoutes: plantedWrongLimit.backendRoutes.replace(
      "max: 31",
      'max: 31 /* const RL_SUSPEND = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }; */'
    ),
  };
  const inlineCommentDecoyFailures = checkSources(plantedInlineCommentDecoy);
  if (!inlineCommentDecoyFailures.some((message) => message.includes("max 30"))) {
    fail("--selftest inline comment decoy masked the planted wrong rate limit");
  }

  const plantedMissingCapturedCall = {
    ...good,
    suspendModal: good.suspendModal.replace("suspendDriver(input.driverId, input.reason)", "Promise.resolve()"),
  };
  if (!checkSources(plantedMissingCapturedCall).some((message) => message.includes("must call suspendDriver"))) {
    fail("--selftest planted missing captured suspend call was not detected");
  }

  console.log(`[${LABEL}] --selftest OK (5/5 planted failures detected)`);
}

function main() {
  const failures = checkSources(sourcesFromTree());
  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log(`[${LABEL}] OK`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
