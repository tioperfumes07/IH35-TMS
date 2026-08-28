#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity","qbo_chrome"],"leaves":["chrome.subnav"],"task":"DSP-F7123-DISPATCH-SUBNAV-BADGE-FAILURES-MASQUERADE-AS-ZERO","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchSubnav.tsx";
const live = fs.readFileSync(file, "utf8");

const queryNames = [
  "dashboardQ",
  "assignmentsQ",
  "atRiskQ",
  "detentionQ",
  "lateQ",
  "positionsQ",
  "factoringQ",
  "unassignedQ",
  "templatesQ",
  "podQ",
  "ocrQ",
];

function failures(source) {
  const found = [];
  for (const query of queryNames) {
    const honestBadge = new RegExp(
      `!${query}\\.isLoading\\s*&&\\s*!${query}\\.isError\\s*\\?`,
    );
    if (!honestBadge.test(source))
      found.push(`${query} failure can render a false zero badge`);
  }
  if (!source.includes('data-testid="dispatch-subnav-badge-error"'))
    found.push("visible consolidated failure state missing");
  if (!source.includes("Some queue counts are unavailable."))
    found.push("honest failure copy missing");
  if (!source.includes("failedBadgeQueries) void query.refetch()"))
    found.push("failed-query Retry missing");
  return found;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    live.replace(" && !dashboardQ.isError", ""),
    live.replace(
      'data-testid="dispatch-subnav-badge-error"',
      'data-testid="removed"',
    ),
    live.replace(
      "failedBadgeQueries) void query.refetch()",
      "[]) void query.refetch()",
    ),
  ];
  const missed = mutations.filter((source) => failures(source).length === 0);
  if (missed.length) {
    console.error(
      `FAIL: selftest missed ${missed.length} planted badge-honesty regressions`,
    );
    process.exit(1);
  }
  const liveFailures = failures(live);
  if (liveFailures.length) {
    console.error(
      `FAIL: live source failed selftest: ${liveFailures.join("; ")}`,
    );
    process.exit(1);
  }
  console.log(
    `PASS: selftest caught ${mutations.length} badge-honesty regressions`,
  );
  process.exit(0);
}

const found = failures(live);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log(
  "PASS: all dispatch subnav queue failures stay unknown and expose Retry",
);
