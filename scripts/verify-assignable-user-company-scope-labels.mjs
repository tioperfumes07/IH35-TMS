#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["connectivity"],"leafRe":"^(nav\\.chat|chat\\.mentions|tasks\\.modal\\.create_task|hop\\.daily_tasks|daily_tasks\\.create)$","task":"LINK-F5170-ASSIGNABLE-USER-COMPANY-SCOPE-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^(wo\\.create|maintenance\\.modal\\.(work_order_create|create_work_order))$","task":"LINK-F5170-ASSIGNABLE-USER-COMPANY-SCOPE-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["users"],"cols":["connectivity"],"leafRe":"^create$","task":"LINK-F5170-ASSIGNABLE-USER-COMPANY-SCOPE-LABELS","vertical":"class-sweep"} */

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-assignable-user-company-scope-labels";
const FILES = {
  api: "apps/frontend/src/api/identity.ts",
  backend: "apps/backend/src/identity/users.routes.ts",
  createTask: "apps/frontend/src/components/tasks/CreateTaskModal.tsx",
  chat: "apps/frontend/src/pages/tasks/TasksChatPage.tsx",
  daily: "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx",
  maintenance: "apps/frontend/src/pages/maintenance/components/CreateWOSectionRenderV5Header.tsx",
  users: "apps/frontend/src/pages/Users.tsx",
  safety: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
};

const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const checks = [
  ["api", /listAssignableUsers\(operatingCompanyId\?: string, signal\?: AbortSignal\)[\s\S]{0,240}operating_company_id=\$\{encodeURIComponent\(operatingCompanyId\)\}[\s\S]{0,180}\{ signal \}/, "shared client forwards optional company scope and cancellation"],
  ["backend", /users\/assignable[\s\S]{0,1800}if \(parsedQuery\.data\.operating_company_id\)[\s\S]{0,700}uca\.company_id = \$\$?\{values\.length\}::uuid/, "backend enforces requested company membership"],
  ["createTask", /queryKey: \["identity", "users", "assignable", operatingCompanyId\][\s\S]{0,140}listAssignableUsers\(operatingCompanyId, signal\)[\s\S]{0,100}enabled: open && Boolean\(operatingCompanyId\)/, "Create Task scopes and keys its assignee roster"],
  ["createTask", /return entityLabel\(u\.name \|\| full \|\| u\.email, u\.id, "User"\)/, "Create Task rejects raw user UUID labels"],
  ["chat", /queryKey: \["identity", "users", "assignable", companyId\][\s\S]{0,120}listAssignableUsers\(companyId, signal\)[\s\S]{0,80}enabled: Boolean\(companyId\)/, "Tasks Chat scopes and keys its mention roster"],
  ["daily", /import \{ listAssignableUsers \} from "\.\.\/\.\.\/api\/identity"/, "Daily Tasks uses the office-role assignable directory"],
  ["daily", /queryKey: \["daily-tasks", "users", companyId\][\s\S]{0,120}listAssignableUsers\(companyId, signal\)[\s\S]{0,100}enabled: Boolean\(auth\.user && companyId\)/, "Daily Tasks scopes and keys its assignee roster"],
  ["daily", /entityLabel\(user\.name \|\| user\.email, user\.id, "User"\)/, "Daily Tasks rejects raw user UUID labels"],
  ["maintenance", /queryKey: \["identity", "users", "wo-authorized-by", operatingCompanyId\][\s\S]{0,140}listAssignableUsers\(operatingCompanyId, signal\)[\s\S]{0,80}enabled: Boolean\(operatingCompanyId\)/, "Maintenance WO scopes and keys its authorized-by roster"],
  ["users", /entityLabel\(user\.name \?\? user\.email, user\.id, "User"\)/, "Users role approver rejects raw UUID labels"],
  ["safety", /queryKey: \["identity", "assignable-users", "complaints", companyId\][\s\S]{0,120}listAssignableUsers\(companyId, signal\)[\s\S]{0,80}enabled: canCreate && Boolean\(companyId\)/, "Safety complaint roster remains company-keyed and scoped"],
];

function productionTsxFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...productionTsxFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) found.push(full);
  }
  return found;
}

function failures(candidate, productionOverride = null) {
  const found = checks
    .filter(([key, pattern]) => !pattern.test(candidate[key]))
    .map(([, , description]) => description);
  if (/\blistUsers\(true\)/.test(candidate.daily)) found.push("Daily Tasks still calls the admin-only full directory");
  if (/user\.name\s*\?\?\s*user\.email\s*\?\?\s*user\.id/.test(candidate.users)) found.push("Users role approver still exposes raw UUID fallback");
  if (/u\.name\s*\|\|\s*full\s*\|\|\s*u\.email\s*\|\|\s*u\.id/.test(candidate.createTask)) found.push("Create Task still exposes raw UUID fallback");
  if (/user\.email\s*\?\?\s*user\.id/.test(candidate.daily)) found.push("Daily Tasks still exposes raw UUID fallback");

  const production = productionOverride ?? productionTsxFiles("apps/frontend/src").map((file) => [file, fs.readFileSync(file, "utf8")]);
  for (const [file, source] of production) {
    if (/\blistAssignableUsers\(\s*\)/.test(source)) found.push(`${file}: assignable-user read omits company scope`);
  }
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["api", "operating_company_id=${encodeURIComponent(operatingCompanyId)}", "company_scope_removed=true"],
    ["backend", "if (parsedQuery.data.operating_company_id) {", "if (parsedQuery.data.company_scope_removed) {"],
    ["createTask", "listAssignableUsers(operatingCompanyId, signal)", "listAssignableUsers(undefined, signal)"],
    ["createTask", 'return entityLabel(u.name || full || u.email, u.id, "User");', "return u.name || full || u.email || u.id;"],
    ["chat", "listAssignableUsers(companyId, signal)", "listAssignableUsers(undefined, signal)"],
    ["daily", 'import { listAssignableUsers } from "../../api/identity";', 'import { listUsers } from "../../api/identity";'],
    ["daily", "listAssignableUsers(companyId, signal)", "listUsers(true)"],
    ["daily", 'entityLabel(user.name || user.email, user.id, "User")', "user.email ?? user.id"],
    ["maintenance", "listAssignableUsers(operatingCompanyId, signal)", "listAssignableUsers(undefined, signal)"],
    ["users", 'entityLabel(user.name ?? user.email, user.id, "User")', "user.name ?? user.email ?? user.id"],
    ["safety", '["identity", "assignable-users", "complaints", companyId]', '["identity", "assignable-users", "complaints"]'],
  ];
  const escaped = [];
  const production = productionTsxFiles("apps/frontend/src").map((file) => [file, fs.readFileSync(file, "utf8")]);
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      escaped.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutatedSource = key === "backend"
      ? sources[key].split(needle).join(replacement)
      : sources[key].replace(needle, replacement);
    const mutant = { ...sources, [key]: mutatedSource };
    const mutatedProduction = production.map(([file, source]) => [file, file === FILES[key] ? mutant[key] : source]);
    if (failures(mutant, mutatedProduction).length === 0) escaped.push(`${key}: planted defect escaped (${needle})`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const found = failures(sources);
if (found.length) {
  console.error(`${LABEL} FAIL\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — assignable-user reads are company-scoped and labels reject raw UUIDs`);
