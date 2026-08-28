#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers","fleet"],"cols":["load","driver","unit","connectivity","reverse_link","qbo_chrome"],"leaves":["queues.intransit_issues","load.detail.intransit_issues","driver.profile.intransit_issues","unit.profile.intransit_issues"],"task":"DSP-F6935-INTRANSIT-ISSUES-SILENT-200-REVERSE","vertical":"class-sweep"} */
import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const service = read("apps/backend/src/dispatch/arch-tabs.service.ts");
const page = read("apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx");
const load = read("apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx");
const driver = read("apps/frontend/src/components/dispatch/DriverInTransitIssuesReverseSection.tsx");
const unit = read("apps/frontend/src/components/dispatch/UnitInTransitIssuesReverseSection.tsx");
const section = (s) => s.slice(s.indexOf("export async function listIntransitIssues"), s.indexOf("export async function listAssignmentHistoryGlobal"));
function failures(s, p, l, d, u) {
  const q = section(s); const out = [];
  if (!q.includes("dispatch.intransit_issues i") || !q.includes("i.operating_company_id = $1::uuid")) out.push("canonical company scope missing");
  if (/LIMIT\s+200/i.test(q)) out.push("issue range still caps at 200");
  for (const token of ["filters.load_id", "filters.driver_id", "filters.unit_id", "filters.issue_id"]) if (!q.includes(token)) out.push(`${token} filter missing`);
  for (const [name, source] of [["page", p], ["load", l], ["driver", d], ["unit", u]]) if (!source.includes("listDispatchIntransitIssues")) out.push(`${name} consumer missing`);
  if (!p.includes('kind="load"') || !p.includes('kind="driver"') || !p.includes('kind="unit"')) out.push("page EntityLinks missing");
  if (!/const createGenerationRef = useRef\(0\)/.test(p)) out.push("create scope generation missing");
  if (!/\[companyId, createOpen\]/.test(p) || !/setLoadId\(""\)[\s\S]*setCategory\("mechanical"\)[\s\S]*setDescription\(""\)[\s\S]*setSeverity\("warning"\)/.test(p)) out.push("create draft not reset by company/open scope");
  if (!/mutationFn: \(input:[\s\S]*operating_company_id: input\.companyId[\s\S]*load_id: input\.loadId[\s\S]*issue_description: input\.description/.test(p)) out.push("create writer does not consume immutable scope");
  if (!/input\.generation !== createGenerationRef\.current\) return;[\s\S]*input\.companyId/.test(p)) out.push("create success does not reject stale scope");
  if (!/input\.generation === createGenerationRef\.current\) setError/.test(p)) out.push("create error does not reject stale scope");
  if (!/resolveDispatchIntransitIssue\(input\.issueId, \{ operating_company_id: input\.companyId \}\)/.test(p)) out.push("resolve writer does not snapshot issue/company");
  if (!/queryKey: \["dispatch", "intransit-issues", input\.companyId\]/.test(p)) out.push("write invalidation does not use submitted company");
  if (!/<Modal variant="drawer" open=\{createOpen\} onClose=\{\(\) => \{ if \(!createMutation\.isPending\)/.test(p)) out.push("create dismissal not locked while pending");
  if ((p.match(/disabled=\{createMutation\.isPending\}/g) ?? []).length < 5) out.push("create controls not locked while pending");
  return out;
}
if (process.argv.includes("--selftest")) {
  const capped = service.replace("ORDER BY i.reported_at DESC", "ORDER BY i.reported_at DESC\n        LIMIT 200");
  const mutations = [
    [capped, page, load, driver, unit],
    [service.replaceAll("i.operating_company_id = $1::uuid", "true"), page, load, driver, unit],
    [service, page, load.replaceAll("listDispatchIntransitIssues", "removed"), driver, unit],
    [service, page.replaceAll('kind="unit"', 'kind="removed"'), load, driver, unit],
    [service, page.replace("const createGenerationRef = useRef(0)", "const createGenerationRef = { current: 0 }"), load, driver, unit],
    [service, page.replace("[companyId, createOpen]", "[createOpen]"), load, driver, unit],
    [service, page.replace("operating_company_id: input.companyId", "operating_company_id: companyId"), load, driver, unit],
    [service, page.replace("if (input.generation !== createGenerationRef.current) return;", "void input.generation;"), load, driver, unit],
    [service, page.replace("resolveDispatchIntransitIssue(input.issueId, { operating_company_id: input.companyId })", "resolveDispatchIntransitIssue(input.issueId, { operating_company_id: companyId })"), load, driver, unit],
    [service, page.replace("disabled={createMutation.isPending}", "disabled={false}"), load, driver, unit],
  ];
  const missed = mutations.filter((parts) => failures(...parts).length === 0);
  if (missed.length) { console.error(`FAIL: selftest missed ${missed.length}`); process.exit(1); }
  console.log(`PASS: selftest caught ${mutations.length} in-transit issue regressions`); process.exit(0);
}
const out = failures(service,page,load,driver,unit);
if (out.length) { console.error(`FAIL: ${out.join("; ")}`); process.exit(1); }
console.log("PASS: in-transit issue page and load/driver/unit reverse sections receive the complete scoped range");
