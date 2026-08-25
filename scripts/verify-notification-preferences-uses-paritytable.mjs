#!/usr/bin/env node
/**
 * verify-notification-preferences-uses-paritytable — qbo-parity-a1 (NotificationPreferencesPage surface)
 *
 * Settings notification preferences must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Event / Email / SMS / WhatsApp / In-app preserved 1:1;
 * ListErrorState on load failure; channel master toggles + quiet hours + Save/Reset preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-notification-preferences-uses-paritytable";
const PAGE = "apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx";
const BACKEND = "apps/backend/src/identity/notification-prefs.routes.ts";

const REQUIRED_LABELS = ["Event", "Email", "Sms", "Whatsapp", "In-app"];

function assertMigrated(src, backendSrc) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
  ) {
    errors.push(
      `${PAGE}: must import ParityTable from components/parity/ParityTable`,
    );
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  if (!src.includes('label: "Event"')) {
    errors.push(`${PAGE}: missing column label: "Event"`);
  }
  for (const label of REQUIRED_LABELS.slice(1)) {
    if (!src.includes(`"${label}"`)) {
      errors.push(`${PAGE}: missing channel column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="notification-preferences-events"')) {
    errors.push(
      `${PAGE}: must set storageKey="notification-preferences-events"`,
    );
  }
  if (!src.includes("No notification events configured.")) {
    errors.push(`${PAGE}: must keep emptyText for empty events list`);
  }
  if (!src.includes("Couldn't load notification preferences")) {
    errors.push(`${PAGE}: must keep ListErrorState title for outage`);
  }
  if (!src.includes("By event type")) {
    errors.push(`${PAGE}: must preserve By event type section heading`);
  }
  if (!src.includes("Reset to defaults")) {
    errors.push(`${PAGE}: must preserve Reset to defaults action`);
  }
  if (!src.includes("Quiet hours")) {
    errors.push(`${PAGE}: must preserve Quiet hours section`);
  }
  if (
    /withCurrentUser\(user\.uuid[\s\S]{0,900}?\.catch\(\(\) => null\)/.test(
      backendSrc,
    )
  ) {
    errors.push(
      `${BACKEND}: preference read failure must propagate instead of rendering defaults`,
    );
  }
  const governedRoutes =
    backendSrc.match(
      /app\.(?:get|patch)\([\s\S]{0,180}?\/api\/v1\/identity\/me\/notification-preferences[\s\S]{0,180}?rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/g,
    ) ?? [];
  if (governedRoutes.length !== 2) {
    errors.push(
      `${BACKEND}: GET and PATCH must both carry the canonical 60/min rate limit`,
    );
  }
  return errors;
}

function selftest() {
  const backendGood = `
    app.get("/api/v1/identity/me/notification-preferences", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async () => {
      return withCurrentUser(user.uuid, async () => null);
    });
    app.patch("/api/v1/identity/me/notification-preferences", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async () => {});
  `;
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "event", label: "Event" },
      { key: "email", label: "Email" },
      { key: "sms", label: "Sms" },
      { key: "whatsapp", label: "Whatsapp" },
      { key: "in_app", label: "In-app" },
    ];
    <h2>By event type</h2>
    <h2>Quiet hours</h2>
    <ListErrorState title="Couldn't load notification preferences" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="notification-preferences-events"
      emptyText="No notification events configured."
    />
    Reset to defaults
  `;
  const bad = `
    export function NotificationPreferencesPage() {
      return (
        <div>
          <table><thead><tr><th>Event</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good, backendGood);
  const badErrors = assertMigrated(bad, backendGood);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(
      `${LABEL} --selftest FAIL bad fixture should fail hard:`,
      badErrors,
    );
    process.exit(1);
  }
  const swallowedErrors = assertMigrated(
    good,
    backendGood.replace(
      "return withCurrentUser(user.uuid, async () => null);",
      "return withCurrentUser(user.uuid, async () => null).catch(() => null);",
    ),
  );
  if (!swallowedErrors.some((error) => error.includes("must propagate"))) {
    console.error(
      `${LABEL} --selftest FAIL swallowed-read mutation escaped`,
      swallowedErrors,
    );
    process.exit(1);
  }
  const unboundedErrors = assertMigrated(
    good,
    backendGood.replace(
      '{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },',
      "",
    ),
  );
  if (!unboundedErrors.some((error) => error.includes("GET and PATCH"))) {
    console.error(
      `${LABEL} --selftest FAIL missing-rate-limit mutation escaped`,
      unboundedErrors,
    );
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const backendSrc = fs.readFileSync(path.join(ROOT, BACKEND), "utf8");
  const errors = assertMigrated(src, backendSrc);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`,
  );
}

main();
