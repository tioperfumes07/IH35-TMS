#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PATHS = {
  pull: "apps/backend/src/compliance/csa-basic-pull.ts",
  complianceRoutes: "apps/backend/src/compliance/csa.routes.ts",
  safetyRoutes: "apps/backend/src/routes/safety/csa-scores.ts",
  dotInspectionRoutes: "apps/backend/src/routes/safety/dot-inspections.ts",
  safetyLegacyRoutes: "apps/backend/src/safety/safety.routes.ts",
  reportRoutes: "apps/backend/src/reports/csa-fleet-score.routes.ts",
  reportCatalog: "apps/backend/src/reports/categories/category-catalog.ts",
  reportRegistry: "apps/backend/src/reports/shared.ts",
  safetyOfficer: "apps/backend/src/safety-officer/role-views/safety-home.service.ts",
  legacyUi: "apps/frontend/src/pages/safety/tabs/CSAScoreTab.tsx",
  legacyCard: "apps/frontend/src/pages/safety/components/CSAScoreCard.tsx",
  safetyHome: "apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx",
  sourceUi: "apps/frontend/src/pages/safety/CSAScore.tsx",
  reportUi: "apps/frontend/src/pages/reports/runners/CsaFleetScoreCard.tsx",
  reportRunner: "apps/frontend/src/pages/reports/runners/runner-config.ts",
  reportNav: "apps/frontend/src/components/reports/CategoryHoverNav.tsx",
  reportApi: "apps/frontend/src/api/reports.ts",
  recencyGuard: "scripts/verify-csa-score-pull-recency.mjs",
  blueprint: "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md",
};

function readSources() {
  return Object.fromEntries(
    Object.entries(PATHS).map(([key, relative]) => {
      const absolute = path.join(ROOT, relative);
      if (!fs.existsSync(absolute)) return [key, ""];
      return [key, fs.readFileSync(absolute, "utf8")];
    })
  );
}

function collectFailures(source) {
  const failures = [];
  const requireText = (key, text, code) => {
    if (!source[key].includes(text)) failures.push(code);
  };

  requireText("pull", "AUTHENTICATED_SMS_ONLY_CATEGORIES", "private_category_allowlist_missing");
  requireText("pull", "AUTHENTICATED_SMS_ONLY_CATEGORIES.has(basicCategory)", "private_category_null_gate_missing");
  requireText("pull", 'throw new Error("safer_csa_metrics_unavailable")', "all_null_pull_success_not_blocked");
  requireText("pull", "availableBasics", "null_rows_not_filtered_before_persist");
  requireText("complianceRoutes", "requires_authenticated_carrier_sms", "availability_metadata_missing");
  requireText("complianceRoutes", "authenticated_scraping_performed: false", "no_scraping_metadata_missing");
  requireText("safetyRoutes", 'metric_kind: "internal_inspection_point_rollup"', "internal_rollup_label_missing");
  requireText("safetyRoutes", "is_fmcsa_percentile: false", "percentile_disclaimer_missing");
  requireText("safetyRoutes", "basic_hazmat: null", "safety_hazmat_not_forced_null");
  requireText("dotInspectionRoutes", "computeAndUpsertScore", "dot_inspection_does_not_reuse_canonical_rollup");
  requireText("dotInspectionRoutes", "pointValues.length > 0", "dot_inspection_missing_points_become_zero");
  requireText("dotInspectionRoutes", "csa_source: INTERNAL_CSA_SOURCE_METADATA", "dot_inspection_source_metadata_missing");
  requireText("safetyLegacyRoutes", "basic_hazmat: null", "legacy_safety_hazmat_not_forced_null");
  requireText("safetyLegacyRoutes", "csaRes.rows[0]?.score == null ? null", "legacy_kpi_null_coerced_to_zero");
  requireText("safetyLegacyRoutes", "source: INTERNAL_CSA_SOURCE_METADATA", "legacy_source_metadata_missing");
  requireText("reportRoutes", "basic_hazmat: null", "report_hazmat_not_forced_null");
  requireText("reportRoutes", 'threshold_status: "not_applicable"', "internal_threshold_deception_present");
  requireText("reportCatalog", "not an FMCSA percentile", "report_catalog_source_label_missing");
  requireText("reportRegistry", "not an FMCSA BASIC percentile", "report_registry_source_label_missing");
  requireText("safetyOfficer", "not FMCSA BASIC percentiles", "safety_officer_source_label_missing");
  requireText("legacyUi", "IH35 internal inspection-point rollups", "legacy_ui_source_label_missing");
  requireText("legacyUi", "authenticated carrier SMS required", "legacy_ui_hazmat_availability_missing");
  requireText("legacyUi", 'row.total_violations ?? "Unavailable"', "history_null_coerced_to_zero");
  requireText("sourceUi", "No authenticated scraping is performed", "source_ui_scraping_disclaimer_missing");
  requireText("legacyCard", "latest?.total_violations", "legacy_card_reads_phantom_score_field");
  requireText("safetyHome", "latest?.total_violations", "safety_home_reads_phantom_score_field");
  requireText("reportUi", "Not an FMCSA percentile", "report_ui_percentile_deception_present");
  requireText("reportUi", 'BASICS.filter((basic) => basic.key !== "basic_hazmat")', "hazmat_affects_report_scale");
  requireText("reportRunner", 'name: "Internal inspection-point rollup"', "report_runner_mislabeled");
  requireText("reportNav", 'label: "Internal inspection-point rollup"', "report_nav_mislabeled");
  requireText("reportApi", 'report_name: "Internal inspection-point rollup"', "report_log_mislabeled");
  requireText("recencyGuard", "WHERE score IS NOT NULL OR pct_percentile IS NOT NULL", "null_rows_advance_recency_guard");
  requireText("blueprint", "CSA / Hazmat source-honesty rule", "blueprint_honesty_rule_missing");

  if (/COALESCE\s*\(\s*SUM\s*\(\s*CASE[\s\S]*csa_points/i.test(source.safetyRoutes)) {
    failures.push("missing_internal_category_still_becomes_zero");
  }
  if (/basic_hazmat\s*:\s*Number\s*\(/.test(source.reportRoutes + source.reportUi)) {
    failures.push("hazmat_null_coerced_to_number");
  }
  if (/basic_(?:unsafe_driving|hos_compliance|driver_fitness|controlled_substances|vehicle_maintenance|crash_indicator)[^\n]*\?\?\s*0/.test(source.legacyUi)) {
    failures.push("legacy_ui_null_coerced_to_zero");
  }
  if (/threshold_status\s*\?\?\s*["']green["']/.test(source.reportUi)) {
    failures.push("missing_report_defaults_green");
  }
  if (/score_date|source_dot_inspection_count/.test(source.dotInspectionRoutes)) {
    failures.push("dot_inspection_uses_phantom_csa_schema");
  }

  return failures;
}

function runSelfTest(source) {
  const planted = {
    ...source,
    safetyRoutes: source.safetyRoutes.replaceAll("basic_hazmat: null", "basic_hazmat: Number(row.basic_hazmat ?? 0)"),
    reportRoutes: source.reportRoutes.replaceAll("basic_hazmat: null", "basic_hazmat: Number(score.basic_hazmat ?? 0)"),
  };
  const failures = collectFailures(planted);
  if (!failures.includes("safety_hazmat_not_forced_null") || !failures.includes("hazmat_null_coerced_to_number")) {
    console.error("verify:csa-hazmat-source-integrity SELFTEST FAIL: planted null-to-zero regression escaped");
    process.exit(1);
  }
  console.log("verify:csa-hazmat-source-integrity SELFTEST PASS (planted regression rejected)");
}

const source = readSources();
const failures = collectFailures(source);
if (failures.length > 0) {
  console.error("verify:csa-hazmat-source-integrity FAIL");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  runSelfTest(source);
} else {
  console.log("verify:csa-hazmat-source-integrity PASS");
}
