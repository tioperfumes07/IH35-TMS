#!/usr/bin/env node
/**
 * 0441-mod2-fault-drafts-rules-orphan-nav
 *
 * Routes `/maintenance/fault-drafts` and `/maintenance/fault-rules` must stay
 * reachable from MAINTENANCE_NAV_CONFIG (sidebar flyout + Master Data hover).
 * Direct-URL-only registration is the regression this guard plants against.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_FAULT_DRAFTS_NAV_ROOT ?? process.cwd();

const REQUIRED_PATHS = ["/maintenance/fault-drafts", "/maintenance/fault-rules"];
const REQUIRED_LABELS = ["Fault Drafts", "Fault Rules"];

const paths = {
  navConfig: path.join(ROOT, "apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts"),
  sidebarConfig: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function extractArrayBlock(source, exportName) {
  const re = new RegExp(`export const ${exportName}[\\s\\S]*?\\];`);
  const match = source.match(re);
  return match ? match[0] : "";
}

/** Pure checks — used by live run + --self-test planting. */
export function checkSources({ navConfig, sidebarConfig, manifest, archDesign }) {
  const failures = [];
  const moduleNav = extractArrayBlock(navConfig, "MAINTENANCE_MODULE_NAV_LINKS");
  const masterData = extractArrayBlock(navConfig, "MAINTENANCE_MASTER_DATA_LINKS");

  for (const p of REQUIRED_PATHS) {
    if (!moduleNav.includes(`path: "${p}"`)) {
      failures.push(`MAINTENANCE_MODULE_NAV_LINKS must include ${p}`);
    }
    if (!masterData.includes(`path: "${p}"`)) {
      failures.push(`MAINTENANCE_MASTER_DATA_LINKS must include ${p}`);
    }
    if (!manifest.includes(`path="${p}"`)) {
      failures.push(`manifest.tsx must register route ${p}`);
    }
  }

  for (const label of REQUIRED_LABELS) {
    if (!moduleNav.includes(`label: "${label}"`)) {
      failures.push(`MAINTENANCE_MODULE_NAV_LINKS must label ${label}`);
    }
    if (!masterData.includes(`label: "${label}"`)) {
      failures.push(`MAINTENANCE_MASTER_DATA_LINKS must label ${label}`);
    }
  }

  if (!sidebarConfig.includes("MAINTENANCE_MODULE_NAV_LINKS")) {
    failures.push("sidebar-config must derive maintenance flyout from MAINTENANCE_MODULE_NAV_LINKS");
  }
  if (!archDesign.includes("/maintenance/fault-drafts")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md must document /maintenance/fault-drafts");
  }
  if (!archDesign.includes("/maintenance/fault-rules")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md must document /maintenance/fault-rules");
  }
  if (!archDesign.includes("Fault Drafts") || !archDesign.includes("Fault Rules")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md must name Fault Drafts and Fault Rules nav surfaces");
  }
  if (!/13 sidebar flyout|13 module/.test(archDesign) && !archDesign.includes("13 sidebar flyout links")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN.md B24 counts must document 13 sidebar flyout links");
  }

  return failures;
}

function selfTest() {
  const base = {
    navConfig: `
export const MAINTENANCE_MODULE_NAV_LINKS = [
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];
export const MAINTENANCE_MASTER_DATA_LINKS = [
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];
`,
    sidebarConfig: 'return MAINTENANCE_MODULE_NAV_LINKS.map((item) => ({ label: item.label, to: item.path }));',
    manifest: 'path="/maintenance/fault-drafts"\npath="/maintenance/fault-rules"',
    archDesign:
      "Fleet managers review drafts at `/maintenance/fault-drafts`; rules CRUD at `/maintenance/fault-rules`.\n" +
      "**Fault Drafts** · **Fault Rules**\n" +
      "Maintenance module nav counts (B24): 13 sidebar flyout links",
  };

  const cases = [
    {
      name: "complete wiring -> ok",
      got: checkSources(base).length,
      want: 0,
    },
    {
      name: "orphan module nav -> flagged",
      got: checkSources({
        ...base,
        navConfig: `
export const MAINTENANCE_MODULE_NAV_LINKS = [
  { label: "Dashboard", path: "/maintenance" },
];
export const MAINTENANCE_MASTER_DATA_LINKS = [
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];
`,
      }).some((r) => /MAINTENANCE_MODULE_NAV_LINKS must include/.test(r)),
      want: true,
    },
    {
      name: "orphan master data -> flagged",
      got: checkSources({
        ...base,
        navConfig: `
export const MAINTENANCE_MODULE_NAV_LINKS = [
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];
export const MAINTENANCE_MASTER_DATA_LINKS = [
  { label: "Vehicles", path: "/maintenance/vehicles" },
];
`,
      }).some((r) => /MAINTENANCE_MASTER_DATA_LINKS must include/.test(r)),
      want: true,
    },
    {
      name: "missing arch path -> flagged",
      got: checkSources({
        ...base,
        archDesign: "Maintenance module nav counts (B24): 13 sidebar flyout links\nFault Drafts · Fault Rules",
      }).some((r) => /fault-drafts/.test(r)),
      want: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)})`);
  }
  if (failed) {
    console.error(`\nself-test FAILED: ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  selfTest();

  const failures = checkSources({
    navConfig: read(paths.navConfig),
    sidebarConfig: read(paths.sidebarConfig),
    manifest: read(paths.manifest),
    archDesign: read(paths.archDesign),
  });

  if (failures.length > 0) {
    console.error("verify:fault-drafts-nav FAIL");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:fault-drafts-nav OK");
}

main();
