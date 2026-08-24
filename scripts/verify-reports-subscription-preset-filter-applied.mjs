#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["silent_no_op"],"leaves":["reports.saved.owner_weekly_pack","reports.saved.quarter_close_package"]} */
/**
 * SUBSCRIPTIONS-PRESET-FILTER-SILENT-NOOP: the Reports hub's "Saved" category shortcuts ("Owner
 * weekly pack" / "Quarter close package" -- CategoryHoverNav.tsx, aliased through
 * ReportsRunner.tsx's CANONICAL_REPORT_ALIASES) both land on /reports/scheduled with a real
 * ?preset=owner-weekly / ?preset=quarter-close query param, but SubscriptionManager.tsx (the page
 * mounted at that route) never read it. Live-confirmed on prod: the row count was identical (6) with
 * and without the preset param -- clicking either "Saved" shortcut had zero effect on what was shown,
 * a silent no-op on the filter (not a dead click -- the navigation itself worked).
 *
 * Fix: SubscriptionManager.tsx now reads useSearchParams(), looks up a preset (grouped by cadence,
 * since this page's Q8 subscription slugs are a disjoint namespace from the OTHER scheduled-reports
 * page's REPORT_PRESETS), and filters + retitles the page when one is present.
 *
 * Self-test: node scripts/verify-reports-subscription-preset-filter-applied.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/reports/SubscriptionManager.tsx";
const LABEL = "verify-reports-subscription-preset-filter-applied";

export function audit(src) {
  const failures = [];

  if (!/import \{ useSearchParams \} from "react-router-dom";/.test(src)) {
    failures.push(`${FILE}: must import useSearchParams from react-router-dom.`);
  }
  if (!/const preset = Q8_PRESETS\[searchParams\.get\("preset"\) \?\? ""\] \?\? null;/.test(src)) {
    failures.push(`${FILE}: must resolve the ?preset= query param against Q8_PRESETS.`);
  }
  if (!/"owner-weekly":\s*\{/.test(src) || !/"quarter-close":\s*\{/.test(src)) {
    failures.push(`${FILE}: Q8_PRESETS must define both "owner-weekly" and "quarter-close".`);
  }
  if (!/const rows = preset \? allRows\.filter\(\(row\) => preset\.slugs\.has\(row\.report_slug\)\) : allRows;/.test(src)) {
    failures.push(`${FILE}: rendered rows must actually be filtered by preset.slugs when a preset is present.`);
  }
  if (!/title=\{preset \? preset\.title : "Scheduled report subscriptions"\}/.test(src)) {
    failures.push(`${FILE}: the page title must reflect the active preset, not always show the generic title.`);
  }

  return failures;
}

function loadSrc(root) {
  return fs.readFileSync(path.join(root, FILE), "utf8");
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { from: 'import { useSearchParams } from "react-router-dom";\n', to: "" },
    { from: 'const preset = Q8_PRESETS[searchParams.get("preset") ?? ""] ?? null;', to: "const preset = null;" },
    { from: '"owner-weekly": {', to: '"owner-weekly-renamed": {' },
    {
      from: "const rows = preset ? allRows.filter((row) => preset.slugs.has(row.report_slug)) : allRows;",
      to: "const rows = allRows;",
    },
    {
      from: 'title={preset ? preset.title : "Scheduled report subscriptions"}',
      to: 'title="Scheduled report subscriptions"',
    },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutated = good.split(m.from).join(m.to);
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Saved-report presets actually filter the subscription list, not a silent no-op`);
