#!/usr/bin/env node
/**
 * Q8-SUBSCRIPTIONS-SILENT-NO-DELIVERY — SubscriptionManager.tsx ("Scheduled report subscriptions",
 * /reports/scheduled) shows real rows from reports.scheduled_subscriptions (a genuinely working CRUD
 * API/table) with an "Active" status pill and Last sent / Next columns, but NO backend worker anywhere
 * in the repo ever reads that table to send an email. Confirmed live on Neon: of 18 rows, 17 are
 * is_active=true, 0 have ever had last_sent_at set, 0 have a non-null next_scheduled_at, and
 * reports.scheduled_delivery_log has 0 rows total — the oldest active row was created 2026-06-08, so
 * this has been silently true for 2.5+ months. Without a visible caveat, "Active" + blank Last sent/Next
 * reads as "hasn't fired yet" rather than "will never fire" — a silent no-op that misleads the Owner.
 *
 * This guard mutation-proves the honest banner stays present and is not gated behind a condition that
 * can quietly go false (e.g. an error-only check) — it must render unconditionally on the page, the same
 * way the defect is unconditional (no report_slug has a working generator today).
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/reports/SubscriptionManager.tsx";
const source = fs.readFileSync(FILE, "utf8");

// Strip JSX/line comments before matching structural conditions, so the guard's own explanatory
// comments (or the component's) can never satisfy its own checks — same self-shadowing class fixed in
// verify-audit-report-page-no-double-pagination.mjs earlier this session.
function stripComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|\s)\/\/.*$/gm, "$1"); // line comments
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const stripped = stripComments(text);

  need(
    stripped.includes('data-testid="q8-subscriptions-delivery-not-implemented"'),
    "the honest 'email delivery is not implemented yet' banner (data-testid=q8-subscriptions-delivery-not-implemented) must be present in SubscriptionManager.tsx"
  );
  need(
    /Email delivery is not implemented yet/.test(stripped),
    "the banner's headline text must say delivery is not implemented — do not soften this to \"coming soon\" or remove it while the worker genuinely does not exist"
  );
  need(
    /no backend worker exists to send them/i.test(stripped),
    "the banner must explain WHY: no backend worker sends these, so Active does not mean emails go out"
  );

  // The banner must render unconditionally — not gated inside subsQuery.isError / subsQuery.isSuccess
  // or any other conditional block, since the underlying defect is unconditional (true for every row,
  // not just on an API error or once data loads).
  const bannerBlockMatch = stripped.match(
    /<div\s+className="rounded-sm border border-slate-200[^"]*"\s+data-testid="q8-subscriptions-delivery-not-implemented"[\s\S]*?<\/div>/
  );
  need(bannerBlockMatch, "could not isolate the banner's own <div> block to check it is unconditional");
  if (bannerBlockMatch) {
    const before = stripped.slice(0, bannerBlockMatch.index);
    // Walk backward from the banner to the nearest unmatched conditional opener on the same JSX level.
    // Cheap heuristic: the banner must not be immediately preceded by `? (` or `&&` with no intervening
    // `: null` / closing `)}` at the same nesting depth right before it (which would mean it is the
    // truthy branch of a ternary/&&-guard rather than an unconditional sibling).
    const tail = before.slice(-40).replace(/\s+/g, " ");
    need(
      !/[?&]\s*\(?\s*$/.test(tail) && !/&&\s*\(?\s*$/.test(tail),
      "the banner must render unconditionally (not only inside a ?/&& guard) — the delivery gap is true for every row, not a conditional error state"
    );
  }

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
      name: "remove the banner's data-testid",
      mutate: (t) => t.replace('data-testid="q8-subscriptions-delivery-not-implemented"', 'data-testid="removed"'),
    },
    {
      name: "soften the headline to hide the real defect",
      mutate: (t) => t.replace("Email delivery is not implemented yet", "Email delivery coming soon"),
    },
    {
      name: "drop the 'why' explanation",
      mutate: (t) => t.replace(/no backend worker exists to send them ?—? ?/i, ""),
    },
    {
      name: "gate the banner behind a conditional so it can silently stop rendering",
      mutate: (t) =>
        t.replace(
          '<div\n        className="rounded-sm border border-slate-200 bg-slate-100 p-4 text-sm"\n        data-testid="q8-subscriptions-delivery-not-implemented"\n      >',
          'false ? (\n      <div\n        className="rounded-sm border border-slate-200 bg-slate-100 p-4 text-sm"\n        data-testid="q8-subscriptions-delivery-not-implemented"\n      >'
        ),
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

console.log("verify-subscription-manager-delivery-banner PASS — SubscriptionManager.tsx honestly discloses that no backend worker delivers Q8 subscriptions yet");
