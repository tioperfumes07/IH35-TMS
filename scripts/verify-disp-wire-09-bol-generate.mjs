#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-09 — BOL generate is wired end-to-end, not orphaned on Pod Review only.
 *
 * FAIL if:
 *   (a) POST /api/v1/dispatch/loads/:loadId/bol/generate missing or not calling generateAndStoreBol
 *   (b) generateAndStoreBol does not INSERT dispatch.bol_documents
 *   (c) registerDispatchPodBolRoutes not mounted from apps/backend/src/index.ts
 *   (d) FE generateLoadBol client missing
 *   (e) LoadBolPanel missing bol-generate-button / not used on PodReview + LoadDetailDrawer
 *
 * Mutation-tested both directions.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leaves":["dispatch.panel.load_bol"],"task":"DRV-F6209-BOL-SHARED-DRIVER-LABEL","vertical":"class-sweep"}
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-wire-09-bol-generate";

const PATHS = {
  routes: "apps/backend/src/dispatch/pod.routes.ts",
  service: "apps/backend/src/dispatch/bol-generator.service.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/frontend/src/api/dispatch.ts",
  panel: "apps/frontend/src/components/dispatch/LoadBolPanel.tsx",
  podReview: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function auditBolWire(sources) {
  const problems = [];
  const routes = sources.routes ?? "";
  const service = sources.service ?? "";
  const index = sources.index ?? "";
  const api = sources.api ?? "";
  const panel = sources.panel ?? "";
  const podReview = sources.podReview ?? "";
  const drawer = sources.drawer ?? "";

  if (!/\/api\/v1\/dispatch\/loads\/:loadId\/bol\/generate/.test(routes)) {
    problems.push(`${PATHS.routes}: missing POST bol/generate route`);
  }
  if (!/generateAndStoreBol\s*\(/.test(routes)) {
    problems.push(`${PATHS.routes}: bol/generate does not call generateAndStoreBol`);
  }
  if (!/INSERT\s+INTO\s+dispatch\.bol_documents/i.test(service)) {
    problems.push(`${PATHS.service}: generateAndStoreBol path does not INSERT dispatch.bol_documents`);
  }
  if (!/export\s+async\s+function\s+generateAndStoreBol/.test(service)) {
    problems.push(`${PATHS.service}: generateAndStoreBol export missing`);
  }
  if (!/driver_company_authorizations bol_driver_dca[\s\S]{0,320}bol_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}bol_driver_dca\.is_authorized = true[\s\S]{0,180}bol_driver_dca\.deactivated_at IS NULL/.test(service)) {
    problems.push(`${PATHS.service}: BOL driver label must accept active company authorization`);
  }
  if (!/registerDispatchPodBolRoutes/.test(index)) {
    problems.push(`${PATHS.index}: registerDispatchPodBolRoutes not mounted`);
  }
  if (!/function\s+generateLoadBol|export\s+function\s+generateLoadBol/.test(api)) {
    problems.push(`${PATHS.api}: generateLoadBol client missing`);
  }
  if (!/bol\/generate/.test(api)) {
    problems.push(`${PATHS.api}: generateLoadBol does not POST bol/generate`);
  }
  if (!/data-testid=["']bol-generate-button["']/.test(panel)) {
    problems.push(`${PATHS.panel}: missing data-testid=bol-generate-button`);
  }
  if (!/generateLoadBol/.test(panel)) {
    problems.push(`${PATHS.panel}: LoadBolPanel does not call generateLoadBol`);
  }
  if (!/<LoadBolPanel\b/.test(podReview)) {
    problems.push(`${PATHS.podReview}: Pod Review must mount <LoadBolPanel /> (entry kept)`);
  }
  if (!/<LoadBolPanel\b/.test(drawer)) {
    problems.push(
      `${PATHS.drawer}: Load Detail drawer Documents tab must mount <LoadBolPanel /> — ` +
        `EntityLink /dispatch/loads/:id is the canonical load path; BOL cannot live only on pod-review`,
    );
  }

  return problems;
}

function realSources() {
  return Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
}

function mutate(src, from, to, label) {
  const out = typeof from === "string" ? src.replace(from, to) : src.replace(from, to);
  if (out === src) throw new Error(`mutation "${label}" did not apply`);
  return out;
}

function selftest() {
  const failures = [];
  const real = realSources();
  const clean = auditBolWire(real);
  if (clean.length) failures.push(`case0 FAIL: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "route removed",
      run: () =>
        auditBolWire({
          ...real,
          routes: mutate(real.routes, "/api/v1/dispatch/loads/:loadId/bol/generate", "/api/v1/dispatch/loads/:loadId/bol/MISSING", "route"),
        }),
      expect: "missing POST bol/generate",
    },
    {
      label: "INSERT removed",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(
            real.service,
            /INSERT\s+INTO\s+dispatch\.bol_documents/i,
            "INSERT INTO dispatch.NOT_BOL_DOCS",
            "insert",
          ),
        }),
      expect: "INSERT dispatch.bol_documents",
    },
    {
      label: "shared-driver authorization removed",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(real.service, "bol_driver_dca.is_authorized = true", "bol_driver_dca.is_authorized = false", "driver auth"),
        }),
      expect: "active company authorization",
    },
    {
      label: "drawer mount removed",
      run: () =>
        auditBolWire({
          ...real,
          drawer: mutate(real.drawer, /<LoadBolPanel\b/, "<LoadBolGONE", "drawer"),
        }),
      expect: "Load Detail drawer",
    },
    {
      label: "panel button removed",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(real.panel, 'data-testid="bol-generate-button"', 'data-testid="bol-generate-GONE"', "btn"),
        }),
      expect: "bol-generate-button",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = c.run();
    } catch (err) {
      failures.push(`${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(`${c.label} NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  }

  if (failures.length) {
    console.error(`${LABEL}: SELFTEST FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditBolWire(realSources());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — bol/generate → generateAndStoreBol → bol_documents; FE LoadBolPanel on PodReview + LoadDetailDrawer`,
  );
}

main();
