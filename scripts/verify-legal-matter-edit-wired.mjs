#!/usr/bin/env node
/**
 * verify-legal-matter-edit-wired.mjs — LEGAL-MATTER-EDIT + LEGAL-BREADCRUMB-TAIL guard.
 *
 * Static checks:
 *   1. LegalMatterDetailPage imports legalMattersApi and calls legalMattersApi.update(...)
 *   2. Edit status options exclude `closed` (closeMatter owns close)
 *   3. Update payload can clear nullable fields (null / empty), not omit-only
 *   4. LegalAttorneyReviewPortalPage + LegalSignPage render PageHeader breadcrumbs
 *   5. Backend matterUpdateSchema rejects status=closed
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_LEGAL_MATTER_EDIT_ROOT ?? process.cwd();

const failures = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

{
  const file = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";
  const text = read(file);
  if (!/legalMattersApi/.test(text)) failures.push("DetailPage: missing legalMattersApi import/use");
  if (!/legalMattersApi\.update\s*\(/.test(text)) failures.push("DetailPage: missing legalMattersApi.update call");
  if (!/Edit matter/.test(text)) failures.push("DetailPage: missing Edit matter affordance");
  if (!/\[\"legal\",\s*\"matters\"/.test(text)) {
    failures.push("DetailPage: must invalidate legal matters list query after edit");
  }
}

{
  const file = "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";
  const text = read(file);
  if (!/LEGAL_MATTER_EDIT_STATUSES/.test(text)) {
    failures.push("FormFields: missing LEGAL_MATTER_EDIT_STATUSES constant");
  }
  // Edit status list must not include closed as a selectable transition.
  const constMatch = text.match(
    /LEGAL_MATTER_EDIT_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/,
  );
  if (!constMatch) {
    failures.push("FormFields: LEGAL_MATTER_EDIT_STATUSES array not found");
  } else if (/["']closed["']/.test(constMatch[1])) {
    failures.push("FormFields: LEGAL_MATTER_EDIT_STATUSES must not include closed");
  }
  if (!/form\.status\s*===\s*["']closed["']/.test(text)) {
    failures.push("FormFields: closed matters must show read-only status (not selectable closed)");
  }
  // Clears must send null for money/date/email (not || undefined omit).
  const payload = text.match(/function formStateToUpdatePayload[\s\S]*?^}/m)?.[0] ?? "";
  if (!/amount_claimed_against_us:[\s\S]*?:\s*null/.test(payload)) {
    failures.push("FormFields: amount_claimed_against_us clear must send null");
  }
  if (!/next_hearing_date:[\s\S]*?\|\|\s*null/.test(payload)) {
    failures.push("FormFields: next_hearing_date clear must send null");
  }
  if (!/attorney_email:[\s\S]*?\|\|\s*null/.test(payload)) {
    failures.push("FormFields: attorney_email clear must send null");
  }
  if (/status:\s*form\.status/.test(payload) && !/form\.status\s*===\s*["']closed["']/.test(payload)) {
    failures.push("FormFields: must not blindly PATCH form.status (closed bypass)");
  }
}

{
  const file = "apps/backend/src/legal/matters.service.ts";
  const text = read(file);
  const updateSchema = text.match(/export const matterUpdateSchema[\s\S]*?;/)?.[0] ?? "";
  if (!/status:\s*z\.enum\(\[([^\]]+)\]\)/.test(updateSchema)) {
    failures.push("Backend: matterUpdateSchema must explicitly redefine status enum");
  } else {
    const enumBody = updateSchema.match(/status:\s*z\.enum\(\[([^\]]+)\]\)/)?.[1] ?? "";
    if (/["']closed["']/.test(enumBody)) {
      failures.push("Backend: matterUpdateSchema.status must not allow closed");
    }
  }
}

{
  const file = "apps/frontend/src/pages/legal/attorney-review/LegalAttorneyReviewPortalPage.tsx";
  const text = read(file);
  if (!/PageHeader/.test(text)) failures.push("AttorneyReviewPortal: missing PageHeader");
  if (!/breadcrumb=\{\["Legal",\s*"Attorney Review"\]\}/.test(text)) {
    failures.push("AttorneyReviewPortal: missing breadcrumb trail");
  }
}

{
  const file = "apps/frontend/src/pages/legal/sign/LegalSignPage.tsx";
  const text = read(file);
  if (!/PageHeader/.test(text)) failures.push("LegalSignPage: missing PageHeader");
  if (!/breadcrumb=\{\["Legal",\s*"Sign"\]\}/.test(text)) {
    failures.push("LegalSignPage: missing breadcrumb trail");
  }
}

if (failures.length > 0) {
  console.error("✗ verify-legal-matter-edit-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "✓ verify-legal-matter-edit-wired: edit UI wired, closed-only-via-closeMatter, clears persist, breadcrumbs present.",
);
