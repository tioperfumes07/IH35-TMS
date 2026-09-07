#!/usr/bin/env node
/**
 * verify-dispatch-subnav-no-factoring.mjs
 *
 * FAC-11 / BRD-22 (owner 2026-09-03, live-reverified 2026-09-07): "FACTORING does not belong
 * in Dispatch. Remove it from dispatch." A prior PR (#19091, "WIR-03 Dispatch Factoring tab
 * escaped module") looked like it addressed this but only rewired the item's href from
 * /accounting/factoring to /dispatch/factoring-queue — it never removed the item, so the
 * "Factoring" tab kept showing up in Dispatch's top subnav strip and BRD-22 stayed open under
 * a false-green PR. This is a single-purpose guard so that specific regression (a Factoring
 * label reappearing in DISPATCH_NAV_ITEMS, under ANY href) can never land silently again.
 *
 * Scope note: this only locks the Dispatch subnav strip (DispatchSubnav.tsx). It does not
 * touch FactoringQueuePage.tsx, its route, or the Factoring Hub's own reverse link to it
 * (those are legitimate, separate surfaces) — see verify-dispatch-factoring-queue-deeplinks.mjs
 * for that contract. A duplicate "Factoring Queue" / "Factoring Packets" entry also still
 * exists in the Dispatch flyout of sidebar-config.ts; that is a distinct surface from "the
 * subnav" this finding named and is filed separately on the board, not silently fixed here.
 *
 * Usage:
 *   node scripts/verify-dispatch-subnav-no-factoring.mjs            # scan
 *   node scripts/verify-dispatch-subnav-no-factoring.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-subnav-no-factoring";
const SUBNAV = "apps/frontend/src/components/dispatch/DispatchSubnav.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkNoFactoringNavItem(src) {
  const failures = [];
  // The regression: any nav item labeled "Factoring" inside DISPATCH_NAV_ITEMS, regardless of
  // which href it points at (both /dispatch/factoring-queue and /accounting/factoring have
  // both actually shipped to prod at different times under this same defect).
  if (/label:\s*["']Factoring["']/.test(src)) {
    failures.push(
      `${SUBNAV}: BRD-22 — "FACTORING does not belong in Dispatch. Remove it from dispatch." ` +
        `A Factoring nav item exists in DISPATCH_NAV_ITEMS.`,
    );
  }
  // Must not reintroduce the badge query wiring for a "factoring" badgeKey either — that was
  // the other half of the same surface (a live count badge on the removed tab).
  if (/badgeKey:\s*["']factoring["']/.test(src)) {
    failures.push(
      `${SUBNAV}: BRD-22 — a "factoring" badgeKey is wired even though the nav item is gone.`,
    );
  }
  if (/queryKey:\s*\[\s*["']dispatch-subnav["']\s*,\s*["']factoring["']/.test(src)) {
    failures.push(
      `${SUBNAV}: BRD-22 — a dispatch-subnav "factoring" query is wired even though the nav item is gone.`,
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(SUBNAV);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkNoFactoringNavItem(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    const DISPATCH_NAV_ITEMS = [
      { label: "Load board", href: "/dispatch?view=kanban", badgeKey: "load_board" },
      { label: "Trip Pairing", href: "/dispatch/trip-pairing" },
    ];
  `;
  const badReintroducedQueue = goodSrc.replace(
    '{ label: "Trip Pairing", href: "/dispatch/trip-pairing" },',
    '{ label: "Trip Pairing", href: "/dispatch/trip-pairing" },\n' +
      '      { label: "Factoring", href: "/dispatch/factoring-queue", badgeKey: "factoring" },',
  );
  const badReintroducedAccounting = goodSrc.replace(
    '{ label: "Trip Pairing", href: "/dispatch/trip-pairing" },',
    '{ label: "Trip Pairing", href: "/dispatch/trip-pairing" },\n' +
      '      { label: "Factoring", href: "/accounting/factoring" },',
  );
  const badBadgeKeyOrphan = `${goodSrc}\n    const x = { badgeKey: "factoring" };`;
  const badQueryOrphan = `${goodSrc}\n    queryKey: ["dispatch-subnav", "factoring", operatingCompanyId],`;

  const checks = [
    ["clean subnav passes", checkNoFactoringNavItem(goodSrc).length === 0],
    [
      "reintroduced /dispatch/factoring-queue item fails",
      checkNoFactoringNavItem(badReintroducedQueue).length > 0,
    ],
    [
      "reintroduced /accounting/factoring item fails",
      checkNoFactoringNavItem(badReintroducedAccounting).length > 0,
    ],
    ["orphaned factoring badgeKey fails", checkNoFactoringNavItem(badBadgeKeyOrphan).length > 0],
    ["orphaned factoring queryKey fails", checkNoFactoringNavItem(badQueryOrphan).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Dispatch subnav has no Factoring nav item (BRD-22)`);
process.exit(0);
