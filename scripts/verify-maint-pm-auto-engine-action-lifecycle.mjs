#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/updateMaintenancePmAutoEngineSettings\(\{ operating_company_id: input\.companyId, is_paused: input\.isPaused \}\)/, "settings write does not use immutable company/state"],
    [/runMaintenancePmAutoEngineNow\(input\.companyId\)/, "manual run does not use immutable company"],
    [(value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale successes must be rejected"],
    [(value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale errors must be rejected"],
    [(value.match(/queryKey: \["maintenance", "pm-auto-engine", input\.companyId\]/g) ?? []).length === 2 ? /./ : /$a/, "both refreshes must target submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*settingsM\.reset\(\)[\s\S]*runNowM\.reset\(\)[\s\S]*\[companyId\]/, "company transition does not reset both actions"],
    [/settingsM\.mutate\(\{ companyId, generation: actionGenerationRef\.current, isPaused: !isPaused \}\)/, "settings caller does not snapshot company/generation/state"],
    [/runNowM\.mutate\(\{ companyId, generation: actionGenerationRef\.current \}\)/, "run caller does not snapshot company/generation"],
    [/if \(!dashboardQ\.isError\) return;[\s\S]*settingsM\.reset\(\);[\s\S]*runNowM\.reset\(\);/, "dashboard failure does not retire both actions"],
    [/const isPaused = !dashboardQ\.isError && Boolean\(dashboardQ\.data\?\.settings\?\.is_paused\);\s*const runs = dashboardQ\.isError \? \[\] : \(dashboardQ\.data\?\.runs \?\? \[\]\);\s*const recentLog = dashboardQ\.isError \? \[\] : \(dashboardQ\.data\?\.recent_log \?\? \[\]\);/, "dashboard failure does not suppress retained settings/runs/log"],
    [/disabled=\{!companyId \|\| dashboardQ\.isError \|\| settingsM\.isPending\}/, "settings action does not fail closed on dashboard error"],
    [/disabled=\{!companyId \|\| dashboardQ\.isError \|\| runNowM\.isPending \|\| isPaused\}/, "manual run does not fail closed on dashboard error"],
    [/Status: \{dashboardQ\.isError \? "Unavailable" : isPaused \? "Paused" : "Active"\}/, "dashboard failure still claims an active scheduler status"],
    [/\{!dashboardQ\.isError \? <div[\s\S]*recentLog\.map[\s\S]*recentLog\.length === 0[\s\S]*<\/div> : null\}/, "dashboard failure does not suppress retained reverse-linked action log"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.companyId, is_paused: input.isPaused", "companyId, is_paused: isPaused"],
    ["runMaintenancePmAutoEngineNow(input.companyId)", "runMaintenancePmAutoEngineNow(companyId)"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["settingsM.reset();", "// planted: settings state survives"],
    ["runNowM.reset();", "// planted: run state survives"],
    ["companyId, generation: actionGenerationRef.current, isPaused: !isPaused", "companyId: '', generation: 0, isPaused: !isPaused"],
    ["runNowM.mutate({ companyId, generation: actionGenerationRef.current })", "runNowM.mutate()"],
    ["const runs = dashboardQ.isError ? [] : (dashboardQ.data?.runs ?? []);", "const runs = dashboardQ.data?.runs ?? [];"],
    ["dashboardQ.isError || settingsM.isPending", "settingsM.isPending"],
    ["dashboardQ.isError || runNowM.isPending", "runNowM.isPending"],
    ["dashboardQ.isError ? \"Unavailable\" : isPaused ? \"Paused\" : \"Active\"", "isPaused ? \"Paused\" : \"Active\""],
    ["if (!dashboardQ.isError) return;", "if (true) return;"],
    ["const recentLog = dashboardQ.isError ? [] : (dashboardQ.data?.recent_log ?? []);", "const recentLog = dashboardQ.data?.recent_log ?? [];"],
    ["{!dashboardQ.isError ? <div", "{true ? <div"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-pm-auto-engine-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-pm-auto-engine-action-lifecycle PASS — settings/run remain company-local");
