#!/usr/bin/env node
/**
 * verify-notification-action-links-match-routes.mjs  (NOTIFY-F6252)
 *
 * Root cause: three backend notification producers set `action_link` (rendered by the frontend
 * NotificationDropdown's "Open" <Link to={item.action_link}>) to a path that was never registered
 * in apps/frontend/src/routes/manifest.tsx — the wrong string was hand-typed once and never checked
 * against the actual route table:
 *   - dispatch.intransit_issues (critical severity) -> "/dispatch/intransit" (real route:
 *     "/dispatch/in-transit-issues")
 *   - liability.ack_request_sent -> "/drivers/liabilities" (real route: "/liabilities")
 *   - safety anomaly alerts (critical/high severity, GAP-46) -> "/safety/anomaly" (real route:
 *     "/safety/anomaly-alerts")
 * Every one of these silently fell through React Router's catch-all
 * (`<Route path="*" element={<Navigate to="/" replace />} />`) on "Open", with zero visible error —
 * same defect class as DISPATCH-F6251 (owner-override-log), found by auditing every static
 * action_link string in the backend against the registered route table.
 *
 * This guard makes the regression impossible to re-ship: each producer's action_link literal must
 * use the real registered path prefix, not the stale/wrong one.
 *
 * Usage:
 *   node scripts/verify-notification-action-links-match-routes.mjs            # scan
 *   node scripts/verify-notification-action-links-match-routes.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const CHECKS = [
  {
    file: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
    badPattern: /actionLink:\s*\(p\)\s*=>\s*`\/dispatch\/intransit\?/,
    goodPattern: /actionLink:\s*\(p\)\s*=>\s*`\/dispatch\/in-transit-issues\?/,
    label: "dispatch.intransit_issues action_link must use /dispatch/in-transit-issues (registered route), not /dispatch/intransit",
  },
  {
    file: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
    badPattern: /actionLink:\s*\(p\)\s*=>\s*`\/drivers\/liabilities\?/,
    goodPattern: /actionLink:\s*\(p\)\s*=>\s*`\/liabilities\?/,
    label: "liability.ack_request_sent action_link must use /liabilities (registered route), not /drivers/liabilities",
  },
  {
    file: "apps/backend/src/safety/anomaly/notification.service.ts",
    badPattern: /action_link:\s*`\/safety\/anomaly\?/,
    goodPattern: /action_link:\s*`\/safety\/anomaly-alerts\?/,
    label: "anomaly alert action_link must use /safety/anomaly-alerts (registered route), not /safety/anomaly",
  },
];

export function checkActionLinks(sources) {
  const offenders = [];
  for (const check of CHECKS) {
    const src = sources[check.file];
    if (src === undefined) {
      offenders.push(`${check.file}: file not found`);
      continue;
    }
    if (check.badPattern.test(src)) {
      offenders.push(`${check.file}: ${check.label} — NOTIFY-F6252 regression shape found`);
      continue;
    }
    if (!check.goodPattern.test(src)) {
      offenders.push(`${check.file}: expected fixed action_link pattern not found — has this producer moved or been rewritten? Re-verify this guard still applies. (${check.label})`);
    }
  }
  return offenders;
}

export function run() {
  const files = [...new Set(CHECKS.map((c) => c.file))];
  const sources = {};
  for (const f of files) {
    const abs = path.join(repoRoot, f);
    sources[f] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : undefined;
  }
  const offenders = checkActionLinks(sources);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = {
    "apps/backend/src/outbox/handlers/operational-notice.routes.ts": [
      'actionLink: (p) => `/dispatch/intransit?issue_id=${text(p, "issue_id") ?? ""}`,',
      'actionLink: (p) => `/drivers/liabilities?liability_id=${text(p, "liability_id") ?? ""}`,',
    ].join("\n"),
    "apps/backend/src/safety/anomaly/notification.service.ts": "action_link: `/safety/anomaly?alert=${alertUuid}`,",
  };
  const fixed = {
    "apps/backend/src/outbox/handlers/operational-notice.routes.ts": [
      'actionLink: (p) => `/dispatch/in-transit-issues?issue_id=${text(p, "issue_id") ?? ""}`,',
      'actionLink: (p) => `/liabilities?liability_id=${text(p, "liability_id") ?? ""}`,',
    ].join("\n"),
    "apps/backend/src/safety/anomaly/notification.service.ts": "action_link: `/safety/anomaly-alerts?alert=${alertUuid}`,",
  };

  const buggyFails = checkActionLinks(buggy).length > 0;
  const fixedPasses = checkActionLinks(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:notification-action-links-match-routes selftest OK");
    process.exit(0);
  }
  console.error("verify:notification-action-links-match-routes selftest FAILED", { buggyFails, fixedPasses, buggyOffenders: checkActionLinks(buggy), fixedOffenders: checkActionLinks(fixed) });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:notification-action-links-match-routes FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:notification-action-links-match-routes OK — all three action_link literals match their registered frontend routes");
}
