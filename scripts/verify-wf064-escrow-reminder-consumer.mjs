#!/usr/bin/env node
/**
 * FINDING: row 600 (AUDIT-COVERAGE-LIVE, 2026-08-02) — "Escrow-deduction-pending service writes
 * wf064_requested_at and wf064_reminder_7d_at columns. But no downstream consumer ever reads them
 * to trigger the actual deduction run. The settlement distribution cycle is inert."
 *
 * VERIFIED (2026-08-16): that claim no longer holds. escrow-deduction-pending.service.ts exports
 * processEscrowPendingExpiryReminders(), which DOES read wf064_reminder_7d_at (WHERE ... IS NULL to
 * find candidates, WHERE ... IS NOT NULL to find expired-and-reminded rows), sends a real owner
 * notification, stamps wf064_reminder_7d_at, and expires rows whose window fully lapsed. It is
 * wired as a real consumer: escrow-deduction-pending.routes.ts calls it inline from the
 * GET /api/v1/driver-finance/escrow-deductions-pending list handler (a lazy/on-read trigger — every
 * time an Owner/Administrator opens the pending-deductions surface, due reminders and expiries
 * process for real). This is a different mechanism from row 610's outbox-event WF-064 override
 * notice (see verify-wf064-override-notice-consumer.mjs) and is NOT gated behind the same registry.
 *
 * This guard is the ratchet that keeps that claim honest: the function must remain exported, be
 * genuinely called from the routes file (not merely imported), and its body must still perform the
 * real notify + wf064_reminder_7d_at UPDATE + status='expired' UPDATE — not be reduced to a stub.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wf064-escrow-reminder-consumer";
const SERVICE_REL = "apps/backend/src/driver-finance/escrow-deduction-pending.service.ts";
const ROUTES_REL = "apps/backend/src/driver-finance/escrow-deduction-pending.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against mutated in-memory copies. */
export function assertConsumerWired({ serviceSource, routesSource }) {
  const errors = [];

  if (!/export\s+async\s+function\s+processEscrowPendingExpiryReminders/.test(serviceSource)) {
    errors.push("processEscrowPendingExpiryReminders is no longer exported from escrow-deduction-pending.service.ts");
  }
  if (!serviceSource.includes("wf064_reminder_7d_at IS NULL")) {
    errors.push("service no longer selects candidates by wf064_reminder_7d_at IS NULL — the reminder read is gone");
  }
  if (!/SET\s+wf064_reminder_7d_at\s*=\s*now\(\)/.test(serviceSource)) {
    errors.push("service no longer stamps wf064_reminder_7d_at — a reminder could refire forever");
  }
  if (!/status\s*=\s*'expired'/.test(serviceSource)) {
    errors.push("service no longer expires lapsed pending deductions after the reminder window");
  }
  if (!routesSource.includes("processEscrowPendingExpiryReminders")) {
    errors.push("escrow-deduction-pending.routes.ts no longer calls processEscrowPendingExpiryReminders — the consumer would be unreachable again, the exact row-600 defect");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const serviceLive = read(SERVICE_REL);
  const routesLive = read(ROUTES_REL);

  const liveErrors = assertConsumerWired({ serviceSource: serviceLive, routesSource: routesLive });
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "function no longer exported",
      { serviceSource: serviceLive.replace("export async function processEscrowPendingExpiryReminders", "async function processEscrowPendingExpiryReminders"), routesSource: routesLive },
      "no longer exported",
    ],
    [
      "reminder-candidate read dropped",
      { serviceSource: serviceLive.replace("wf064_reminder_7d_at IS NULL", "true"), routesSource: routesLive },
      "reminder read is gone",
    ],
    [
      "reminder stamp removed",
      { serviceSource: serviceLive.replace(/SET wf064_reminder_7d_at = now\(\)/, "SET updated_at = now()"), routesSource: routesLive },
      "no longer stamps wf064_reminder_7d_at",
    ],
    [
      "expiry write removed",
      { serviceSource: serviceLive.replace(/status = 'expired'/, "updated_at = now()"), routesSource: routesLive },
      "no longer expires lapsed",
    ],
    [
      "route no longer calls the consumer",
      { serviceSource: serviceLive, routesSource: routesLive.replace(/processEscrowPendingExpiryReminders/g, "removed") },
      "no longer calls processEscrowPendingExpiryReminders",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated.serviceSource === serviceLive && mutated.routesSource === routesLive) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertConsumerWired(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errors = assertConsumerWired({
    serviceSource: read(SERVICE_REL),
    routesSource: read(ROUTES_REL),
  });
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
