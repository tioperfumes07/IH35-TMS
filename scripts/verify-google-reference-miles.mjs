#!/usr/bin/env node
// DSP-48 (owner ruling 2026-09-05, "LAW §2 row: Google distance = REFERENCE ONLY"). This guard
// enforces the one thing that actually matters about this feature: the reference path can NEVER
// touch a real money-adjacent miles field. Source-scan, comments masked.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-google-reference-miles";

const REFERENCE_FILES = [
  "apps/backend/src/integrations/google/routes-api-client.ts",
  "apps/backend/src/integrations/google/route-reference.routes.ts",
  "apps/backend/src/dispatch/google-reference-miles.service.ts",
];
const MILES_STRIP = "apps/frontend/src/pages/dispatch/components/book-load-v4/MilesStrip.tsx";
const CRON = "apps/backend/src/cron/google-reference-miles-expiry-cron.ts";
const INDEX = "apps/backend/src/index.ts";

// The exact fields a reference path must never write. "miles_deadhead" is intentionally NOT in
// this list -- the Empty-leg reference is a distinct, still-open extension (see the service's
// own REMAINING note); when it lands it will need the same boundary, but nothing computes it yet.
const FORBIDDEN_MONEY_FIELDS = ["miles_practical", "miles_shortest", "driver_pay", "linehaul", "rate_per_mile", "ratePerMile", "settlement"];

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  const files = {};
  for (const rel of [...REFERENCE_FILES, MILES_STRIP, CRON, INDEX]) {
    try {
      files[rel] = read(rel, root);
    } catch {
      problems.push(`missing ${rel}`);
    }
  }
  if (problems.length) return problems;

  // 1. The reference path (backend) never writes a money-adjacent miles/pay field.
  for (const rel of REFERENCE_FILES) {
    const src = files[rel];
    for (const field of FORBIDDEN_MONEY_FIELDS) {
      if (src.includes(field)) {
        problems.push(`${rel}: must never reference "${field}" — the Google reference path is comparison-only (LAW §2), never money`);
      }
    }
  }

  // 2. The wizard's display of the reference figure is read-only: no onChange/input wired to it,
  // and the money-field names above never appear anywhere near the googleReferencePractical
  // render block.
  const stripSrc = files[MILES_STRIP];
  if (!/googleReferencePractical/.test(stripSrc)) {
    problems.push(`${MILES_STRIP}: must accept a googleReferencePractical prop and render it — reference miles must actually reach the wizard, not just exist in the backend`);
  }
  const blockMatch = stripSrc.match(/\{googleReferencePractical \? \(([\s\S]*?)\) : null\}/);
  if (!blockMatch) {
    problems.push(`${MILES_STRIP}: googleReferencePractical must be rendered as a plain conditional block (never a form control)`);
  } else {
    const block = blockMatch[1];
    if (/<input|onChange|onPracticalChange|onShortestChange/.test(block)) {
      problems.push(`${MILES_STRIP}: the Google reference line must be read-only — no <input>, onChange, or miles-mutating handler inside it`);
    }
    for (const field of FORBIDDEN_MONEY_FIELDS) {
      if (block.includes(field)) {
        problems.push(`${MILES_STRIP}: the Google reference render block must never reference "${field}"`);
      }
    }
    if (!/title="Google car routing — reference only"/.test(block)) {
      problems.push(`${MILES_STRIP}: the Google reference line must carry the hover label "Google car routing — reference only"`);
    }
  }

  // 3. Expiry job exists and is actually registered (a guard file with no wiring proves nothing).
  if (!/export function initializeGoogleReferenceMilesExpiryCron/.test(files[CRON])) {
    problems.push(`${CRON}: must export initializeGoogleReferenceMilesExpiryCron`);
  }
  if (!/expireStaleGoogleReferenceMiles/.test(files[CRON])) {
    problems.push(`${CRON}: must call expireStaleGoogleReferenceMiles`);
  }
  if (!/interval '30 days'/.test(files["apps/backend/src/dispatch/google-reference-miles.service.ts"])) {
    problems.push("apps/backend/src/dispatch/google-reference-miles.service.ts: expiry must be exactly 30 days (Google ToS)");
  }
  if (!/initializeGoogleReferenceMilesExpiryCron\(app\)/.test(files[INDEX])) {
    problems.push(`${INDEX}: initializeGoogleReferenceMilesExpiryCron must actually be called at boot, not just importable`);
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

  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  const GOOD = {
    "apps/backend/src/integrations/google/routes-api-client.ts": `export async function computeRouteReference() { return null; }`,
    "apps/backend/src/integrations/google/route-reference.routes.ts": `export async function registerRouteReferenceRoutes() {}`,
    "apps/backend/src/dispatch/google-reference-miles.service.ts": `export async function computeAndPersistLoadRouteReference() {}\nexport async function expireStaleGoogleReferenceMiles() { return client.query("WHERE x < now() - interval '30 days'"); }`,
    [MILES_STRIP]: [
      `export function MilesStrip({ googleReferencePractical = null }) {`,
      `  return (`,
      `    <div>`,
      `      {googleReferencePractical ? (`,
      `        <p title="Google car routing — reference only">Google ref {googleReferencePractical.miles} mi</p>`,
      `      ) : null}`,
      `    </div>`,
      `  );`,
      `}`,
    ].join("\n"),
    [CRON]: [
      `export function initializeGoogleReferenceMilesExpiryCron(app) {`,
      `  expireStaleGoogleReferenceMiles();`,
      `}`,
    ].join("\n"),
    [INDEX]: `initializeGoogleReferenceMilesExpiryCron(app);`,
  };

  function writeFixture(tmpRoot, overrides = {}) {
    for (const [rel, content] of Object.entries(GOOD)) {
      const full = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, overrides[rel] ?? content);
    }
  }

  const cases = [
    { name: "good fixture", overrides: {}, expectProblems: 0 },
    {
      name: "reference path writes into miles_practical (the exact regression class this guard exists to catch)",
      overrides: {
        "apps/backend/src/dispatch/google-reference-miles.service.ts": `export async function computeAndPersistLoadRouteReference(form) { form.setValue("miles_practical", 100); }\nexport async function expireStaleGoogleReferenceMiles() { return client.query("WHERE x < now() - interval '30 days'"); }`,
      },
      expectProblems: 1,
    },
    {
      name: "wizard renders reference miles inside an editable input",
      overrides: {
        [MILES_STRIP]: [
          `export function MilesStrip({ googleReferencePractical = null }) {`,
          `  return (`,
          `    <div>`,
          `      {googleReferencePractical ? (`,
          `        <input title="Google car routing — reference only" value={googleReferencePractical.miles} onChange={() => {}} />`,
          `      ) : null}`,
          `    </div>`,
          `  );`,
          `}`,
        ].join("\n"),
      },
      expectProblems: 1,
    },
    {
      name: "expiry cron never actually registered at boot",
      overrides: { [INDEX]: `// nothing here` },
      expectProblems: 1,
    },
    {
      name: "wizard prop never wired at all",
      overrides: {
        [MILES_STRIP]: `export function MilesStrip() { return <div />; }`,
      },
      expectProblems: 2,
    },
  ];

  for (const { name, overrides, expectProblems } of cases) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "google-reference-miles-guard-"));
    try {
      writeFixture(tmpRoot, overrides);
      const problems = collectProblems(tmpRoot);
      if (problems.length !== expectProblems) {
        console.error(
          `${LABEL} SELFTEST FAIL: case "${name}" expected ${expectProblems} problem(s), got ${problems.length}: ${JSON.stringify(problems)}`
        );
        process.exit(1);
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
  console.log(`${LABEL} SELFTEST OK (${cases.length}/${cases.length} cases)`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — Google reference miles never touch money fields; the wizard shows them read-only; the 30-day expiry cron is wired`);
}
