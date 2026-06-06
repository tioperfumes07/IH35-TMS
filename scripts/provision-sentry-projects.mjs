#!/usr/bin/env node
/**
 * provision-sentry-projects.mjs
 *
 * Provisions 3 Sentry projects (ih35-tms-prod, ih35-tms-staging, ih35-tms-dev)
 * and creates 3 baseline alert rules per project:
 *   1. 5xx error rate > 1% over 5 min
 *   2. p95 latency > 2s on any route
 *   3. DB connection pool exhausted (error message match)
 *
 * Requires:
 *   SENTRY_AUTH_TOKEN  — Sentry internal integration token (Settings → Developer Settings)
 *   SENTRY_ORG_SLUG    — Sentry organization slug (shown in org URL)
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=<token> SENTRY_ORG_SLUG=<org> node scripts/provision-sentry-projects.mjs
 *
 * If the API token is unavailable, this script prints a manual setup guide and exits 0.
 */

const AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const ORG_SLUG = process.env.SENTRY_ORG_SLUG;
const ALERT_EMAIL = "jorge@ih35trucking.net";

const PROJECTS = [
  { name: "IH35 TMS Production", slug: "ih35-tms-prod", platform: "node" },
  { name: "IH35 TMS Staging", slug: "ih35-tms-staging", platform: "node" },
  { name: "IH35 TMS Dev", slug: "ih35-tms-dev", platform: "node" },
];

if (!AUTH_TOKEN || !ORG_SLUG) {
  printManualSetupGuide();
  process.exit(0);
}

const BASE_URL = `https://sentry.io/api/0`;

async function sentryFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

async function ensureProject({ name, slug, platform }) {
  // Check if project already exists
  const { ok, json, status } = await sentryFetch(
    `/projects/${ORG_SLUG}/${slug}/`
  );
  if (ok) {
    console.log(`  ✓ Project ${slug} already exists`);
    return json;
  }
  if (status !== 404) {
    throw new Error(`Unexpected status ${status} checking project ${slug}: ${JSON.stringify(json)}`);
  }

  // Create the project under the first team (required by Sentry API)
  const teamsRes = await sentryFetch(`/organizations/${ORG_SLUG}/teams/`);
  if (!teamsRes.ok || !teamsRes.json.length) {
    throw new Error(`Cannot list teams for org ${ORG_SLUG}. Create a team first.`);
  }
  const teamSlug = teamsRes.json[0].slug;

  const createRes = await sentryFetch(`/teams/${ORG_SLUG}/${teamSlug}/projects/`, {
    method: "POST",
    body: { name, slug, platform },
  });
  if (!createRes.ok) {
    throw new Error(
      `Failed to create project ${slug}: ${JSON.stringify(createRes.json)}`
    );
  }
  console.log(`  + Created project ${slug}`);
  return createRes.json;
}

async function getProjectDsn(slug) {
  const { ok, json } = await sentryFetch(
    `/projects/${ORG_SLUG}/${slug}/keys/`
  );
  if (!ok || !json.length) return null;
  return json[0].dsn?.public ?? null;
}

async function ensureAlertRule(projectSlug, rule) {
  // List existing rules to avoid duplicates
  const { ok, json } = await sentryFetch(
    `/projects/${ORG_SLUG}/${projectSlug}/alert-rules/`
  );
  if (ok) {
    const existing = json.find((r) => r.name === rule.name);
    if (existing) {
      console.log(`    ✓ Alert "${rule.name}" already exists`);
      return;
    }
  }

  const createRes = await sentryFetch(
    `/projects/${ORG_SLUG}/${projectSlug}/alert-rules/`,
    { method: "POST", body: rule }
  );
  if (!createRes.ok) {
    // Non-fatal: log and continue
    console.warn(
      `    ⚠ Could not create alert "${rule.name}": ${JSON.stringify(createRes.json)}`
    );
    return;
  }
  console.log(`    + Created alert "${rule.name}"`);
}

function buildAlertRules(projectSlug) {
  const emailAction = {
    id: null,
    type: "email",
    targetType: "user",
    targetIdentifier: ALERT_EMAIL,
  };

  return [
    {
      name: "5xx error rate > 1% (5 min)",
      environment: null,
      dataset: "events",
      query: "level:error",
      aggregate: "count()",
      timeWindow: 5,
      thresholdType: 0, // above
      resolveThreshold: null,
      triggers: [
        {
          label: "critical",
          alertThreshold: 1,
          actions: [emailAction],
        },
      ],
      projects: [projectSlug],
      owner: null,
      monitorType: 0,
    },
    {
      name: "p95 latency > 2s",
      environment: null,
      dataset: "transactions",
      query: "",
      aggregate: "p95(transaction.duration)",
      timeWindow: 5,
      thresholdType: 0,
      resolveThreshold: null,
      triggers: [
        {
          label: "critical",
          alertThreshold: 2000,
          actions: [emailAction],
        },
      ],
      projects: [projectSlug],
      owner: null,
      monitorType: 0,
    },
    {
      name: "DB pool exhausted",
      environment: null,
      dataset: "events",
      query: "db.pool.exhausted OR connection pool",
      aggregate: "count()",
      timeWindow: 5,
      thresholdType: 0,
      resolveThreshold: null,
      triggers: [
        {
          label: "critical",
          alertThreshold: 1,
          actions: [emailAction],
        },
      ],
      projects: [projectSlug],
      owner: null,
      monitorType: 0,
    },
  ];
}

async function main() {
  console.log(`\nProvisioning Sentry projects for org: ${ORG_SLUG}\n`);

  const dsns = {};

  for (const project of PROJECTS) {
    console.log(`\n[${project.slug}]`);
    try {
      await ensureProject(project);

      const dsn = await getProjectDsn(project.slug);
      dsns[project.slug] = dsn;
      if (dsn) {
        console.log(`  DSN: ${dsn}`);
      } else {
        console.warn(`  ⚠ Could not retrieve DSN for ${project.slug}`);
      }

      const rules = buildAlertRules(project.slug);
      for (const rule of rules) {
        await ensureAlertRule(project.slug, rule);
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  console.log("\n=== DSN Summary ===");
  for (const [slug, dsn] of Object.entries(dsns)) {
    console.log(`  ${slug}: ${dsn ?? "(not retrieved)"}`);
  }

  console.log(`\nSentry org: https://sentry.io/organizations/${ORG_SLUG}/`);
  console.log("\nNext steps:");
  console.log("  1. Set SENTRY_DSN=<ih35-tms-prod DSN> in Render production environment");
  console.log("  2. Set SENTRY_DSN=<ih35-tms-staging DSN> in Render staging environment");
  console.log("  3. Set VITE_SENTRY_DSN (same values) for the frontend Vite build");
  console.log("  4. Set SENTRY_ORG_SLUG and SENTRY_PROJECT_SLUG env vars for the /admin/observability page");
  console.log("  5. Add SENTRY_AUTH_TOKEN to CI secrets for source map uploads");
  console.log("  Done.\n");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

function printManualSetupGuide() {
  console.log(`
=============================================================
  SENTRY PROVISIONING — Manual Setup Guide
  (SENTRY_AUTH_TOKEN or SENTRY_ORG_SLUG not set)
=============================================================

1. Create a free Sentry account at https://sentry.io/signup/

2. Create an organization (e.g., "ih35-trucking")

3. Create 3 projects:
   - ih35-tms-prod   (platform: Node.js)
   - ih35-tms-staging (platform: Node.js)
   - ih35-tms-dev    (platform: Node.js)

4. Copy the DSN for each project (Settings → Projects → Client Keys)

5. Set environment variables:
   Render production:
     SENTRY_DSN=<ih35-tms-prod DSN>
     SENTRY_ORG_SLUG=<your-org-slug>
     SENTRY_PROJECT_SLUG=ih35-tms-prod
   Render staging:
     SENTRY_DSN=<ih35-tms-staging DSN>
     SENTRY_ORG_SLUG=<your-org-slug>
     SENTRY_PROJECT_SLUG=ih35-tms-staging
   Frontend (Vite):
     VITE_SENTRY_DSN=<project DSN>

6. Create 3 alert rules per project (Alerts → Create Alert → Metric Alert):
   a. "5xx error rate > 1% (5 min)"
      - Dataset: Errors
      - Function: count()
      - Threshold: CRITICAL > 1
      - Time window: 5 minutes
      - Notify: jorge@ih35trucking.net

   b. "p95 latency > 2s"
      - Dataset: Transactions
      - Function: p95(transaction.duration)
      - Threshold: CRITICAL > 2000ms
      - Time window: 5 minutes
      - Notify: jorge@ih35trucking.net

   c. "DB pool exhausted"
      - Dataset: Errors
      - Search query: "db.pool.exhausted OR connection pool"
      - Function: count()
      - Threshold: CRITICAL > 1
      - Time window: 5 minutes
      - Notify: jorge@ih35trucking.net

7. Re-run this script with credentials to automate:
   SENTRY_AUTH_TOKEN=<token> SENTRY_ORG_SLUG=<slug> node scripts/provision-sentry-projects.mjs
   (Token: Settings → Developer Settings → New Internal Integration)
=============================================================
`);
}
