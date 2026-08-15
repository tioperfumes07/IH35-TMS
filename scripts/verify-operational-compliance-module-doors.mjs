#!/usr/bin/env node
/** Navigation-existence guard only. Route hops do not earn API→canonical connectivity Built credit. */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  shared: "apps/frontend/src/components/shared/RelatedModuleLinks.tsx",
  compliance: "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx",
  driverHub: "apps/frontend/src/pages/home/DriverHubPage.tsx",
  form425: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
  tasks: "apps/frontend/src/pages/tasks/TasksModuleTabs.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("shared", 'aria-label="Related modules"', "shared related-door navigation must be named");
  need("shared", "links.map((link)", "shared related-door navigation must render every configured link");
  need("shared", "<Link", "shared related doors must use browser-native route links");
  const expected = {
    compliance: [
      'testId="compliance-related-module-links"', 'to: "/safety/hos"', 'to: "/safety/dot-compliance"',
      'to: "/425c"', 'to: "/maintenance/compliance"', 'to: "/fuel/compliance"', 'to: "/reports/ifta-preparer"',
    ],
    driverHub: ['testId="driver-hub-related-module-links"', 'to: "/drivers"', 'to: "/safety/driver-scheduler"'],
    form425: ['testId="form-425c-related-module-links"', 'to: "/safety/audit-425c"', 'to: "/maintenance/compliance"', 'to: "/compliance"'],
    tasks: ['testId="tasks-related-module-links"', 'to: "/daily-tasks"', 'to: "/lists/maintenance/service-tasks"'],
  };
  for (const [key, texts] of Object.entries(expected)) {
    for (const text of texts) need(key, text, `${key} must keep related door ${text}`);
  }
  for (const route of ["/safety/hos", "/safety/dot-compliance", "/425c", "/maintenance/compliance", "/fuel/compliance", "/reports/ifta-preparer", "/drivers", "/safety/driver-scheduler", "/safety/audit-425c", "/compliance", "/daily-tasks", "/lists/maintenance/service-tasks"]) {
    const path = route.startsWith("/safety/") ? `path="${route.slice("/safety/".length)}"` : `path="${route}"`;
    need("routes", path, `route ${route} must remain mounted`);
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("operational/compliance module-door guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["shared", 'aria-label="Related modules"', 'aria-label=""'],
    ["shared", "links.map((link)", "[].map((link)"],
    ["compliance", 'to: "/safety/hos"', 'to: "/compliance"'],
    ["compliance", 'to: "/safety/dot-compliance"', 'to: "/compliance"'],
    ["compliance", 'to: "/425c"', 'to: "/compliance"'],
    ["compliance", 'to: "/maintenance/compliance"', 'to: "/compliance"'],
    ["compliance", 'to: "/fuel/compliance"', 'to: "/compliance"'],
    ["compliance", 'to: "/reports/ifta-preparer"', 'to: "/compliance"'],
    ["driverHub", 'to: "/drivers"', 'to: "/driver-hub"'],
    ["driverHub", 'to: "/safety/driver-scheduler"', 'to: "/driver-hub"'],
    ["form425", 'to: "/safety/audit-425c"', 'to: "/425c"'],
    ["form425", 'to: "/maintenance/compliance"', 'to: "/425c"'],
    ["form425", 'to: "/compliance"', 'to: "/425c"'],
    ["tasks", 'to: "/daily-tasks"', 'to: "/tasks"'],
    ["tasks", 'to: "/lists/maintenance/service-tasks"', 'to: "/tasks"'],
    ["routes", 'path="hos"', 'path="hos-broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: Compliance, Driver Hub, Form 425C, and Tasks expose mounted related-module doors");
