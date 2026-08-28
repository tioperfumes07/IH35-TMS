#!/usr/bin/env node
/**
 * BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK ratchet — a server-side dispatch-block response must never be
 * silent.
 *
 * `submitLoadInner`'s catch block sets `gateBanner` for `E_UNIT_DISPATCH_BLOCKED` / `E_UNIT_OOS` /
 * `E_DRIVER_HOS_VIOLATION`. `gateBanner` renders near the TOP of the Book Load form (section A), while
 * every control that can trigger these responses — section D's "Override & dispatch", the gateBanner's
 * own "Override (Owner only)"/"Override" buttons, and the bottom "Book + dispatch" button — lives well
 * below that in the scrollable form. A dispatcher who does not scroll all the way up after clicking sees
 * no visible change at all: this reads exactly like a dead click (CC-3 live-repro, LV-TXN-020 / #17045),
 * even though the request round-tripped correctly.
 *
 * This is the same FAIL-D2 / LV-DISPATCH-TOAST-LIES silent-failure family
 * `verify-book-load-submit-not-silent.mjs` already guards for client-side validation — this guard covers
 * the SERVER-response half: every `setGateBanner({ type: "hard_block" | "hos_block", ...})` call site in
 * the catch block must be paired with a `pushToast(...)` call so the failure is visible without scrolling.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

const src = readFileSync(join(repoRoot, TARGET), "utf8");
const failures = [];

// Strip comments so a documented example in prose is never mistaken for a real call site, while
// preserving newlines so line numbers stay exact.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const GATE_TYPES = ["hard_block", "hos_block"];
let sites = 0;

for (const type of GATE_TYPES) {
  const marker = `type: "${type}"`;
  let idx = 0;
  while ((idx = code.indexOf(marker, idx)) !== -1) {
    // Only count call sites that are actually inside a setGateBanner({...}) object, not the JSX branch
    // that later reads gateBanner.type === "hard_block" to decide which button to render.
    const before = code.slice(Math.max(0, idx - 60), idx);
    if (!/setGateBanner\(\s*\{\s*$/.test(before)) {
      idx += marker.length;
      continue;
    }
    sites += 1;
    const line = code.slice(0, idx).split("\n").length;
    // pushToast must appear on one of the few lines immediately preceding this setGateBanner call —
    // tight enough that a toast for a DIFFERENT branch three cases away does not falsely satisfy this.
    const windowStart = code.lastIndexOf("if (code ===", idx);
    const window = code.slice(windowStart >= 0 ? windowStart : Math.max(0, idx - 300), idx);
    if (!/pushToast\s*\(/.test(window)) {
      failures.push(
        `${TARGET}:${line}: setGateBanner({ type: "${type}" }) has no pushToast(...) alongside it — ` +
          `a dispatcher who does not scroll to the top of the form sees this response as a dead click.`
      );
    }
    idx += marker.length;
  }
}

if (sites === 0) {
  failures.push(`${TARGET}: no setGateBanner({ type: "hard_block"|"hos_block" }) call sites found — guard is stale, re-point it.`);
}

if (failures.length > 0) {
  console.error("FAIL verify-book-load-hard-block-response-not-silent");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `PASS verify-book-load-hard-block-response-not-silent — ${sites} hard/HOS-block response(s), all paired with pushToast`
);
