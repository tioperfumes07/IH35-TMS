#!/usr/bin/env node
// OWNER-ADMIN-QUICKSTART-HELP-ANCHOR-MISS — guard
//
// apps/frontend/src/config/help-links.ts points 9 rules at fragments of
// docs/user-guides/owner-admin-quickstart.md (e.g. "#user-administration-roles"), consumed by
// PageHelpLink.tsx and rendered on every office page (Topbar.tsx). Unlike its siblings
// (dispatcher-quickstart.md, driver-quickstart.md), this doc had ZERO explicit `<a id="...">`
// anchors — it relied on GitHub's raw heading auto-slug, which for headings like "## 6. User
// administration & roles" does NOT produce "user-administration-roles" (GitHub keeps the leading
// number and the "&" character in its own way). Every "Help for this page" click on an affected
// page landed at the top of a 300+ line document instead of the named section — a working link
// that quietly fails to do what it visibly promises.
//
// Fixed 8 of the 9 fragments by adding explicit <a id> anchors matching help-links.ts exactly,
// same convention as the sibling docs. The 9th, "#owner-home" (/home), has no corresponding
// content anywhere in this doc at all — not just a missing anchor, a genuine content gap — left
// unfixed rather than fabricating a section to point it at; filed separately.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DOC_FILE = "docs/user-guides/owner-admin-quickstart.md";

const REQUIRED_ANCHORS = [
  "governance-first-mindset",
  "banking",
  "qbo-sync",
  "quickbooks-online-qbo-sync-posture",
  "scheduled-reports",
  "user-administration-roles",
  "launch-readiness",
  "settlements",
];

export function check(text) {
  const failures = [];
  for (const anchor of REQUIRED_ANCHORS) {
    if (!text.includes(`<a id="${anchor}"></a>`)) {
      failures.push(`${DOC_FILE} missing <a id="${anchor}"></a> (a help-links.ts rule points at #${anchor})`);
    }
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, DOC_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: owner-admin-quickstart-help-anchors");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: owner-admin-quickstart.md carries all ${REQUIRED_ANCHORS.length} required help-link anchors`);
}

function selftest() {
  const text = fs.readFileSync(path.join(root, DOC_FILE), "utf8");
  const offender = text.replace('<a id="user-administration-roles"></a>\n\n', "");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (user-administration-roles anchor removed) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
