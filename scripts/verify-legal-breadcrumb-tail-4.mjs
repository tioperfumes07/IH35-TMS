#!/usr/bin/env node
/**
 * verify-legal-breadcrumb-tail-4.mjs — LEGAL-BREADCRUMB-TAIL-4
 * (0441-mod12-legal-8of10-pages-omit-breadcrumb)
 *
 * Fails if any of the four remaining legal surfaces omit PageHeader breadcrumbs:
 *   - attorney-review portal
 *   - sign
 *   - Privacy Policy
 *   - Terms of Service
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_LEGAL_BREADCRUMB_TAIL_4_ROOT ?? process.cwd();

const failures = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function requireBreadcrumb(rel, trail) {
  const text = read(rel);
  if (!/PageHeader/.test(text)) {
    failures.push(`${rel}: missing PageHeader`);
  }
  const escaped = trail
    .map((s) => `"${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
    .join(",\\s*");
  const re = new RegExp(`breadcrumb=\\{\\[${escaped}\\]\\}`);
  if (!re.test(text)) {
    failures.push(`${rel}: missing breadcrumb={${JSON.stringify(trail)}}`);
  }
}

requireBreadcrumb(
  "apps/frontend/src/pages/legal/attorney-review/LegalAttorneyReviewPortalPage.tsx",
  ["Legal", "Attorney Review"],
);
requireBreadcrumb("apps/frontend/src/pages/legal/sign/LegalSignPage.tsx", ["Legal", "Sign"]);
requireBreadcrumb("apps/frontend/src/pages/legal/PrivacyPolicyPage.tsx", ["Legal", "Privacy Policy"]);
requireBreadcrumb("apps/frontend/src/pages/legal/TermsOfServicePage.tsx", ["Legal", "Terms of Service"]);

const SIGN = "apps/frontend/src/pages/legal/sign/LegalSignPage.tsx";

function leftoverRefuseSign(src, bucket) {
  if (src.includes("text-[11px]")) bucket.push(`${SIGN}: leftover text-[11px]`);
  if (src.includes("#8A92AB") || src.includes("#334155")) {
    bucket.push(`${SIGN}: leftover off-scale muted`);
  }
}

if (process.argv.includes("--selftest")) {
  const live = read(SIGN);
  const leftoverGood = [];
  leftoverRefuseSign(live, leftoverGood);
  if (leftoverGood.length) {
    console.error("✗ verify-legal-breadcrumb-tail-4 SELFTEST FAIL — live leftover tokens present");
    for (const e of leftoverGood) console.error(`  - ${e}`);
    process.exit(1);
  }
  const leftoverPlant = `${live}\n<div className="text-[11px] text-[#8A92AB]" style={{ color: "#334155" }}>plant</div>`;
  const leftoverBad = [];
  leftoverRefuseSign(leftoverPlant, leftoverBad);
  if (
    !leftoverBad.some((e) => e.includes("leftover text-[11px]")) ||
    !leftoverBad.some((e) => e.includes("leftover off-scale muted"))
  ) {
    console.error("✗ verify-legal-breadcrumb-tail-4 SELFTEST FAIL leftover plant escaped", leftoverBad);
    process.exit(1);
  }
  console.log("✓ verify-legal-breadcrumb-tail-4 SELFTEST PASS — leftover plant rejected");
  process.exit(0);
}

leftoverRefuseSign(read(SIGN), failures);

if (failures.length > 0) {
  console.error("✗ verify-legal-breadcrumb-tail-4: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "✓ verify-legal-breadcrumb-tail-4: attorney-review portal, sign, Privacy Policy, Terms of Service all carry Legal breadcrumbs.",
);
