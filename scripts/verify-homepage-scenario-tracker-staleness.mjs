#!/usr/bin/env node
/**
 * Homepage Scenario Tracker FE — staleness heartbeat + entity chips + no storage (§8).
 * Cursor even claim: 2382.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-homepage-scenario-tracker-staleness";
const SELFTEST = process.argv.includes("--selftest");

const HOME = "apps/frontend/src/pages/home/scenario-tracker/ScenarioTrackerHome.tsx";
const STALE = "apps/frontend/src/pages/home/scenario-tracker/staleness.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SPEC = "docs/specs/HOMEPAGE-LIVE-SCENARIO-TRACKER-BUILD-SPEC-2026-08-04.md";

export function collectProblems(root = ROOT) {
  const problems = [];
  const readRel = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const home = readRel(HOME);
  const stale = readRel(STALE);
  const manifest = readRel(MANIFEST);
  const spec = readRel(SPEC);

  if (!spec) problems.push(`missing ${SPEC}`);
  if (!stale) {
    problems.push(`missing ${STALE}`);
  } else {
    if (!/ageSeconds\s*>\s*2\s*\*\s*maxAge/.test(stale)) {
      problems.push(`${STALE}: must enforce ageSeconds > 2 * maxAge`);
    }
    if (!/fetchFailed/.test(stale)) problems.push(`${STALE}: must treat fetch failure as STALE`);
    if (!/sourceHealth|failedSources/.test(stale)) {
      problems.push(`${STALE}: must treat source_health.ok=false as STALE`);
    }
  }

  if (!home) {
    problems.push(`missing ${HOME}`);
  } else {
    if (!/POLL_MS\s*=\s*20_000/.test(home)) problems.push(`${HOME}: must poll every 20s (POLL_MS = 20_000)`);
    if (!/scenario-tracker-stale-banner/.test(home)) problems.push(`${HOME}: missing stale banner testid`);
    if (!/TRANSP/.test(home) || !/USMCA/.test(home) || !/TRK/.test(home)) {
      problems.push(`${HOME}: must offer TRANSP/USMCA/TRK entity chips`);
    }
    if (/localStorage|sessionStorage/.test(home)) {
      problems.push(`${HOME}: must not use localStorage/sessionStorage`);
    }
    if (!/scenario-tracker-home/.test(home)) problems.push(`${HOME}: missing scenario-tracker-home testid`);
  }

  if (!manifest) {
    problems.push(`missing ${MANIFEST}`);
  } else {
    if (!/ScenarioTrackerHome/.test(manifest)) {
      problems.push(`${MANIFEST}: must mount ScenarioTrackerHome`);
    }
    if (!/path=\"\/home\/scenario-tracker\"/.test(manifest)) {
      problems.push(
        `${MANIFEST}: must mount Scenario Tracker at /home/scenario-tracker until GUARD live switch of /home`,
      );
    }
    if (!/path=\"\/home\/ops\"/.test(manifest)) {
      problems.push(`${MANIFEST}: must keep /home/ops for prior role dashboards (never-delete)`);
    }
  }

  const api = readRel("apps/frontend/src/pages/home/scenario-tracker/api.ts");
  if (!api) {
    problems.push("missing apps/frontend/src/pages/home/scenario-tracker/api.ts");
  } else if (!/\/api\/v1\/home\/scenario-tracker/.test(api)) {
    problems.push("api.ts: must call GET /api/v1/home/scenario-tracker (CC-1 path lock)");
  }

  return problems;
}

if (SELFTEST) {
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".st-home-selftest-"));
  try {
    const mk = (rel, body) => {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    mk(SPEC, "# stub\n");
    mk(
      STALE,
      "export function x(){ if (ageSeconds > 2 * maxAge) {} if (fetchFailed) {} if (failedSources) {} }\n",
    );
    mk(
      HOME,
      'const POLL_MS = 20_000; data-testid="scenario-tracker-stale-banner"; TRANSP USMCA TRK; scenario-tracker-home\n',
    );
    mk(MANIFEST, 'ScenarioTrackerHome; path="/home/scenario-tracker"; path="/home/ops"\n');
    mk("apps/frontend/src/pages/home/scenario-tracker/api.ts", 'return "/api/v1/home/scenario-tracker";\n');
    const good = collectProblems(tmp);
    mk(HOME, "const POLL_MS = 999; no banner\n");
    const bad = collectProblems(tmp);
    if (good.length !== 0 || bad.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL`, { good, bad });
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST OK`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Scenario Tracker homepage staleness + entity chips wired`);
