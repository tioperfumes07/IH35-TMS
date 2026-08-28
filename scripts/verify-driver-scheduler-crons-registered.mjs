#!/usr/bin/env node
/**
 * verify-driver-scheduler-crons-registered.mjs  (P8C-K)
 *
 * Guards the two verified-missing pieces of the Driver Scheduler feature so they cannot silently regress:
 *   1. The THREE leave crons exist, self-schedule, and are each gated behind a DEFAULT-OFF env flag.
 *   2. index.ts imports AND calls each cron's initializer at startup.
 *   3. The driver-facing self-balance route exists, is driver-session scoped (never an arbitrary :driver_id),
 *      and reuses getLeaveBalance.
 *   4. The PWA api wrapper getMyLeaveBalance exists and targets the driver balance route.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:driver-scheduler-crons-registered";
const failures = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

// ── 1. The three cron files ──────────────────────────────────────────────────────
const CRONS = [
  {
    file: "apps/backend/src/cron/driver-leave-advance-reminder.cron.ts",
    init: "initializeDriverLeaveAdvanceReminderCron",
    flag: "DRIVER_LEAVE_ADVANCE_REMINDER_CRON_ENABLED",
  },
  {
    file: "apps/backend/src/cron/driver-leave-balance-rollover.cron.ts",
    init: "initializeDriverLeaveBalanceRolloverCron",
    flag: "DRIVER_LEAVE_BALANCE_ROLLOVER_CRON_ENABLED",
  },
  {
    file: "apps/backend/src/cron/driver-leave-pending-escalation.cron.ts",
    init: "initializeDriverLeavePendingEscalationCron",
    flag: "DRIVER_LEAVE_PENDING_ESCALATION_CRON_ENABLED",
  },
];

for (const c of CRONS) {
  const src = read(c.file);
  if (!src) continue;
  if (!src.includes(`export function ${c.init}`)) failures.push(`${c.file}: missing exported ${c.init}`);
  if (!src.includes("cron.schedule(")) failures.push(`${c.file}: missing cron.schedule()`);
  if (!src.includes("wrapBackgroundJobTick")) failures.push(`${c.file}: must wrap ticks in wrapBackgroundJobTick`);
  if (!src.includes("assertTenantContext")) failures.push(`${c.file}: must assertTenantContext (tenant-scoped)`);
  if (!src.includes("driver_leave_audit_log")) failures.push(`${c.file}: must emit to safety.driver_leave_audit_log`);
  if (!src.includes(c.flag)) failures.push(`${c.file}: missing env flag ${c.flag}`);
  // Default-OFF: the flag must default to "false" and require an explicit "true" to arm.
  const offPattern = new RegExp(`process\\.env\\.${c.flag}\\s*\\?\\?\\s*"false"`);
  if (!offPattern.test(src)) failures.push(`${c.file}: env flag ${c.flag} must default OFF (?? "false")`);
  if (!src.includes(`!== "true"`)) failures.push(`${c.file}: gate must arm only when flag === "true"`);
}

// ── 2. index.ts wiring ───────────────────────────────────────────────────────────
const index = read("apps/backend/src/index.ts");
for (const c of CRONS) {
  if (!index.includes(`from "./cron/${path.basename(c.file, ".ts")}.js"`)) {
    failures.push(`index.ts: missing import of ${c.file}`);
  }
  if (!index.includes(`${c.init}(app)`)) failures.push(`index.ts: must call ${c.init}(app) at startup`);
}

// ── 3. Driver self-balance route ─────────────────────────────────────────────────
const routes = read("apps/backend/src/safety/driver-scheduler.routes.ts");
const driverBalanceUrl = `"/api/v1/driver/scheduler/balance"`;
if (!routes.includes(driverBalanceUrl)) {
  failures.push("routes: missing GET /api/v1/driver/scheduler/balance");
} else {
  // Extract the balance handler body and assert driver-session scoping + reuse.
  const idx = routes.indexOf(driverBalanceUrl);
  const body = routes.slice(Math.max(0, idx - 40), idx + 1_300);
  if (!body.includes("requireDriverSession")) failures.push("routes: driver balance must use requireDriverSession");
  if (!body.includes("req.driver!")) failures.push("routes: driver balance must resolve req.driver! (self, not a param)");
  if (!body.includes("getLeaveBalance")) failures.push("routes: driver balance must reuse getLeaveBalance");
  if (/req\.params/.test(body)) failures.push("routes: driver balance must NOT read a driver_id from params");
}
const driverBalanceIndex = routes.indexOf(driverBalanceUrl);
const driverBalance = driverBalanceIndex >= 0
  ? routes.slice(Math.max(0, driverBalanceIndex - 40), driverBalanceIndex + 1_300)
  : "";

const officeBalanceStart = routes.indexOf('app.get("/api/v1/safety/scheduler/balance/:driver_id"');
const officeBalanceEnd = routes.indexOf('// Office Leave Balances tab', officeBalanceStart);
const officeBalance = officeBalanceStart >= 0 && officeBalanceEnd > officeBalanceStart
  ? routes.slice(officeBalanceStart, officeBalanceEnd)
  : "";
if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(officeBalance)) failures.push("routes: office exact-driver balance GET must be rate-limited");
if (!/dca\.company_id = \$2::uuid[\s\S]{0,180}dca\.is_authorized = true[\s\S]{0,180}dca\.deactivated_at IS NULL/.test(officeBalance)) failures.push("routes: office exact-driver balance must validate owner or active authorization before seeding balance");
const parentRejectIndex = officeBalance.indexOf("if (!parent.rows[0])");
const balanceCallIndex = officeBalance.indexOf("getLeaveBalance(client");
if (parentRejectIndex < 0 || balanceCallIndex <= parentRejectIndex) failures.push("routes: office exact-driver balance must reject invalid parent before getLeaveBalance can seed a row");
if (!/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(officeBalance)) failures.push("routes: office exact-driver balance must return honest invalid-parent 404");

// ── 4. PWA api wrapper ───────────────────────────────────────────────────────────
const pwaApi = read("apps/driver-pwa/src/api/scheduler.ts");
if (!pwaApi.includes("export function getMyLeaveBalance")) {
  failures.push("pwa: missing getMyLeaveBalance wrapper");
}
if (!pwaApi.includes("/api/v1/driver/scheduler/balance")) {
  failures.push("pwa: getMyLeaveBalance must target /api/v1/driver/scheduler/balance");
}

// ── Report ───────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const selfBalanceMutations = [
    (x) => x.replace("requireDriverSession", "missingDriverSession"),
    (x) => x.replace("const parsedQuery", "const leakedDriver = req.params.driver_id;\n    const parsedQuery"),
    (x) => x.replace("getLeaveBalance", "missingLeaveBalance"),
    (x) => x.replace("req.driver!", "req.params.driver_id"),
  ];
  for (const [index, mutate] of selfBalanceMutations.entries()) {
    const broken = mutate(driverBalance);
    const escaped = broken === driverBalance
      || (broken.includes("requireDriverSession")
        && broken.includes("req.driver!")
        && broken.includes("getLeaveBalance")
        && !/req\.params/.test(broken));
    if (escaped) {
      console.error(`${LABEL} — SELFTEST FAILED: planted self-balance defect ${index + 1} escaped`);
      process.exit(1);
    }
  }
  const mutations = [
    (x) => x.replace("dca.is_authorized = true", "TRUE"),
    (x) => x.replace("if (!parent.rows[0])", "if (false)"),
    (x) => x.replace("if (!result.found) return reply.code(404)", "if (false) return reply.code(404)"),
    (x) => x.replace('rateLimit: { max: 60, timeWindow: "1 minute" }', 'rateLimit: { max: 0, timeWindow: "1 minute" }'),
  ];
  for (const mutate of mutations) {
    const broken = mutate(officeBalance);
    const brokenChecks = [
      /rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(broken),
      /dca\.company_id = \$2::uuid[\s\S]{0,180}dca\.is_authorized = true[\s\S]{0,180}dca\.deactivated_at IS NULL/.test(broken),
      broken.indexOf("if (!parent.rows[0])") >= 0 && broken.indexOf("getLeaveBalance(client") > broken.indexOf("if (!parent.rows[0])"),
      /if \(!result\.found\) return reply\.code\(404\)/.test(broken),
    ];
    if (broken === officeBalance || brokenChecks.every(Boolean)) {
      console.error(`${LABEL} — SELFTEST FAILED: planted office-balance defect escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} — SELFTEST OK (4 self-balance + 4 office-balance defects caught)`);
  process.exit(0);
}
console.log(`${LABEL} — OK (3 crons registered + default-OFF gated, driver balance route + PWA wrapper present)`);
