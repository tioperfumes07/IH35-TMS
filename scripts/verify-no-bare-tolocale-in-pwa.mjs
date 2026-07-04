#!/usr/bin/env node
// G8-1 guard: forbid bare `.toLocale*()` calls in the driver PWA.
//
// A bare `.toLocaleString()` / `.toLocaleDateString()` / `.toLocaleTimeString()`
// (no locale, no timeZone arg) renders a UTC timestamp in the DEVICE's timezone
// and locale. A driver phone on Mexico time then shows a different pickup/delivery
// clock than the Laredo office — a real dispute for the Mexican-B1 driver base.
//
// Fix: use the shared helpers in apps/driver-pwa/src/lib/formatDateTime.ts, which
// format in the carrier's fixed operating timezone (America/Chicago) regardless of
// device. Passing an explicit locale + timeZone argument (e.g.
// `.toLocaleDateString(locale, { timeZone: "UTC" })`) is allowed — only the
// zero-argument "bare" form is forbidden.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PWA_SRC = path.join(ROOT, "apps/driver-pwa/src");

// The shared helper is the ONE sanctioned place that calls toLocale* internally.
const ALLOWLIST = new Set([path.join(PWA_SRC, "lib/formatDateTime.ts")]);

// Bare = immediately followed by `()` with no argument.
const BARE_TOLOCALE = /\.toLocale(?:String|DateString|TimeString)\(\s*\)/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(PWA_SRC)) {
  if (ALLOWLIST.has(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BARE_TOLOCALE.test(line)) {
      violations.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("verify-no-bare-tolocale-in-pwa: FAIL");
  console.error(
    "Bare .toLocale*() renders in the device timezone/locale (dispute risk).",
  );
  console.error(
    "Use apps/driver-pwa/src/lib/formatDateTime.ts (formatDateTime/formatDate/formatTime),",
  );
  console.error(
    'or pass an explicit locale + { timeZone } argument. Violations:',
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}

console.log("verify-no-bare-tolocale-in-pwa: OK (no bare .toLocale*() in driver-pwa)");
