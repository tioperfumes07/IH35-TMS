#!/usr/bin/env node
/**
 * SAF-B31 — the two Safety surfaces that PROMISED features and rendered nothing must stay real.
 *
 * THE DEFECT THIS GUARD ASSERTS (both files were 11-line static placeholders on main @ dfff68e954):
 *   apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx
 *     "Filter by 425C section and open source event detail from each audit row."  — zero queries.
 *   apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx
 *     "Export report data to XLSX for compliance and management review."          — zero queries.
 *
 * A page that renders prose describing a feature is worse than an empty state, because an empty
 * state backed by a real query is TRUE. So this guard checks that each surface:
 *   1. issues a real useQuery against a REAL, registered backend route (route literal cross-checked
 *      against the backend source file that registers it — not just "an api import exists"),
 *   2. is entity-scoped through useCompanyContext,
 *   3. renders the shared ParityTable grammar with an honest emptyText,
 *   4. renders ListErrorState so a failed read is never shown as "no data",
 *   5. no longer contains the placeholder prose,
 *   6. never wires the stub XLSX export route (safety-reports.routes.ts renderSafetyReportXlsx()
 *      ignores company + report and writes a hardcoded ["safety.sample", 0] row — a control that
 *      downloads fabricated numbers on a compliance screen is a dead button, not an export),
 *   7. keeps both routes registered at the SAME paths (additive-only, §7).
 *
 * Self-test proves the guard FAILS against the exact pre-fix files:
 *   node scripts/verify-saf-b31-safety-placeholder-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  reportsPage: "apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx",
  audit425cPage: "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx",
  apiSafety: "apps/frontend/src/api/safety.ts",
  apiSafetyV64: "apps/frontend/src/api/safetyV64.ts",
  apiAudit: "apps/frontend/src/api/audit.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  tabsConfig: "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts",
  beCsaScores: "apps/backend/src/routes/safety/csa-scores.ts",
  beDotInspections: "apps/backend/src/routes/safety/dot-inspections.ts",
  beSafetyReports: "apps/backend/src/safety/reports/safety-reports.routes.ts",
  beAuditEventsList: "apps/backend/src/audit/audit-events-list.routes.ts",
};

/** Prose fragments that only exist in the pre-fix placeholder bodies. */
const PLACEHOLDER_PROSE = {
  [FILES.reportsPage]: [
    "Export report data to XLSX for compliance and management review.",
    "CSA, crash rate, roadside pass rate, OOS, training, and credential reports.",
  ],
  [FILES.audit425cPage]: [
    "Filter by 425C section and open source event detail from each audit row.",
    "Cross-module regulatory event history for safety and compliance records.",
  ],
};

/**
 * Each surface -> the frontend api module it must read through, and the REAL route literals that
 * module must call. Every literal is also asserted to exist in the backend file that registers it,
 * so a renamed/removed endpoint fails here instead of 404-ing in front of an operator.
 */
const SURFACES = [
  {
    page: FILES.reportsPage,
    label: "SafetyReportsPage",
    apiModules: [FILES.apiSafety, FILES.apiSafetyV64],
    routes: [
      { literal: "/api/v1/safety/reports/", apiFile: FILES.apiSafety, backendFile: FILES.beSafetyReports, backendLiteral: '"/api/v1/safety/reports/:report_id"' },
      { literal: "/api/v1/safety/dot-inspections/clean-rate", apiFile: FILES.apiSafety, backendFile: FILES.beDotInspections, backendLiteral: '"/api/v1/safety/dot-inspections/clean-rate"' },
      { literal: "/api/v1/safety/csa-scores/current", apiFile: FILES.apiSafetyV64, backendFile: FILES.beCsaScores, backendLiteral: '"/api/v1/safety/csa-scores/current"' },
      { literal: "/api/v1/safety/csa-scores?", apiFile: FILES.apiSafetyV64, backendFile: FILES.beCsaScores, backendLiteral: '"/api/v1/safety/csa-scores"' },
    ],
    // Called api functions that must appear in the page body.
    calls: ["getSafetyReportRollup", "getSafetyInspectionCleanRate", "getCurrentCsaScore", "listCsaScores"],
    minLines: 60,
  },
  {
    page: FILES.audit425cPage,
    label: "Audit425cPage",
    apiModules: [FILES.apiAudit],
    routes: [
      { literal: "/api/v1/audit/events-list", apiFile: FILES.apiAudit, backendFile: FILES.beAuditEventsList, backendLiteral: '"/api/v1/audit/events-list"' },
    ],
    calls: ["listAuditEvents"],
    minLines: 60,
  },
];

/** Routes that must stay registered at exactly these paths (ADDITIVE-ONLY, §7). */
const LOCKED_ROUTES = ['path="audit-425c"', 'path="reports"'];
const LOCKED_TAB_ROUTES = ['route: "/safety/audit-425c"', 'route: "/safety/reports"'];

/**
 * Absence checks ("this string must NOT appear") run against code with comments removed — otherwise
 * a guard cannot document the defect it forbids without tripping itself.
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`missing ${rel}`);
      return null;
    }
    return fs.readFileSync(abs, "utf8");
  };

  for (const surface of SURFACES) {
    const src = read(surface.page);
    if (src == null) continue;
    const code = stripComments(src);

    // 5. placeholder prose must be gone
    for (const prose of PLACEHOLDER_PROSE[surface.page] ?? []) {
      if (code.includes(prose)) {
        failures.push(`${surface.label}: still renders placeholder prose "${prose}" — the surface promises a feature it does not query`);
      }
    }
    if (src.split("\n").length < surface.minLines) {
      failures.push(`${surface.label}: ${src.split("\n").length} lines — too small to be a real data surface (expected >= ${surface.minLines})`);
    }

    // 1. real query
    if (!/from\s+["']@tanstack\/react-query["']/.test(src) || !src.includes("useQuery(")) {
      failures.push(`${surface.label}: must issue a real useQuery from @tanstack/react-query — static prose is the defect`);
    }
    for (const call of surface.calls) {
      if (!src.includes(call)) {
        failures.push(`${surface.label}: must call ${call}() (real backend reader)`);
      }
    }

    // 2. entity scoping
    if (!src.includes("useCompanyContext")) {
      failures.push(`${surface.label}: must scope its reads with useCompanyContext (operating_company_id)`);
    }

    // 3. shared table grammar + honest empty state
    if (!src.includes("ParityTable")) {
      failures.push(`${surface.label}: must render the shared ParityTable grammar`);
    }
    if (!src.includes("emptyText=")) {
      failures.push(`${surface.label}: must pass an honest emptyText (an empty state backed by a real query is a PASS)`);
    }

    // 4. error state
    if (!src.includes("ListErrorState")) {
      failures.push(`${surface.label}: must render ListErrorState so a failed read is never shown as "no data"`);
    }

    // api module imports
    for (const mod of surface.apiModules) {
      const bare = path.basename(mod).replace(/\.tsx?$/, "");
      if (!new RegExp(`from\\s+["'][^"']*api/${bare}["']`).test(src)) {
        failures.push(`${surface.label}: must import from api/${bare}`);
      }
    }

    // 1b. every declared route literal must exist in the api module AND in the backend registrar
    for (const route of surface.routes) {
      const apiSrc = read(route.apiFile);
      if (apiSrc != null && !apiSrc.includes(route.literal)) {
        failures.push(`${path.basename(route.apiFile)}: must call ${route.literal} (reader for ${surface.label})`);
      }
      const beSrc = read(route.backendFile);
      if (beSrc != null && !beSrc.includes(route.backendLiteral)) {
        failures.push(`${route.backendFile}: no longer registers ${route.backendLiteral} — ${surface.label} would 404`);
      }
    }
  }

  // 6. the stub XLSX export route must never be wired into the UI
  const reportsSrc = read(FILES.reportsPage);
  if (reportsSrc != null && /export\.xlsx/.test(stripComments(reportsSrc))) {
    failures.push(
      "SafetyReportsPage: must NOT wire /api/v1/safety/reports/:id/export.xlsx — renderSafetyReportXlsx() ignores company + report and emits a hardcoded [\"safety.sample\", 0] row (dead button / fabricated export)"
    );
  }

  // 7. additive-only: both routes stay registered at the same paths
  const manifest = read(FILES.manifest);
  if (manifest != null) {
    for (const locked of LOCKED_ROUTES) {
      if (!manifest.includes(locked)) {
        failures.push(`routes/manifest.tsx: ${locked} was removed — ADDITIVE-ONLY violation`);
      }
    }
  }
  const tabs = read(FILES.tabsConfig);
  if (tabs != null) {
    for (const locked of LOCKED_TAB_ROUTES) {
      if (!tabs.includes(locked)) {
        failures.push(`SAFETY_TABS_CONFIG.ts: ${locked} was removed — ADDITIVE-ONLY violation`);
      }
    }
  }

  return failures;
}

// ── self-test ────────────────────────────────────────────────────────────────
// Proves the guard FAILS against the verbatim pre-fix placeholders and PASSES against the fix.
const PREFIX_REPORTS_PAGE = `export default function SafetyReportsPage() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">Safety Reports</h1>
      <p className="text-sm text-gray-500">CSA, crash rate, roadside pass rate, OOS, training, and credential reports.</p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        Export report data to XLSX for compliance and management review.
      </div>
    </main>
  );
}
`;

const PREFIX_AUDIT_425C_PAGE = `export default function Audit425cPage() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">425C Audit Trail</h1>
      <p className="text-sm text-gray-500">Cross-module regulatory event history for safety and compliance records.</p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        Filter by 425C section and open source event detail from each audit row.
      </div>
    </main>
  );
}
`;

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-saf-b31-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  const copyReal = (rel) => {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) throw new Error(`selftest fixture missing in repo: ${rel}`);
    mk(rel, fs.readFileSync(src, "utf8"));
  };

  for (const rel of Object.values(FILES)) copyReal(rel);

  // A. PASS — the real (post-fix) tree.
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("expected PASS on the real tree, got:\n  - " + passFailures.join("\n  - "));

  // B. FAIL — the verbatim pre-fix placeholders.
  mk(FILES.reportsPage, PREFIX_REPORTS_PAGE);
  mk(FILES.audit425cPage, PREFIX_AUDIT_425C_PAGE);
  const preFix = run(tmp);
  for (const label of ["SafetyReportsPage", "Audit425cPage"]) {
    if (!preFix.some((f) => f.startsWith(`${label}:`) && f.includes("useQuery"))) {
      throw new Error(`expected pre-fix FAIL for ${label} (no useQuery), got:\n  - ${preFix.join("\n  - ")}`);
    }
    if (!preFix.some((f) => f.startsWith(`${label}:`) && f.includes("placeholder prose"))) {
      throw new Error(`expected pre-fix FAIL for ${label} (placeholder prose), got:\n  - ${preFix.join("\n  - ")}`);
    }
  }

  // C. FAIL — dead XLSX button re-wired.
  copyReal(FILES.reportsPage);
  copyReal(FILES.audit425cPage);
  mk(FILES.reportsPage, fs.readFileSync(path.join(ROOT, FILES.reportsPage), "utf8") + '\nconst dead = "/api/v1/safety/reports/x/export.xlsx";\n');
  if (!run(tmp).some((f) => f.includes("export.xlsx"))) throw new Error("expected FAIL when the stub XLSX export is wired");

  // D. FAIL — route de-registered (additive-only).
  copyReal(FILES.reportsPage);
  mk(FILES.manifest, fs.readFileSync(path.join(ROOT, FILES.manifest), "utf8").replace('path="reports"', 'path="reports-archived"'));
  if (!run(tmp).some((f) => f.includes("ADDITIVE-ONLY"))) throw new Error("expected FAIL when reports route is de-registered");

  // E. FAIL — backend reader removed out from under the page.
  copyReal(FILES.manifest);
  mk(FILES.beAuditEventsList, fs.readFileSync(path.join(ROOT, FILES.beAuditEventsList), "utf8").replace('"/api/v1/audit/events-list"', '"/api/v1/audit/events-list-v2"'));
  if (!run(tmp).some((f) => f.includes("would 404"))) throw new Error("expected FAIL when the backend reader route is renamed");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-saf-b31-safety-placeholder-surfaces --selftest OK (pre-fix placeholders FAIL, fix PASSES)");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-saf-b31-safety-placeholder-surfaces FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-saf-b31-safety-placeholder-surfaces — OK (both Safety surfaces query real, entity-scoped readers)");
}
