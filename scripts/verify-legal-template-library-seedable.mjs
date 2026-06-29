#!/usr/bin/env node
// LEGAL-SEED-01 guard: the legal contract template library must always be seedable AND
// auto-provisioned, so prod can never again sit with legal.contract_templates = 0 rows (the
// original bug: the library existed but was never run, leaving the Create-contract picker empty).
//
// Fails CI if:
//   (a) the canonical library (LEGAL_TEMPLATE_LIBRARY) is empty;
//   (b) the auto-provision path can be bypassed — the provision service must REUSE
//       ensureLegalTemplateLibrary (never re-implement the insert), and must be wired into BOTH
//       the boot backfill (index.ts) and the carrier-bootstrap path (future entities);
//   (c) the real-PG per-entity isolation test is missing or no longer asserts isolation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LIBRARY_FILE = "apps/backend/src/legal/templates/legal-template-library.generated.ts";
const PROVISION_FILE = "apps/backend/src/legal/template-library-provision.service.ts";
const SEED_FILE = "apps/backend/src/legal/template-library.service.ts";
const INDEX_FILE = "apps/backend/src/index.ts";
const BOOTSTRAP_FILE = "apps/backend/src/onboarding/usmca-carrier-bootstrap.ts";
const TEST_FILE = "apps/backend/src/legal/__tests__/legal-template-library-provision.db.test.ts";

const errors = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`missing required file: ${rel}`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

// (a) Library is non-empty.
const lib = read(LIBRARY_FILE);
if (lib !== null) {
  const entryCount = (lib.match(/"template_code"\s*:/g) || []).length;
  if (entryCount < 1) {
    errors.push(
      `${LIBRARY_FILE}: LEGAL_TEMPLATE_LIBRARY appears empty (0 template_code entries). The library must ship non-empty.`
    );
  }
}

// (b) Provision service reuses the canonical seeder and exports both entry points.
const provision = read(PROVISION_FILE);
if (provision !== null) {
  if (!/ensureLegalTemplateLibrary/.test(provision)) {
    errors.push(`${PROVISION_FILE}: must reuse ensureLegalTemplateLibrary (the canonical seeder), not re-implement it.`);
  }
  if (/INSERT\s+INTO\s+legal\.contract_templates/i.test(provision)) {
    errors.push(
      `${PROVISION_FILE}: must NOT contain its own INSERT INTO legal.contract_templates — reuse ensureLegalTemplateLibrary.`
    );
  }
  if (!/export\s+async\s+function\s+backfillLegalTemplateLibraries/.test(provision)) {
    errors.push(`${PROVISION_FILE}: must export backfillLegalTemplateLibraries (boot-time per-entity backfill).`);
  }
  if (!/export\s+async\s+function\s+provisionLegalTemplateLibraryForCompany/.test(provision)) {
    errors.push(`${PROVISION_FILE}: must export provisionLegalTemplateLibraryForCompany (single-entity provision).`);
  }
}

// The canonical seeder must stay idempotent (DO NOTHING) so re-provisioning is always safe.
const seed = read(SEED_FILE);
if (seed !== null && !/ON CONFLICT[\s\S]{0,160}DO NOTHING/i.test(seed)) {
  errors.push(`${SEED_FILE}: ensureLegalTemplateLibrary must keep ON CONFLICT ... DO NOTHING (idempotent re-provision).`);
}

// (b cont.) Auto-provision wired into BOTH boot and the carrier-bootstrap path.
const index = read(INDEX_FILE);
if (index !== null && !/backfillLegalTemplateLibraries\s*\(/.test(index)) {
  errors.push(`${INDEX_FILE}: must call backfillLegalTemplateLibraries() on boot so the library auto-provisions on deploy.`);
}
const bootstrap = read(BOOTSTRAP_FILE);
if (bootstrap !== null && !/provisionLegalTemplateLibraryForCompany\s*\(/.test(bootstrap)) {
  errors.push(
    `${BOOTSTRAP_FILE}: must call provisionLegalTemplateLibraryForCompany() so a newly-activated entity auto-gets its library.`
  );
}

// (c) Real-PG per-entity isolation test present and still asserting isolation.
const test = read(TEST_FILE);
if (test !== null) {
  if (!/provisionLegalTemplateLibraryForCompany/.test(test)) {
    errors.push(`${TEST_FILE}: must exercise provisionLegalTemplateLibraryForCompany against real Postgres.`);
  }
  // Isolation: a second entity must be asserted to have zero rows.
  if (!/entityB/.test(test) || !/toBe\(0\)/.test(test)) {
    errors.push(`${TEST_FILE}: must assert per-entity isolation (a second entity has zero templates — toBe(0)).`);
  }
}

if (errors.length > 0) {
  console.error("verify-legal-template-library-seedable FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "verify-legal-template-library-seedable OK — library non-empty; provision reuses the canonical seeder and is wired into boot + carrier-bootstrap; per-entity isolation test present."
);
