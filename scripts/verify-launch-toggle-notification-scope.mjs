#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  toggles: "apps/backend/src/admin/launch-toggles.ts",
  notices: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
};

export function problems(s) {
  const failures = [];
  if (/SELECT\s+id,\s*email[\s\S]{0,180}?FROM\s+identity\.users[\s\S]{0,180}?role\s*=\s*'Owner'/.test(s.toggles)) {
    failures.push("launch notice must not enumerate global Owner users");
  }
  if (s.toggles.includes('event_type: "report.scheduled.delivered"')) failures.push("launch notice must not impersonate a report-delivery event");
  for (const eventType of ["admin.carrier.launched", "admin.carrier.rollback"]) {
    if (!new RegExp(`enqueueOutboxEvent\\([\\s\\S]{0,120}?"${eventType}"[\\s\\S]{0,220}?operating_company_id:\\s*carrierId`).test(s.toggles)) {
      failures.push(`${eventType} must enqueue transactionally with selected-company scope`);
    }
    if (!s.notices.includes(`eventType: "${eventType}"`)) failures.push(`${eventType} needs a registered operational consumer`);
  }
  if ((s.notices.match(/actionLink: \(\) => "\/admin\/launch-toggles"/g) ?? []).length < 2) failures.push("both launch lifecycle notices need the mounted admin drill");
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(rel, "utf8")]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["global owners", { ...production, toggles: `${production.toggles}\nSELECT id, email FROM identity.users WHERE role = 'Owner'` }],
    ["wrong taxonomy", { ...production, toggles: `${production.toggles}\nevent_type: "report.scheduled.delivered"` }],
    ["launch producer", { ...production, toggles: production.toggles.replace('enqueueOutboxEvent(\n      client,\n      "admin.carrier.launched"', 'enqueueOutboxEvent(\n      client,\n      "admin.carrier.REMOVED"') }],
    ["rollback consumer", { ...production, notices: production.notices.replace('eventType: "admin.carrier.rollback"', 'eventType: "admin.carrier.REMOVED"') }],
    ["mounted drill", { ...production, notices: production.notices.replace('actionLink: () => "/admin/launch-toggles"', 'actionLink: () => "/missing"') }],
  ];
  const missed = mutations.filter(([, fixture]) => problems(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-launch-toggle-notification-scope SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-launch-toggle-notification-scope selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}
const failures = problems(production);
if (failures.length) {
  console.error(`verify-launch-toggle-notification-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-launch-toggle-notification-scope PASS — launch lifecycle notices are transactional, typed, and selected-company scoped");
