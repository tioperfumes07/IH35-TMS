#!/usr/bin/env node
/**
 * Q8 scheduled subscriptions — SubscriptionManager delivery BoardSection must name the real
 * emailer (jobs/scheduled-reports-emailer → runDue), not a "coming soon" / "no worker" shell.
 * ROUND 7.11 closed the null-next seed gap in runner.service (ensureActiveSubscriptionNextScheduledAt).
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/reports/SubscriptionManager.tsx";
const source = fs.readFileSync(FILE, "utf8");

function stripComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const stripped = stripComments(text);

  need(
    /testId="q8-subscriptions-delivery-board"/.test(stripped),
    "delivery honesty must live inside BoardSection testId=q8-subscriptions-delivery-board"
  );
  need(
    stripped.includes('data-testid="q8-subscriptions-delivery-board-body"') ||
      stripped.includes('data-testid="q8-subscriptions-delivery-not-implemented"'),
    "delivery board body testId must be present"
  );
  need(
    /scheduled-reports emailer/i.test(stripped) || /Email delivery runs on the scheduled-reports emailer/.test(stripped),
    "banner must name the scheduled-reports emailer (real worker — not a shell)"
  );
  need(
    /15 minutes/i.test(stripped),
    "banner must disclose the */15 America/Chicago tick cadence"
  );
  need(
    !/Email delivery (?:is not implemented yet|has no worker yet|coming soon)/i.test(stripped),
    "do not keep the retired 'no worker / coming soon' headline — the emailer + generators exist"
  );
  need(
    !/no backend worker exists to send them/i.test(stripped),
    "do not claim no backend worker exists — jobs/scheduled-reports-emailer is mounted at startup"
  );

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-subscription-manager-delivery-banner FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "drop BoardSection testId",
      mutate: (t) => t.replace('testId="q8-subscriptions-delivery-board"', 'testId="removed"'),
    },
    {
      name: "restore retired no-worker headline",
      mutate: (t) =>
        t.replace(
          "Email delivery runs on the scheduled-reports emailer",
          "Email delivery has no worker yet"
        ),
    },
    {
      name: "claim no backend worker",
      mutate: (t) =>
        t.replace(
          /Worker ticks every 15 minutes \(America\/Chicago\)\./,
          "no backend worker exists to send them — Active status does not mean emails are going out."
        ),
    },
    {
      name: "drop cadence disclosure",
      mutate: (t) => t.replace(/15 minutes/gi, "occasionally"),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source — test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-subscription-manager-delivery-banner SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-subscription-manager-delivery-banner PASS — SubscriptionManager names the live scheduled-reports emailer"
);
