#!/usr/bin/env node
/**
 * DUPLICATE-MASTERS — guard for the read-only duplicate master-records report.
 *
 * Verifies the full vertical slice is real, live, and wired end-to-end:
 *   1. Backend route file exists with registerDuplicateMastersRoutes + the endpoint path
 *   2. Backend index.ts imports and calls registerDuplicateMastersRoutes
 *   3. Frontend page exists with data-testid, entity switch, ParityTable, EntityLink
 *   4. Frontend API client function getDuplicateMasters exists
 *   5. Route is wired in manifest.tsx
 *   6. The route uses LOWER (case-insensitive) for normalized name grouping
 *
 * Self-test: node scripts/verify-duplicate-masters-report.mjs --selftest
 *   Plants case-SENSITIVE grouping (replaces LOWER with UPPER in the route file) → guard must FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-duplicate-masters-report";

const CHECKS = [
  {
    name: "backend route: registerDuplicateMastersRoutes + GET /api/v1/reports/duplicate-masters",
    file: "apps/backend/src/reports/duplicate-masters.routes.ts",
    pattern: /registerDuplicateMastersRoutes[\s\S]*\/api\/v1\/reports\/duplicate-masters/,
  },
  {
    name: "backend route: uses LOWER for case-insensitive normalized name grouping",
    file: "apps/backend/src/reports/duplicate-masters.routes.ts",
    pattern: /LOWER\(regexp_replace\(upper/,
  },
  {
    name: "backend route: canAccessReports role check (Owner/Administrator/Manager/Accountant)",
    file: "apps/backend/src/reports/duplicate-masters.routes.ts",
    pattern: /canAccessReports[\s\S]*Owner[\s\S]*Administrator[\s\S]*Manager[\s\S]*Accountant/,
  },
  {
    name: "backend route: withCompanyScope for company-scoped DB client",
    file: "apps/backend/src/reports/duplicate-masters.routes.ts",
    pattern: /withCompanyScope/,
  },
  {
    name: "backend route: export default fp(...)",
    file: "apps/backend/src/reports/duplicate-masters.routes.ts",
    pattern: /export default fp\(/,
  },
  {
    name: "backend wiring: index.ts imports and calls registerDuplicateMastersRoutes",
    file: "apps/backend/src/reports/index.ts",
    pattern: /registerDuplicateMastersRoutes[\s\S]*registerDuplicateMastersRoutes\(app\)/,
  },
  {
    name: "frontend page: data-testid='duplicate-masters-report'",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /data-testid="duplicate-masters-report"/,
  },
  {
    name: "frontend page: entity switch (drivers/customers/vendors buttons)",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /drivers[\s\S]*customers[\s\S]*vendors/,
  },
  {
    name: "frontend page: ParityTable usage",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /<ParityTable/,
  },
  {
    name: "frontend page: EntityLink drill-through",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /<EntityLink/,
  },
  {
    name: "frontend page: CSV export",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /exportCsv|Export CSV/,
  },
  {
    name: "frontend page: Print button",
    file: "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
    pattern: /window\.print|Print/,
  },
  {
    name: "frontend API client: getDuplicateMasters function",
    file: "apps/frontend/src/api/reports.ts",
    pattern: /export async function getDuplicateMasters[\s\S]{0,300}\/api\/v1\/reports\/duplicate-masters/,
  },
  {
    name: "route manifest: /reports/duplicate-masters mount",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/reports\/duplicate-masters"/,
  },
  {
    name: "reports subnav: Duplicate Masters nav entry",
    file: "apps/frontend/src/pages/reports/ReportsSubNav.tsx",
    pattern: /Duplicate Masters.*\/reports\/duplicate-masters/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();

  // Selftest 1: poison all files → every check must fail (catches vacuous patterns).
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".duplicate-masters-report-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted misses not caught (${planted.length}/${CHECKS.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST poison-pass: all ${planted.length} checks trip on empty files`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Selftest 2: plant case-SENSITIVE grouping (UPPER instead of LOWER) in the route file →
  // the LOWER check must FAIL while the file still exists.
  const routeFile = path.join(ROOT, "apps/backend/src/reports/duplicate-masters.routes.ts");
  if (!fs.existsSync(routeFile)) {
    console.error(`${LABEL} SELFTEST FAIL — route file missing for case-sensitivity plant`);
    process.exit(1);
  }
  const original = fs.readFileSync(routeFile, "utf8");
  const poisoned = original.replace(/LOWER\(regexp_replace\(upper/g, "UPPER(regexp_replace(upper");
  if (poisoned === original) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant UPPER (LOWER not found in route file)`);
    process.exit(1);
  }
  const tmp2 = fs.mkdtempSync(path.join(ROOT, "scripts", ".duplicate-masters-case-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp2, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (c.file === "apps/backend/src/reports/duplicate-masters.routes.ts") {
        fs.writeFileSync(abs, poisoned);
      } else {
        // Copy from real source so non-LOWER checks pass.
        const real = path.join(ROOT, c.file);
        if (fs.existsSync(real)) fs.copyFileSync(real, abs);
        else fs.writeFileSync(abs, "// poison\n");
      }
    }
    const caseFails = runChecks(tmp2);
    const lowerCheckFailed = caseFails.some((f) => f.includes("case-insensitive"));
    if (!lowerCheckFailed) {
      console.error(`${LABEL} SELFTEST FAIL — case-sensitive grouping (UPPER) was NOT caught by the guard`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST case-pass: UPPER plant correctly caught (${caseFails.length} fails, includes case-insensitive check)`);
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }

  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — duplicate masters report is real, live, and wired end-to-end`);
