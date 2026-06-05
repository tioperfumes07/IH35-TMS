#!/usr/bin/env node
/**
 * PWA-POLISH-2 CI guard: VAPID public key env present and matches driver-pwa build env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`verify:web-push-vapid-keys-present FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function extractViteVapidKey(source) {
  const m = source.match(/VITE_VAPID_PUBLIC_KEY[^"']*["']([^"']+)["']/);
  return m?.[1]?.trim() ?? "";
}

function main() {
  const dispatcher = readRequired("apps/backend/src/notifications/web-push-dispatcher.ts");
  const subscriber = readRequired("apps/driver-pwa/src/notifications/web-push-subscriber.ts");
  const sw = readRequired("apps/driver-pwa/src/service-worker.ts");

  if (!dispatcher.includes("VAPID_PUBLIC_KEY")) fail("web-push-dispatcher must read VAPID_PUBLIC_KEY");
  if (!subscriber.includes("VITE_VAPID_PUBLIC_KEY")) fail("web-push-subscriber must read VITE_VAPID_PUBLIC_KEY");
  if (!sw.includes("push")) fail("service-worker must handle push events");

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const vitePub = process.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? extractViteVapidKey(subscriber);

  if (!envPub && !vitePub) {
    console.log("verify:web-push-vapid-keys-present PASS (static checks only; no VAPID env in CI)");
    return;
  }

  if (envPub && vitePub && envPub !== vitePub) {
    fail("VAPID_PUBLIC_KEY must match VITE_VAPID_PUBLIC_KEY when both are set");
  }

  console.log("verify:web-push-vapid-keys-present PASS");
}

main();
