#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.(profit_truck_mtd|dispatch_board|cash_position|ifta_quarterly)$","task":"VERTICAL-CONNECTIVITY-REPORTS-RUNNER-ALIASES"} */
import fs from "node:fs";

const runnerPath = "apps/frontend/src/pages/reports/ReportsRunner.tsx";
const manifestPath = "apps/frontend/src/routes/manifest.tsx";
const requiredPath = "docs/specs/scoreboard/modules/reports.required.json";
const runner = fs.readFileSync(runnerPath, "utf8");
const manifest = fs.readFileSync(manifestPath, "utf8");
const required = JSON.parse(fs.readFileSync(requiredPath, "utf8"));

const aliases = {
  "profit-truck-mtd": "/reports/profit-per-truck",
  "dispatch-board": "/dispatch",
  "cash-position": "/reports/cash-flow-overview",
  "ifta-quarterly": "/reports/ifta",
};

function mounted(route) {
  return manifest.includes(`path="${route}"`);
}

function failures(source = runner) {
  const missing = [];
  if (!source.includes("const CANONICAL_REPORT_ALIASES")) missing.push("canonical alias registry");
  if (!source.includes("if (canonicalAlias) return <Navigate replace to={canonicalAlias} />")) missing.push("runner redirect");
  for (const [slug, route] of Object.entries(aliases)) {
    if (!source.includes(`"${slug}": "${route}"`)) missing.push(`alias ${slug}`);
    if (!mounted(route)) missing.push(`mounted destination ${route}`);
    const leaf = required.leaves?.find((item) => item.id === `runner.${slug.replaceAll("-", "_")}`);
    if (!leaf?.required?.includes("connectivity")) missing.push(`required leaf ${slug}`);
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutated = runner.replace('"cash-position": "/reports/cash-flow-overview"', '"cash-position": "/reports/missing"');
  if (!failures(mutated).includes("alias cash-position")) process.exit(1);
  console.log("verify-reports-runner-canonical-aliases selftest PASS — alias mutation red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-reports-runner-canonical-aliases FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-reports-runner-canonical-aliases PASS — four legacy runner doors redirect to exact mounted owners");
