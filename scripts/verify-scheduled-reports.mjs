#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern =
      check.pattern instanceof RegExp
        ? check.pattern
        : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

function editorModeContractFailures(managerSource, editorSource) {
  const problems = [];
  const requireMatch = (source, pattern, label) => {
    if (!pattern.test(source)) problems.push(label);
  };

  requireMatch(
    editorSource,
    /mode:\s*"create"\s*\|\s*"edit"/,
    "editor requires an explicit create/edit mode",
  );
  requireMatch(
    editorSource,
    /mode\s*===\s*"edit"\s*\?\s*"Edit subscription"\s*:\s*"Add subscription"/,
    "drawer title distinguishes create from edit",
  );
  requireMatch(
    editorSource,
    /disabled=\{mode\s*===\s*"edit"\}/,
    "report picker is locked only while editing",
  );
  requireMatch(
    editorSource,
    /mode\s*===\s*"edit"\s*\?\s*"Save changes"\s*:\s*"Add subscription"/,
    "submit action distinguishes create from edit",
  );
  requireMatch(
    managerSource,
    /mode=\{editing\s*\?\s*"edit"\s*:\s*"create"\}/,
    "manager forwards canonical editor mode",
  );
  requireMatch(
    managerSource,
    /:\s*\{\s*recipient_emails:\s*user\?\.email\s*\?\s*\[user\.email\]\s*:\s*\[\]\s*\}/,
    "create mode seeds the signed-in owner email without borrowing an existing subscription",
  );
  return problems;
}

const migration = read(
  "db/migrations/202606080206_scheduled_report_subscriptions.sql",
);
contains(
  "db/migrations/202606080206_scheduled_report_subscriptions.sql",
  migration,
  [
    {
      pattern: /reports\.scheduled_subscriptions/,
      label: "scheduled_subscriptions table",
    },
    {
      pattern: /reports\.scheduled_delivery_log/,
      label: "scheduled_delivery_log table",
    },
    { pattern: /weekly-cash-position/, label: "weekly-cash-position seed" },
    {
      pattern: /weekly-driver-settlement-preview/,
      label: "weekly-driver-settlement-preview seed",
    },
    { pattern: /weekly-ar-aging-60/, label: "weekly-ar-aging-60 seed" },
    { pattern: /monthly-pnl/, label: "monthly-pnl seed" },
    { pattern: /quarterly-ifta-preview/, label: "quarterly-ifta-preview seed" },
    {
      pattern: /daily-safety-alerts-digest/,
      label: "daily-safety-alerts-digest seed",
    },
    {
      pattern: /scheduled_subs_tenant_scope/,
      label: "RLS policy on subscriptions",
    },
    {
      pattern:
        /GRANT SELECT, INSERT, UPDATE ON reports\.scheduled_subscriptions TO ih35_app/,
      label: "ih35_app grants",
    },
  ],
);

const routes = read("apps/backend/src/reports/scheduled/routes.ts");
contains("apps/backend/src/reports/scheduled/routes.ts", routes, [
  {
    pattern: /\/api\/v1\/reports\/scheduled\/subscriptions/,
    label: "subscriptions list route",
  },
  {
    pattern: /app\.post\("\/api\/v1\/reports\/scheduled\/subscriptions"/,
    label: "subscriptions create route",
  },
  {
    pattern: /subscriptions\/:uuid\/deactivate/,
    label: "deactivate route (no delete)",
  },
  {
    pattern: /\/api\/v1\/reports\/scheduled\/delivery-log/,
    label: "delivery log route",
  },
  { pattern: /requireOwner/, label: "Owner-only guard" },
  {
    pattern: /registerScheduledSubscriptionRoutes/,
    label: "routes register export",
  },
]);

const worker = read("apps/backend/src/jobs/scheduled-reports-emailer.ts");
contains("apps/backend/src/jobs/scheduled-reports-emailer.ts", worker, [
  { pattern: /\*\/15 \* \* \* \*/, label: "15-minute cron" },
  { pattern: /initializeScheduledReportsEmailer/, label: "worker initializer" },
  { pattern: /runDue/, label: "runner wired" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  {
    pattern: /registerScheduledSubscriptionRoutes/,
    label: "routes registered in index.ts",
  },
  {
    pattern: /initializeScheduledReportsEmailer/,
    label: "worker registered in index.ts",
  },
]);

const runner = read("apps/backend/src/reports/scheduled/runner.service.ts");
contains("apps/backend/src/reports/scheduled/runner.service.ts", runner, [
  { pattern: /enqueueEmail/, label: "enqueueEmail integration" },
  { pattern: /appendDeliveryLog/, label: "delivery log writes" },
]);

read("apps/backend/src/reports/scheduled/__tests__/scheduled.test.ts");

const manager = read("apps/frontend/src/pages/reports/SubscriptionManager.tsx");
contains("apps/frontend/src/pages/reports/SubscriptionManager.tsx", manager, [
  { pattern: /SubscriptionManager/, label: "SubscriptionManager export" },
  { pattern: /subscription-manager/, label: "subscription manager test id" },
  {
    pattern: /\/api\/v1\/reports\/scheduled\/subscriptions/,
    label: "subscriptions API wired",
  },
]);

const editor = read(
  "apps/frontend/src/components/reports/SubscriptionEditor.tsx",
);
contains(
  "apps/frontend/src/components/reports/SubscriptionEditor.tsx",
  editor,
  [
    {
      pattern:
        /<SelectCombobox[\s\S]*?aria-label="Report"[\s\S]*?value=\{reportSlug\}/,
      label: "searchable report picker",
    },
  ],
);
if (/<select[\s\S]{0,300}value=\{reportSlug\}/.test(editor)) {
  fail(
    "apps/frontend/src/components/reports/SubscriptionEditor.tsx: report picker regressed to a native select",
  );
}
for (const problem of editorModeContractFailures(manager, editor)) {
  fail(`scheduled subscription create/edit contract: ${problem}`);
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /SubscriptionManager/, label: "SubscriptionManager in manifest" },
  { pattern: /\/reports\/scheduled/, label: "/reports/scheduled route" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  {
    pattern: /verify:scheduled-reports/,
    label: "verify:scheduled-reports script",
  },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  {
    pattern: /verify:scheduled-reports/,
    label: "CI verify:scheduled-reports gate",
  },
]);

read("docs/specs/gap-43-scheduled-reports.md");

if (process.argv.includes("--selftest")) {
  if (failures.length > 0) {
    console.error("verify:scheduled-reports SELFTEST precondition failed");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }

  const mutations = [
    [
      "editor-mode-prop",
      manager,
      editor.replace(/mode:\s*"create"\s*\|\s*"edit";/, ""),
    ],
    [
      "create-heading",
      manager,
      editor.replace(
        '{mode === "edit" ? "Edit subscription" : "Add subscription"}',
        '"Edit subscription"',
      ),
    ],
    [
      "edit-only-report-lock",
      manager,
      editor.replace(
        'disabled={mode === "edit"}',
        "disabled={Boolean(initial?.report_slug)}",
      ),
    ],
    [
      "create-submit-label",
      manager,
      editor.replace(
        '{mode === "edit" ? "Save changes" : "Add subscription"}',
        '"Save"',
      ),
    ],
    [
      "manager-mode-forwarding",
      manager.replace('mode={editing ? "edit" : "create"}', 'mode="edit"'),
      editor,
    ],
    [
      "create-owner-email",
      manager.replace(
        ": { recipient_emails: user?.email ? [user.email] : [] }",
        ": undefined",
      ),
      editor,
    ],
  ];
  const escaped = [];
  for (const [name, mutatedManager, mutatedEditor] of mutations) {
    if (mutatedManager === manager && mutatedEditor === editor) {
      escaped.push(`${name} mutation anchor was inert`);
      continue;
    }
    if (
      editorModeContractFailures(mutatedManager, mutatedEditor).length === 0
    ) {
      escaped.push(`${name} mutation escaped`);
    }
  }
  if (escaped.length > 0) {
    console.error("verify:scheduled-reports SELFTEST FAIL");
    for (const message of escaped) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    `verify:scheduled-reports SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`,
  );
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:scheduled-reports FAIL");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("verify:scheduled-reports PASS");
