#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link"],"leaves":["drivers.picker.exclude_sample"],"task":"DRV-F6301-CANONICAL-LIST-OMITS-SHARED-DRIVERS","vertical":"column-wave"} */
/**
 * LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER-2026-08-23: GET /api/v1/mdata/drivers is the
 * canonical driver list/picker read — used by the Driver Hub Assign-Temp-Cover modal and every other
 * driver picker across the app. Root-caused live: it excluded archived and pseudo-system drivers but
 * NOT is_sample_data ones, so agent/QA fixture drivers ("CODEX ACTIVE FLEET TEST 20260821",
 * "TEST-DRIVER-1 SEED", etc.) were live and selectable in real dispatch/scheduling flows on
 * production. mdata.units (DISPATCH-4) and driver-scheduler.service.ts already had this exclusion;
 * this route did not. Data corrected live (13 fixture rows flagged is_sample_data=true); this guard
 * holds the read-path fix so it cannot regress.
 *
 * Self-test: node scripts/verify-driver-list-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/mdata/drivers.routes.ts",
  api: "apps/frontend/src/api/mdata.ts",
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const LABEL = "verify-driver-list-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const handlerMatch = src.routes.match(
    /app\.get\("\/api\/v1\/mdata\/drivers",[\s\S]*?const result = await withCurrentUser\(authUser\.uuid, async \(client\) => \{[\s\S]*?\n\s*\}\);/,
  );
  if (!handlerMatch) {
    failures.push(`${FILES.routes}: GET /api/v1/mdata/drivers handler not found`);
    return failures;
  }
  const body = handlerMatch[0];
  if (!/filters\.push\("is_sample_data IS NOT TRUE"\)/.test(body)) {
    failures.push(
      `${FILES.routes}: GET /api/v1/mdata/drivers must exclude is_sample_data rows from the ` +
        `canonical driver list/picker read, matching units.routes.ts (DISPATCH-4) and ` +
        `driver-scheduler.service.ts — otherwise agent/QA fixture drivers surface live in every ` +
        `driver picker across the app`,
    );
  }
  const authorizationJoins = body.match(/FROM mdata\.driver_company_authorizations canonical_list_dca[\s\S]{0,260}canonical_list_dca\.driver_id = mdata\.drivers\.id[\s\S]{0,180}canonical_list_dca\.company_id = \$\$\{ociIdx\}::uuid[\s\S]{0,180}canonical_list_dca\.is_authorized = true[\s\S]{0,180}canonical_list_dca\.deactivated_at IS NULL/g) ?? [];
  if (authorizationJoins.length !== 2) {
    failures.push(`${FILES.routes}: canonical driver count and row reads must both admit active selected-company driver authorizations`);
  }
  if (!/function unmistakableDriverFixtureName[\s\S]{0,260}\(test\|codex\|zztest\)/.test(src.routes) ||
      !/\(b\.is_sample_data \?\? false\) \|\| unmistakableDriverFixtureName\(b\.first_name, b\.last_name\)/.test(src.routes)) {
    failures.push(`${FILES.routes}: unmistakable TEST/CODEX onboarding names must be marked is_sample_data at the canonical create write`);
  }
  if (!/quarantine_test_fixture: z\.literal\(true\)\.optional\(\)/.test(src.routes) ||
      !/mdata_driver_test_fixture_has_real_activity/.test(src.routes) ||
      !/is_sample_data = CASE WHEN \$4::boolean THEN true ELSE is_sample_data END/.test(src.routes) ||
      !/status_locked_reason = CASE WHEN \$4::boolean THEN 'test_fixture_quarantine'/.test(src.routes)) {
    failures.push(`${FILES.routes}: canonical deactivate route must atomically quarantine only unlinked fixture drivers as sample + inactive`);
  }
  if (!/reason: quarantineTestFixture \? "test fixture quarantined per owner ruling — never delete"/.test(src.routes)) {
    failures.push(`${FILES.routes}: fixture quarantine must retain the owner reason in the append-only audit event`);
  }
  if (!/deactivateDriver\(id: string, options\?: \{ quarantineTestFixture\?: boolean \}\)/.test(src.api) ||
      !/body: options\?\.quarantineTestFixture \? \{ quarantine_test_fixture: true \} : \{\}/.test(src.api)) {
    failures.push(`${FILES.api}: canonical driver API must expose the audited fixture-quarantine flag`);
  }
  for (const key of ["detail", "profile"]) {
    if (!/deactivateDriver\([\s\S]{0,400}quarantineTestFixture:[\s\S]{0,200}\(test\|codex\|zztest\)/.test(src[key])) {
      failures.push(`${FILES[key]}: unmistakable TEST/CODEX driver deactivation must use fixture quarantine mode`);
    }
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(root, rel), "utf8")]),
  );
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    ...good,
    routes: good.routes.replace('filters.push("is_sample_data IS NOT TRUE");', ""),
  };
  if (mutated.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped`);
    process.exit(1);
  }
  const sharedMutation = {
    ...good,
    routes: good.routes.replaceAll("canonical_list_dca.is_authorized = true", "canonical_list_dca.is_authorized = false"),
  };
  if (audit(sharedMutation).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — shared-driver authorization mutation escaped`);
    process.exit(1);
  }
  const createMutation = {
    ...good,
    routes: good.routes.replace("(b.is_sample_data ?? false) || unmistakableDriverFixtureName(b.first_name, b.last_name)", "b.is_sample_data ?? false"),
  };
  if (audit(createMutation).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — fixture-create mutation escaped`);
    process.exit(1);
  }
  const quarantineMutation = {
    ...good,
    routes: good.routes.replace("is_sample_data = CASE WHEN $4::boolean THEN true ELSE is_sample_data END", "is_sample_data = is_sample_data"),
  };
  if (audit(quarantineMutation).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — fixture-quarantine mutation escaped`);
    process.exit(1);
  }
  const uiMutation = {
    ...good,
    api: good.api.replace("{ quarantine_test_fixture: true }", "{}"),
  };
  if (audit(uiMutation).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — fixture-quarantine UI mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — canonical driver list/picker excludes fixtures and admits active shared drivers`);
