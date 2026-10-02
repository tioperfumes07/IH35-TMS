#!/usr/bin/env node
/**
 * verify-factoring-submission-queue-routed.mjs — FACT-PAR1 CI guard (step 995)
 *
 * Locks: SubmissionQueue.tsx is reachable — imported by routes/manifest.tsx at
 * `/factoring/submit`, and FactoringHome exposes a deep-link (NOT a SUBNAV tab) so
 * architectural Factoring tab count is unchanged (Rule 05 / never-delete-only-add).
 *
 * Usage:
 *   node scripts/verify-factoring-submission-queue-routed.mjs
 *   node scripts/verify-factoring-submission-queue-routed.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-submission-queue-routed";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const QUEUE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const ROUTE_MANIFEST = "apps/frontend/src/router/route-manifest.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ manifest, home, queue, routeManifest }) {
  const f = [];

  if (!queue) f.push(`${QUEUE}: missing`);

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else {
    // OWNER LAW 2026-10-02 competing-engine audit (#24002): ONE purchase engine. The batch queue is retired as a writer;
    // /factoring/submit stays a live URL (Rule 07 — old links keep working) and lands on the canonical Submit Invoice tab.
    if (!/path=["']\/factoring\/submit["'][\s\S]{0,200}<Navigate to="\/factoring\/submit-invoice" replace \/>/.test(manifest)) {
      f.push(`${MANIFEST}: /factoring/submit must stay mounted and redirect to the canonical /factoring/submit-invoice tab`);
    }
    if (!/path=["']\/factoring\/submit-invoice["']/.test(manifest)) {
      f.push(`${MANIFEST}: the canonical /factoring/submit-invoice route is missing`);
    }
  }

  if (!home) {
    f.push(`${HOME}: missing`);
  } else {
    if (!/to=\{?["'`]\/factoring\/submit(-invoice)?["'`]\}?/.test(home) && !/FACTORING_TAB_PATH\.submit_invoice/.test(home)) {
      f.push(`${HOME}: must deep-link to the Submit Invoice tab (/factoring/submit-invoice)`);
    }
    if (!/factoring-submit-to-factor-link/.test(home)) {
      f.push(`${HOME}: must expose data-testid="factoring-submit-to-factor-link"`);
    }
    // SUBNAV must NOT gain a submit_to_factor tab (arch design has no such tab).
    const subnavMatch = home.match(/const SUBNAV\s*=\s*\[([\s\S]*?)\]\s*as const/);
    if (!subnavMatch) {
      f.push(`${HOME}: SUBNAV array missing — cannot verify tab count lock`);
    } else if (/submit_to_factor|Submit to Factor/.test(subnavMatch[1])) {
      f.push(
        `${HOME}: SUBNAV must not add "Submit to Factor" tab — use header deep-link (Rule 05 arch tab lock)`
      );
    }
  }

  if (!routeManifest) {
    f.push(`${ROUTE_MANIFEST}: missing`);
  } else if (!/path:\s*["']\/factoring\/submit["']/.test(routeManifest)) {
    f.push(`${ROUTE_MANIFEST}: ROUTE_MANIFEST must include /factoring/submit`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    manifest: read(MANIFEST),
    home: read(HOME),
    queue: read(QUEUE),
    routeManifest: read(ROUTE_MANIFEST),
  });
}

if (process.argv.includes("--selftest")) {
  const goodManifest = `
    <Route path="/factoring/submit-invoice" element={<ProtectedRoute><FactoringHomePage /></ProtectedRoute>} />
    <Route
      path="/factoring/submit"
      element={<Navigate to="/factoring/submit-invoice" replace />}
    />
  `;
  const goodHome = `
    const SUBNAV = [
      { id: "reserve_tracker", label: "Reserve Tracker" },
      { id: "recourse_pipeline", label: "Recourse Pipeline" },
    ] as const;
    <Link to={FACTORING_TAB_PATH.submit_invoice} data-testid="factoring-submit-to-factor-link">Submit to Factor</Link>
  `;
  const goodRouteManifest = `{ path: "/factoring/submit", label: "Submit to Factor", module: "factoring" },`;
  const bad = check({
    manifest: "no queue",
    home: 'const SUBNAV = [{ id: "submit_to_factor", label: "Submit to Factor" }] as const;',
    queue: null,
    routeManifest: "",
  });
  if (bad.length < 3) {
    console.error(`${LABEL} SELFTEST FAIL: expected multiple failures, got ${bad.length}`);
    process.exit(1);
  }
  const ok = check({
    manifest: goodManifest,
    home: goodHome,
    queue: "export function SubmissionQueue() {}",
    routeManifest: goodRouteManifest,
  });
  if (ok.length) {
    console.error(`${LABEL} SELFTEST FAIL:\n${ok.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
