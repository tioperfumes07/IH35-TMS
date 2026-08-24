#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leaves":["reports.hub.scheduled_reports_panel"]} */
/**
 * LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED (continued) — owner-locked SS9.6 names
 * `reporting.scheduled_reports` canonical for scheduled reports ("migrate reports.* rows in, archive
 * the old"). The dedicated /reports/scheduled-custom page (ScheduledReportsPage.tsx) already reads
 * the canonical table via GET /api/v1/scheduled-reports, but the Reports hub's "Custom scheduled
 * reports" panel (ScheduledReportsPanel.tsx, mounted on /reports) still read the LEGACY
 * reports.scheduled_reports table via GET /api/v1/reports/scheduled — a table this company genuinely
 * has 0 enabled rows in. Live-verified on prod: both endpoints returned 200, but the panel always
 * rendered "No custom schedules — add daily dispatch board or AR aging" while the canonical endpoint
 * (and the dedicated page) correctly showed 6 real schedules, including one literally named
 * "dispatch-board" — the exact example the panel's own empty-state text ironically suggested adding.
 *
 * Fix: point the panel at the same canonical API module (apps/frontend/src/api/scheduled-reports.ts)
 * the working dedicated page already uses — listScheduledReportsV2/pauseScheduledReport/
 * resumeScheduledReport/sendScheduledReportNow/deleteScheduledReport — sharing the SAME query key
 * ("scheduled-reports-v2") so a mutation from either surface invalidates both.
 *
 * Self-test: node scripts/verify-reports-scheduled-panel-canonical-source.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  panel: "apps/frontend/src/pages/reports/ScheduledReportsPanel.tsx",
  home: "apps/frontend/src/pages/reports/ReportsHome.tsx",
};
const LABEL = "verify-reports-scheduled-panel-canonical-source";

export function audit(src) {
  const failures = [];

  const panelCode = src.panel
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  if (panelCode.includes("/api/v1/reports/scheduled")) {
    failures.push(
      `${FILES.panel}: still references the legacy endpoint "/api/v1/reports/scheduled" — this ` +
        `company has 0 enabled rows in that table; the panel must read the canonical table instead.`,
    );
  }
  if (!/from\s+["']\.\.\/\.\.\/api\/scheduled-reports["']/.test(src.panel)) {
    failures.push(`${FILES.panel}: must import from "../../api/scheduled-reports" (the canonical API module).`);
  }
  if (!/queryFn:\s*\(\)\s*=>\s*listScheduledReportsV2\(companyId\)/.test(src.panel)) {
    failures.push(`${FILES.panel}: the list query's queryFn must call listScheduledReportsV2(companyId) (canonical GET /api/v1/scheduled-reports).`);
  }
  if (!/queryKey:\s*\[\s*["']scheduled-reports-v2["']\s*,\s*companyId\s*\]/.test(src.panel)) {
    failures.push(
      `${FILES.panel}: list query must use queryKey ["scheduled-reports-v2", ...] — the SAME key ` +
        `ScheduledReportsPage.tsx uses, so a mutation on either surface invalidates both.`,
    );
  }
  if (!/pauseScheduledReport/.test(src.panel) || !/resumeScheduledReport/.test(src.panel)) {
    failures.push(`${FILES.panel}: the Active toggle must call the canonical pauseScheduledReport/resumeScheduledReport actions.`);
  }
  if (!/pauseMut\.mutate\(row\.id\)/.test(src.panel) || !/resumeMut\.mutate\(row\.id\)/.test(src.panel)) {
    failures.push(`${FILES.panel}: the Active checkbox must call BOTH pauseMut.mutate and resumeMut.mutate depending on the target state.`);
  }
  if (!/deleteScheduledReport\(id,\s*companyId\)/.test(src.panel)) {
    failures.push(`${FILES.panel}: Delete must call the canonical deleteScheduledReport (void-not-delete).`);
  }

  if (src.home.includes("getScheduledReports")) {
    failures.push(`${FILES.home}: must not import/call the legacy getScheduledReports — it fed the now-removed rows prop.`);
  }
  if (/<ScheduledReportsPanel\s+rows=/.test(src.home)) {
    failures.push(`${FILES.home}: must not pass a rows prop to ScheduledReportsPanel — it self-fetches from the canonical API.`);
  }

  return failures;
}

function loadSrc(root) {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = fs.readFileSync(path.join(root, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { key: "panel", from: '"../../api/scheduled-reports"', to: '"../../api/reports-legacy-stub"' },
    { key: "panel", from: "listScheduledReportsV2(companyId)", to: '{ rows: [] }' },
    { key: "panel", from: '["scheduled-reports-v2", companyId]', to: '["reports-scheduled-panel", companyId]' },
    { key: "panel", from: "resumeMut.mutate(row.id)", to: "pauseMut.mutate(row.id)" },
    { key: "panel", from: "deleteScheduledReport(id, companyId)", to: "Promise.resolve({ ok: true })" },
    { key: "home", from: '        <ScheduledReportsPanel />', to: '        <ScheduledReportsPanel rows={[]} />' },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutatedSrc = { ...good, [m.key]: good[m.key].split(m.from).join(m.to) };
    if (mutatedSrc[m.key] === good[m.key]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m)}`);
      process.exit(1);
    }
    if (audit(mutatedSrc).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m)}`);
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
console.log(`${LABEL} PASS — Reports hub scheduled-reports panel reads the canonical table, matching the dedicated page`);
