#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — this is a bug-regression guard (deep-link query-param wiring and an
// id-namespace-mismatch class), not a Program-matrix EntityLink/reverse_link/FK wiring ratchet.
// It mentions "EntityLink" only in passing commentary about where the internal uuid is used
// elsewhere in the banner, which trips verify-matrix-built-tag-present's WIRING_HINT heuristic —
// exempted rather than attaching an inaccurate @matrix-built module/leaf tag that doesn't
// correspond to any real Program-matrix tracked surface.
//
// BANNER-MERGE-DEEPLINK-DROPS-CONTEXT — guard
//
// DuplicateVendorsBanner.tsx's scan (GET /api/v1/factoring/scan-duplicate-vendors) already
// resolves real from/to vendor ids+names for each duplicate pair. Before this fix, the banner's
// only call-to-action was a bare NavLink to the vendor-merges tab with zero query params, so the
// office user landed on an empty form whose from/to fields are free text — with no way to know
// the raw QBO vendor uuid the scan had already found. Live-reproduced: "Open Driver Vendor
// Merges" always produced "Driver: —, From vendor: — (Unassigned), To vendor: — (Unassigned)"
// regardless of which pair the banner listed.
//
// FIX: each pair row carries a "Merge these" deep-link with merge_from_vendor_id /
// merge_from_vendor_name / merge_to_vendor_id / merge_to_vendor_name query params;
// FactoringHome.tsx's vendor_merges tab reads them once on mount, prefills the merge form, and
// switches to that tab. This guard fails if either half of that wiring disappears.
//
// VENDOR-MERGE-QBO-ID-MISMATCH (owner-live-tested 2026-09-08): the merge endpoint validates
// fromQboVendorId/toQboVendorId against QuickBooks' own entity id (qbo_archive.entities_snapshot),
// NOT the internal from_vendor_id/to_vendor_id uuid (that stays reserved for EntityLink
// navigation) — deep-linking the internal uuid 404'd on every real merge attempt, confirmed live.
// The deep-link must carry from_qbo_vendor_id/to_qbo_vendor_id instead, and must not offer a
// merge link at all when either is null (a vendor never synced to QBO) — an honest fallback note
// instead of a link that can only ever fail.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BANNER_FILE = "apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx";
const HOME_FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

export function check({ bannerText, homeText }) {
  const failures = [];

  if (!/merge_from_vendor_id:\s*p\.from_qbo_vendor_id/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: pair row no longer carries merge_from_vendor_id from the scan's real from_qbo_vendor_id (the QBO entity id, not the internal uuid) — this is the VENDOR-MERGE-QBO-ID-MISMATCH regression class`);
  }
  if (!/merge_to_vendor_id:\s*p\.to_qbo_vendor_id/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: pair row no longer carries merge_to_vendor_id from the scan's real to_qbo_vendor_id (the QBO entity id, not the internal uuid) — this is the VENDOR-MERGE-QBO-ID-MISMATCH regression class`);
  }
  if (!/data-testid="factoring-duplicate-vendors-banner-merge-pair-link"/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: per-pair "Merge these" deep-link is gone`);
  }
  if (!/data-testid="factoring-duplicate-vendors-banner-merge-pair-unsynced"/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: missing the honest "not yet synced to QBO" fallback for pairs with no qbo_vendor_id on either side`);
  }

  if (!/searchParams\.get\("merge_from_vendor_id"\)/.test(homeText)) {
    failures.push(`${HOME_FILE}: no longer reads merge_from_vendor_id from the URL`);
  }
  if (!/searchParams\.get\("merge_to_vendor_id"\)/.test(homeText)) {
    failures.push(`${HOME_FILE}: no longer reads merge_to_vendor_id from the URL`);
  }
  if (!/setTab\("vendor_merges"\)/.test(homeText)) {
    failures.push(`${HOME_FILE}: prefill effect no longer switches to the vendor_merges tab — a deep-link would prefill an invisible form`);
  }

  // MERGE-DEEPLINK-NEVER-FIRES-2026-09-08 (live-Chrome caught): the original fix used a
  // mount-only `useEffect(() => {...}, [])`, but every /factoring/<tab> route renders the SAME
  // FactoringHomePage instance — clicking "Merge these" is a client-side route change, not a
  // remount, so the effect never re-ran and the form stayed "Unassigned" every time. Live-
  // reproduced twice (a real click AND a full browser navigation to the exact deep-link URL).
  // The static checks above only assert the wiring EXISTS, not that it can actually fire on a
  // client-side nav — this one specifically rejects the empty-deps mount-only shape that broke
  // it in production.
  const effectStart = homeText.indexOf('searchParams.get("merge_from_vendor_id")');
  if (effectStart === -1) {
    failures.push(`${HOME_FILE}: could not locate the merge-prefill effect body to check its dependency array`);
  } else {
    const window = homeText.slice(effectStart, effectStart + 1200);
    const depsMatch = window.match(/\}, (\[[^\]]*\])\);/);
    if (!depsMatch) {
      failures.push(`${HOME_FILE}: could not find the merge-prefill effect's closing dependency array within range`);
    } else if (depsMatch[1].replace(/\s/g, "") === "[]") {
      failures.push(
        `${HOME_FILE}: merge-prefill effect has a mount-only "[]" dependency array — it will never re-run on a client-side tab switch (the actual production bug), only on a true component remount. Depend on the specific query-param values (e.g. the extracted merge_from_vendor_id/merge_to_vendor_id strings), not an empty array.`,
      );
    }
  }

  return failures;
}

function readAll() {
  return {
    bannerText: fs.readFileSync(path.join(root, BANNER_FILE), "utf8"),
    homeText: fs.readFileSync(path.join(root, HOME_FILE), "utf8"),
  };
}

function run() {
  const files = readAll();
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: factoring-vendor-merge-banner-deeplink");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: duplicate-vendors banner deep-links each pair's real vendor ids into the merge form, and the form consumes + tab-switches on them");
}

async function selftest() {
  const files = readAll();

  const offenderBanner = files.bannerText.replace(
    /merge_from_vendor_id:\s*p\.from_qbo_vendor_id as string,/,
    "merge_from_vendor_id: '',"
  );
  if (offenderBanner === files.bannerText) {
    console.error("FAIL(selftest): banner offender mutation did not change the source");
    process.exit(1);
  }
  const f1 = check({ ...files, bannerText: offenderBanner });
  if (f1.length === 0) {
    console.error("FAIL(selftest): planted banner regression (dropped real from_qbo_vendor_id) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted banner regression correctly caught");

  // VENDOR-MERGE-QBO-ID-MISMATCH regression: revert to the internal uuid (the actual historical
  // bug — always 404'd live) instead of dropping the field outright.
  const offenderQboIdMismatch = files.bannerText.replace(
    /merge_from_vendor_id:\s*p\.from_qbo_vendor_id as string,/,
    "merge_from_vendor_id: p.from_vendor_id,"
  );
  if (offenderQboIdMismatch === files.bannerText) {
    console.error("FAIL(selftest): QBO-id-mismatch offender mutation did not change the source");
    process.exit(1);
  }
  const fQbo = check({ ...files, bannerText: offenderQboIdMismatch });
  if (fQbo.length === 0) {
    console.error("FAIL(selftest): planted VENDOR-MERGE-QBO-ID-MISMATCH regression (internal uuid instead of qbo id) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted VENDOR-MERGE-QBO-ID-MISMATCH regression correctly caught");

  const offenderHome = files.homeText.replace(/setTab\("vendor_merges"\);/, "");
  if (offenderHome === files.homeText) {
    console.error("FAIL(selftest): home offender mutation did not change the source");
    process.exit(1);
  }
  const f2 = check({ ...files, homeText: offenderHome });
  if (f2.length === 0) {
    console.error("FAIL(selftest): planted home regression (no tab switch) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted home regression correctly caught");

  const effectStart = files.homeText.indexOf('searchParams.get("merge_from_vendor_id")');
  const window = files.homeText.slice(effectStart, effectStart + 1200);
  const depsMatch = window.match(/\}, (\[[^\]]*\])\);/);
  if (!depsMatch) {
    console.error("FAIL(selftest): could not locate the real dependency array to plant the mount-only regression against");
    process.exit(1);
  }
  const offenderMountOnly = files.homeText.replace(`}, ${depsMatch[1]});`, "}, []);");
  if (offenderMountOnly === files.homeText) {
    console.error("FAIL(selftest): mount-only offender mutation did not change the source");
    process.exit(1);
  }
  const f3 = check({ ...files, homeText: offenderMountOnly });
  if (f3.length === 0) {
    console.error("FAIL(selftest): planted mount-only \"[]\" deps regression (the actual production bug) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted mount-only deps regression correctly caught");

  console.log("PASS: selftest 4/4 planted offenders caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  run();
}
