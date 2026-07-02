#!/usr/bin/env node
// NOTIF-A (A5) static contract guard — no fake green. Locks the load-bearing pieces that make the
// loud alerts + escalation-until-ack real, so they can't silently regress:
//   1. the deployed service worker (public/sw.js) sets requireInteraction:true + renotify:true and a
//      per-thread tag + vibrate on the background push notification.
//   2. the escalation cron is registered in index.ts (background_jobs-monitored) and emits via the
//      events.log_event spine, NEVER a direct events.event_log insert.
//   3. the driver takeover overlay exposes NO dismissal affordance other than Acknowledge
//      (no backdrop onClick, no close/onDismiss, no Escape-to-close).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-notif-a-contract";
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");
const failures = [];

// 1. Service worker background-push loudness.
const SW = "apps/driver-pwa/public/sw.js";
const SW_SRC = "apps/driver-pwa/src/service-worker.ts";
for (const rel of [SW, SW_SRC]) {
  const src = read(rel);
  if (!src) {
    failures.push(`missing ${rel}`);
    continue;
  }
  if (!/requireInteraction:\s*true/.test(src)) failures.push(`${rel}: showNotification must set requireInteraction: true`);
  if (!/renotify:\s*true/.test(src)) failures.push(`${rel}: showNotification must set renotify: true`);
  if (!/vibrate:\s*\[/.test(src)) failures.push(`${rel}: showNotification must set a vibrate pattern`);
  if (!/tag:\s*perThreadTag/.test(src) && !/tag:\s*payload\.tag/.test(src)) {
    failures.push(`${rel}: showNotification must use a per-thread tag`);
  }
  if (!/kind === "chat_confirmation"/.test(src)) failures.push(`${rel}: resolvePushDeepLink must route chat pushes to /chat?threadId=`);
}

// 2. Escalation cron registered + spine-safe.
const CRON = "apps/backend/src/cron/chat-confirmation-escalation.cron.ts";
const INDEX = "apps/backend/src/index.ts";
const cronSrc = read(CRON);
const indexSrc = read(INDEX);
if (!cronSrc) failures.push(`missing ${CRON}`);
else {
  if (!/events\.log_event\(/.test(cronSrc)) failures.push(`${CRON}: every escalation attempt must append events.log_event(...)`);
  if (/INSERT\s+INTO\s+events\.event_log/i.test(cronSrc)) failures.push(`${CRON}: direct INSERT INTO events.event_log — must use events.log_event()`);
  if (/subject_type[^,\n]*['"]message['"]/i.test(cronSrc)) failures.push(`${CRON}: event subject_type must be 'load'/'driver' (spine excludes 'message')`);
  if (!/wrapBackgroundJobTick\(/.test(cronSrc)) failures.push(`${CRON}: tick must run under wrapBackgroundJobTick (background_jobs monitoring)`);
}
if (!/initializeChatConfirmationEscalationCron\(app\)/.test(indexSrc)) {
  failures.push(`${INDEX}: escalation cron not registered (initializeChatConfirmationEscalationCron)`);
}

// 3. Takeover overlay has no dismissal path other than Acknowledge.
const OVERLAY = "apps/driver-pwa/src/components/LoudAlertOverlay.tsx";
const overlaySrc = read(OVERLAY);
if (!overlaySrc) failures.push(`missing ${OVERLAY}`);
else {
  if (!/onAcknowledge/.test(overlaySrc)) failures.push(`${OVERLAY}: must wire an onAcknowledge control`);
  if (/onDismiss|onClose/.test(overlaySrc)) failures.push(`${OVERLAY}: takeover must NOT expose onDismiss/onClose`);
  if (/onKeyDown|Escape/.test(overlaySrc)) failures.push(`${OVERLAY}: takeover must NOT be Escape-dismissable`);
  // the outer takeover container must not close on backdrop click.
  if (/data-testid="loud-alert-overlay"[^>]*onClick/.test(overlaySrc)) failures.push(`${OVERLAY}: backdrop must not have an onClick dismiss`);
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (sw loud-push locked, escalation cron registered + spine-safe, takeover Acknowledge-only)`);
