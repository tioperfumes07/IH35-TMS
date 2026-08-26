#!/usr/bin/env node
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

  if (!/merge_from_vendor_id:\s*p\.from_vendor_id/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: pair row no longer carries merge_from_vendor_id from the scan's real from_vendor_id`);
  }
  if (!/merge_to_vendor_id:\s*p\.to_vendor_id/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: pair row no longer carries merge_to_vendor_id from the scan's real to_vendor_id`);
  }
  if (!/data-testid="factoring-duplicate-vendors-banner-merge-pair-link"/.test(bannerText)) {
    failures.push(`${BANNER_FILE}: per-pair "Merge these" deep-link is gone`);
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
    /merge_from_vendor_id:\s*p\.from_vendor_id,/,
    "merge_from_vendor_id: '',"
  );
  if (offenderBanner === files.bannerText) {
    console.error("FAIL(selftest): banner offender mutation did not change the source");
    process.exit(1);
  }
  const f1 = check({ ...files, bannerText: offenderBanner });
  if (f1.length === 0) {
    console.error("FAIL(selftest): planted banner regression (dropped real from_vendor_id) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted banner regression correctly caught");

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

  console.log("PASS: selftest 2/2 planted offenders caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  run();
}
