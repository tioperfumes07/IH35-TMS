#!/usr/bin/env node
// HOME-ORPHANED-LEGAL-PAGES — guard
//
// /legal/privacy and /legal/terms are registered routes (routes/manifest.tsx) rendering real
// pages (PrivacyPolicyPage.tsx, TermsOfServicePage.tsx), but had ZERO inbound navigation
// anywhere in the frontend — no sidebar item, no tab, no button, no Link — a repo-wide grep
// confirmed the only references were the route manifest itself and each page's own file.
// Same defect class as the historical SAF-F22 fix (safety module routes with zero inbound
// links). QboStyleHomePage.tsx (rendered live at the additive, bookmarkable /app/homepage route)
// already had a disabled "Privacy" placeholder button positioned exactly for this — wired it
// live and added a matching Terms link, both real react-router Links to the two orphaned routes.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const HOME_FILE = "apps/frontend/src/pages/home/QboStyleHomePage.tsx";
const MANIFEST_FILE = "apps/frontend/src/routes/manifest.tsx";

export function check(homeText, manifestText) {
  const failures = [];

  if (!/<Link\s+to="\/legal\/privacy"/.test(homeText)) {
    failures.push(`${HOME_FILE} no longer links to /legal/privacy`);
  }
  if (!/<Link\s+to="\/legal\/terms"/.test(homeText)) {
    failures.push(`${HOME_FILE} no longer links to /legal/terms`);
  }
  if (!/<Route\s+path="\/legal\/privacy"/.test(manifestText)) {
    failures.push(`${MANIFEST_FILE} no longer registers /legal/privacy`);
  }
  if (!/<Route\s+path="\/legal\/terms"/.test(manifestText)) {
    failures.push(`${MANIFEST_FILE} no longer registers /legal/terms`);
  }

  return failures;
}

function run() {
  const homeText = fs.readFileSync(path.join(root, HOME_FILE), "utf8");
  const manifestText = fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8");
  const failures = check(homeText, manifestText);
  if (failures.length > 0) {
    console.error("FAIL: legal-privacy-terms-not-orphaned");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /legal/privacy and /legal/terms have a real inbound Link (QboStyleHomePage) and stay registered");
}

function selftest() {
  const homeText = fs.readFileSync(path.join(root, HOME_FILE), "utf8");
  const manifestText = fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8");

  const offenderA = homeText.replace(
    '<Link\n            to="/legal/privacy"\n            className="rounded-sm px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"\n          >\n            Privacy\n          </Link>',
    '<button type="button" disabled>Privacy</button>'
  );
  if (offenderA === homeText) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, manifestText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (Privacy link reverted to disabled button) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
