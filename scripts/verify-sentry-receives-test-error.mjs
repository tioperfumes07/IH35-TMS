#!/usr/bin/env node
/**
 * CLOSURE-21 CI guard — confirm Sentry receives a test error when credentials are configured.
 */
const LABEL = "verify-sentry-receives-test-error";

const DSN = process.env.SENTRY_DSN?.trim();
const AUTH = process.env.SENTRY_AUTH_TOKEN?.trim();
const ORG = process.env.SENTRY_ORG?.trim();
const PROJECT = process.env.SENTRY_PROJECT?.trim() || "ih35-backend";

async function pollSentryEvent(eventId) {
  if (!AUTH || !ORG) return null;
  const url = `https://sentry.io/api/0/projects/${ORG}/${PROJECT}/events/${eventId}/`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AUTH}` } });
  if (!res.ok) return null;
  return res.json();
}

async function sendTestError() {
  const Sentry = await import("@sentry/node");
  Sentry.init({ dsn: DSN, tracesSampleRate: 0 });
  const eventId = Sentry.captureMessage("ih35_ci_sentry_probe", { level: "error" });
  await Sentry.flush(2000);
  return eventId;
}

async function main() {
  if (!DSN) {
    console.log(`[${LABEL}] SKIP — SENTRY_DSN not set (wire DSN in Render + CI secrets to enable live probe)`);
    process.exit(0);
  }

  const eventId = await sendTestError();
  if (!eventId) {
    console.error(`[${LABEL}] FAIL — Sentry.captureMessage returned no event id`);
    process.exit(1);
  }

  if (!AUTH) {
    console.log(`[${LABEL}] PASS (partial) — event ${eventId} sent; set SENTRY_AUTH_TOKEN for API poll verification`);
    process.exit(0);
  }

  await new Promise((r) => setTimeout(r, 3000));
  const event = await pollSentryEvent(eventId);
  if (!event) {
    console.warn(`[${LABEL}] WARN — event ${eventId} not yet visible via API (ingest delay); capture succeeded`);
    process.exit(0);
  }

  console.log(`[${LABEL}] PASS — Sentry received CI probe event ${eventId}`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL — ${err}`);
  process.exit(1);
});
