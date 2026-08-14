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

const HOME = "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx";
const STALE = "apps/frontend/src/pages/program/scenario-tracker/staleness.ts";
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
    // WIRE-LIVE (owner 2026-08-05): the board must refresh ITSELF and fast. This used to pin the
    // literal 20_000, which made the required cadence un-tunable — tightening the poll to 3s (the
    // owner's "instantly + automatically" order) FAILED a guard whose only complaint was that the
    // board got fresher. Assert the intent instead: a poll of at most 20s, and background refetch so
    // a board left open on a wall display keeps moving while unfocused.
    const pollMatch = /POLL_MS\s*=\s*([0-9_]+)/.exec(home);
    const pollMs = pollMatch ? Number(pollMatch[1].replace(/_/g, "")) : NaN;
    if (!Number.isFinite(pollMs) || pollMs <= 0 || pollMs > 20_000) {
      problems.push(`${HOME}: must poll at least every 20s (found POLL_MS = ${pollMatch?.[1] ?? "none"})`);
    }
    if (!/refetchIntervalInBackground:\s*true/.test(home)) {
      problems.push(`${HOME}: must set refetchIntervalInBackground: true — an unfocused board must keep updating`);
    }
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

  const api = readRel("apps/frontend/src/pages/program/scenario-tracker/api.ts");
  if (!api) {
    problems.push("missing apps/frontend/src/pages/program/scenario-tracker/api.ts");
  } else if (!/\/api\/v1\/home\/scenario-tracker/.test(api)) {
    problems.push("api.ts: must call GET /api/v1/home/scenario-tracker (CC-1 path lock)");
  }

  // LV-115 — entity CODE (?entity=USMCA) must resolve to opco UUID; never silent ALL.
  const routes = readRel("apps/backend/src/home/home.routes.ts");
  if (!routes) {
    problems.push("missing apps/backend/src/home/home.routes.ts");
  } else {
    if (!/LV-115/.test(routes)) problems.push("home.routes.ts: missing LV-115 entity-code contract comment");
    if (!/unknown_entity/.test(routes)) problems.push("home.routes.ts: must 400 unknown_entity for unresolvable entity codes");
    if (!/upper\(code\) = upper\(\$1\)/.test(routes)) {
      problems.push("home.routes.ts: must resolve org.companies.code under caller scope");
    }
    if (!/let entity:\s*string\s*\|\s*null\s*=\s*isUuid\s*\?\s*rawEntity\s*:\s*null/.test(routes)) {
      problems.push("home.routes.ts: code-shaped entity must start null (never silent ALL) before resolve");
    }
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
      'const POLL_MS = 3000; refetchIntervalInBackground: true; data-testid="scenario-tracker-stale-banner"; TRANSP USMCA TRK; scenario-tracker-home\n',
    );
    mk(MANIFEST, 'ScenarioTrackerHome; path="/home/scenario-tracker"; path="/home/ops"\n');
    mk("apps/frontend/src/pages/program/scenario-tracker/api.ts", 'return "/api/v1/home/scenario-tracker";\n');
    mk(
      "apps/backend/src/home/home.routes.ts",
      "/* LV-115 */ let entity: string | null = isUuid ? rawEntity : null; unknown_entity; WHERE upper(code) = upper($1)\n",
    );
    const good = collectProblems(tmp);
    mk(HOME, "const POLL_MS = 60_000; refetchIntervalInBackground: true; no banner\n");
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
