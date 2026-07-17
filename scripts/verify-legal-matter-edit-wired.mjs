#!/usr/bin/env node
/**
 * verify-legal-matter-edit-wired.mjs — LEGAL-MATTER-EDIT + LEGAL-BREADCRUMB-TAIL guard.
 *
 * Static checks:
 *   1. LegalMatterDetailPage imports legalMattersApi and calls legalMattersApi.update(...)
 *   2. LegalAttorneyReviewPortalPage renders PageHeader with breadcrumb trail
 *   3. LegalSignPage renders PageHeader with breadcrumb trail
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_LEGAL_MATTER_EDIT_ROOT ?? process.cwd();

const checks = [
  {
    file: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
    label: "LegalMatterDetailPage",
    tests: [
      {
        name: "imports legalMattersApi",
        test: (text) => /legalMattersApi/.test(text),
      },
      {
        name: "calls legalMattersApi.update",
        test: (text) => /legalMattersApi\.update\s*\(/.test(text),
      },
      {
        name: "exposes Edit matter affordance",
        test: (text) => /Edit matter/.test(text),
      },
    ],
  },
  {
    file: "apps/frontend/src/pages/legal/attorney-review/LegalAttorneyReviewPortalPage.tsx",
    label: "LegalAttorneyReviewPortalPage",
    tests: [
      {
        name: "imports PageHeader",
        test: (text) => /PageHeader/.test(text),
      },
      {
        name: "renders breadcrumb trail",
        test: (text) => /breadcrumb=\{\["Legal",\s*"Attorney Review"\]\}/.test(text),
      },
    ],
  },
  {
    file: "apps/frontend/src/pages/legal/sign/LegalSignPage.tsx",
    label: "LegalSignPage",
    tests: [
      {
        name: "imports PageHeader",
        test: (text) => /PageHeader/.test(text),
      },
      {
        name: "renders breadcrumb trail",
        test: (text) => /breadcrumb=\{\["Legal",\s*"Sign"\]\}/.test(text),
      },
    ],
  },
];

const failures = [];

for (const check of checks) {
  const path = join(ROOT, check.file);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    failures.push(`${check.label}: cannot read ${check.file}`);
    continue;
  }
  for (const t of check.tests) {
    if (!t.test(text)) {
      failures.push(`${check.label}: missing ${t.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("✗ verify-legal-matter-edit-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "✓ verify-legal-matter-edit-wired: matter edit UI wired + legal breadcrumb tail present on attorney-review portal and sign pages."
);
