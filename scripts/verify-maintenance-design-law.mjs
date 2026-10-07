#!/usr/bin/env node
/**
 * MAINTENANCE-DESIGN-LAW
 *
 * Maintenance lists inherit the rendered table contract from ParityTable and KPI tiles from
 * DrillKpiCard. This guard locks those shared DOM/style seams and prevents Fleet from growing a
 * private, white/left-aligned KPI implementation again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function collectProblems({
  tokens = read("apps/frontend/src/design/tokens.ts"),
  parity = read("apps/frontend/src/components/parity/ParityTable.tsx"),
  drill = read("apps/frontend/src/components/layout/DrillKpiCard.tsx"),
  fleet = read("apps/frontend/src/pages/maintenance/FleetTablePage.tsx"),
} = {}) {
  const problems = [];
  const requireText = (source, needle, message) => { if (!source.includes(needle)) problems.push(message); };

  requireText(tokens, 'tableHeaderBg: "#EEF2F6"', "--th-bg token drifted");
  requireText(tokens, 'tableColumnRule: "#C7D2DC"', "--th-border token drifted");
  requireText(tokens, 'tableRowStripe: "#FAFBFC"', "zebra token drifted");
  requireText(tokens, 'kpiTileBg: "#F4F7FA"', "--kpi-bg token drifted");
  requireText(tokens, 'kpiTileBorder: "#C7D2DC"', "--kpi-border token drifted");
  requireText(tokens, 'BUTTON_MD_SIZE_CLASS = "h-7', "28px control token drifted");

  // CENTER-EVERYTHING LAW (owner ruling 2026-09-04): text-center is the default for
  // non-board ParityTable surfaces; board views keep text-left because dense ledgers
  // read left-to-right. The layout modes (auto/fixed) both inherit this contract.
  requireText(
    parity,
    'className={`w-full ${columnLayout === "auto" ? "table-auto" : "table-fixed"} ${board ? "text-left" : "text-center"} tabular-nums`}',
    "ParityTable default centering contract missing across layout modes",
  );
  requireText(parity, 'stickyHeader ? "sticky top-0 z-10"', "ParityTable header is not sticky by default");
  // Zebra backing can use the direct color token or the QBO_SURFACE wrapper — both are token-backed.
  if (!/colors\.tableRowStripe|QBO_SURFACE\.rowStripe/.test(parity)) {
    problems.push("ParityTable zebra rows are not token-backed");
  }
  // QBO-ROWS-NOT-COLUMNS (owner ruling 2026-09-30): body cells draw horizontal row rules only,
  // never vertical column rules. Header / group bands still outline with tableColumnRule.
  requireText(parity, "borderBottom: `1px solid ${colors.tableColumnRule}`", "ParityTable header/group row rule missing");
  requireText(parity, "borderBottom: `1px solid ${colors.tableBodyRule}`", "ParityTable body row rule missing");
  requireText(parity, "fontWeight: headerWeight ?? 700", "ParityTable header weight no longer defaults to 700");

  requireText(drill, "backgroundColor: colors.kpiTileBg", "KPI computed background is not token-backed");
  requireText(drill, "borderColor: active ? colors.navy : colors.kpiTileBorder", "KPI computed border is not token-backed");
  requireText(drill, 'return KPI_NO_VALUE', "KPI absent values no longer render an em dash");

  requireText(fleet, 'import { DrillKpiCard }', "Fleet registry does not consume the shared KPI surface");
  requireText(fleet, 'BUTTON_MD_SIZE_CLASS', "Fleet registry controls do not consume the 28px token");
  if (/function\s+KpiCard\s*\(/.test(fleet)) problems.push("Fleet registry reintroduced a private KPI card");
  if (/avg_age_years\s*==\s*null\s*\?\s*["']-["']/.test(fleet)) problems.push("Fleet missing KPI uses hyphen instead of canonical em dash");

  return problems;
}

if (process.argv.includes("--selftest")) {
  const fleet = read("apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
  const planted = collectProblems({ fleet: fleet.replace('import { DrillKpiCard }', 'import { RemovedKpiCard }') });
  if (!planted.includes("Fleet registry does not consume the shared KPI surface")) {
    console.error("verify-maintenance-design-law SELFTEST FAIL — planted shared-KPI removal escaped");
    process.exit(1);
  }
  const tokens = read("apps/frontend/src/design/tokens.ts");
  const plantedToken = collectProblems({ tokens: tokens.replace('#F4F7FA', '#FFFFFF') });
  if (!plantedToken.includes("--kpi-bg token drifted")) {
    console.error("verify-maintenance-design-law SELFTEST FAIL — planted KPI token drift escaped");
    process.exit(1);
  }
  const parity = read("apps/frontend/src/components/parity/ParityTable.tsx");
  const plantedCenter = collectProblems({ parity: parity.replace('board ? "text-left" : "text-center"', 'board ? "text-left" : "text-left"') });
  if (!plantedCenter.includes("ParityTable default centering contract missing across layout modes")) {
    console.error("verify-maintenance-design-law SELFTEST FAIL — planted table-centering drift escaped");
    process.exit(1);
  }
  const plantedRowRule = collectProblems({ parity: parity.replace("borderBottom: `1px solid ${colors.tableBodyRule}`", "") });
  if (!plantedRowRule.includes("ParityTable body row rule missing")) {
    console.error("verify-maintenance-design-law SELFTEST FAIL — planted body row rule removal escaped");
    process.exit(1);
  }
  console.log("verify-maintenance-design-law SELFTEST PASS — shared surface and computed-style token mutations caught 4/4");
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error("verify-maintenance-design-law FAIL:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("verify-maintenance-design-law PASS — maintenance tables/KPIs inherit centered sticky zebra token styles and 28px controls");
