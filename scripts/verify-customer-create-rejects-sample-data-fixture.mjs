#!/usr/bin/env node
/**
 * verify-customer-create-rejects-sample-data-fixture.mjs
 *
 * FAC-03 (owner doc "Factoring Is Built and Running", live-reverified 2026-09-07): "quarantine 11
 * seat-test customers + reject-on-create". PR #21157 (ACCT-F26012) shipped the quarantine half
 * (list reads exclude is_sample_data=true, verify-customers-vendors-sample-data-quarantine.mjs)
 * but only ever auto-FLAGGED a fixture-named customer as is_sample_data on create — the INSERT
 * still succeeded, so a new "P23-SMOKE-…" / "CC3-…" / "TEST …" customer could still be created
 * live in USMCA, just pre-quarantined out of the list. mdata.vendors already has a hard
 * reject-on-create for its own fixture pattern (VEND-3); customers had no equivalent — this
 * guard locks the parity fix (reject on BOTH create and rename, matching VEND-3's own scope).
 *
 * Usage:
 *   node scripts/verify-customer-create-rejects-sample-data-fixture.mjs            # scan
 *   node scripts/verify-customer-create-rejects-sample-data-fixture.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-create-rejects-sample-data-fixture";
const CUSTOMERS = "apps/backend/src/mdata/customers.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkRejectOnCreateAndRename(src) {
  const failures = [];
  if (!/const IS_PROD_ENV = process\.env\.NODE_ENV === ["']production["'];/.test(src)) {
    failures.push(`${CUSTOMERS}: missing IS_PROD_ENV production gate`);
  }
  if (!/function sendSampleDataCustomerFixtureRejected/.test(src)) {
    failures.push(`${CUSTOMERS}: missing sendSampleDataCustomerFixtureRejected(reply) responder`);
  }
  // Create path: must reject BEFORE the INSERT (checked against normalizedName), not just
  // silently flag is_sample_data on the row that still gets written.
  if (
    !/IS_PROD_ENV\s*&&\s*looksLikeSampleDataName\(normalizedName\)[\s\S]{0,40}return sendSampleDataCustomerFixtureRejected\(reply\);/.test(
      src,
    )
  ) {
    failures.push(`${CUSTOMERS}: create handler must reject a sample-data-looking name, not only flag it`);
  }
  // Rename path: must reject BEFORE the UPDATE (checked against patchName), matching VEND-3's
  // create+rename scope — a real customer must not be renamed INTO a fixture-looking name either.
  if (
    !/IS_PROD_ENV\s*&&\s*patchName[\s\S]{0,10}&&\s*looksLikeSampleDataName\(patchName\)[\s\S]{0,40}return sendSampleDataCustomerFixtureRejected\(reply\);/.test(
      src,
    )
  ) {
    failures.push(`${CUSTOMERS}: patch/rename handler must reject renaming into a sample-data-looking name`);
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(CUSTOMERS);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkRejectOnCreateAndRename(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    const IS_PROD_ENV = process.env.NODE_ENV === "production";
    function sendSampleDataCustomerFixtureRejected(reply) {
      return reply.code(422).send({ error: "mdata_customer_sample_data_fixture_rejected" });
    }
    app.post("/api/v1/mdata/customers", async (req, reply) => {
      const normalizedName = repairUtf8Mojibake(b.legal_name ?? b.name ?? "");
      if (IS_PROD_ENV && looksLikeSampleDataName(normalizedName)) {
        return sendSampleDataCustomerFixtureRejected(reply);
      }
    });
    app.patch("/api/v1/mdata/customers/:id", async (req, reply) => {
      const patchName = b.legal_name ?? b.name ?? null;
      if (IS_PROD_ENV && patchName != null && looksLikeSampleDataName(patchName)) {
        return sendSampleDataCustomerFixtureRejected(reply);
      }
    });
  `;
  const missingResponder = goodSrc.replace(
    /function sendSampleDataCustomerFixtureRejected[\s\S]*?\n    \}\n/,
    "",
  );
  const missingCreateReject = goodSrc.replace(
    `      if (IS_PROD_ENV && looksLikeSampleDataName(normalizedName)) {
        return sendSampleDataCustomerFixtureRejected(reply);
      }
`,
    "      // reject check removed — falls through to silent auto-flag only\n",
  );
  const missingRenameReject = goodSrc.replace(
    `      if (IS_PROD_ENV && patchName != null && looksLikeSampleDataName(patchName)) {
        return sendSampleDataCustomerFixtureRejected(reply);
      }
`,
    "      // reject check removed\n",
  );
  const missingProdGate = goodSrc.replace(
    'const IS_PROD_ENV = process.env.NODE_ENV === "production";',
    "",
  );

  const checks = [
    ["clean source passes", checkRejectOnCreateAndRename(goodSrc).length === 0],
    ["missing responder fails", checkRejectOnCreateAndRename(missingResponder).length > 0],
    ["missing create-path reject fails", checkRejectOnCreateAndRename(missingCreateReject).length > 0],
    ["missing rename-path reject fails", checkRejectOnCreateAndRename(missingRenameReject).length > 0],
    ["missing IS_PROD_ENV gate fails", checkRejectOnCreateAndRename(missingProdGate).length > 0],
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
console.log(`${LABEL}: OK — customer create + rename both reject sample-data fixture names in production (FAC-03)`);
process.exit(0);
