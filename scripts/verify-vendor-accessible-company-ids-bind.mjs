#!/usr/bin/env node
/**
 * T-02: mdata.vendors SELECT scoped by org.user_accessible_company_ids() is a zero-arg SQL
 * function. Passing [id, uuid] makes node-postgres reject: bind supplies 2 params, statement needs 1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/mdata/vendors.routes.ts");
const BAD =
  /user_accessible_company_ids\(\)[\s\S]{0,500}?\[\s*parsedParams\.data\.id\s*,\s*authUser\.uuid\s*\]/;

function scan(src) {
  return BAD.test(src);
}

function live() {
  const src = fs.readFileSync(TARGET, "utf8");
  if (scan(src)) {
    console.error(
      "verify-vendor-accessible-company-ids-bind FAIL — SELECT using user_accessible_company_ids() still binds [id, uuid]",
    );
    process.exit(1);
  }
  console.log("verify-vendor-accessible-company-ids-bind: PASS — no extra uuid bind on zero-arg company_ids()");
}

function selftest() {
  const planted =
    "SELECT org.user_accessible_company_ids()\n" +
    "          `,\n          [parsedParams.data.id, authUser.uuid]";
  const ok =
    "SELECT org.user_accessible_company_ids()\n" +
    "          `,\n          [parsedParams.data.id]";
  if (!scan(planted)) {
    console.error("SELFTEST FAIL — planted extra uuid bind not detected");
    process.exit(1);
  }
  if (scan(ok)) {
    console.error("SELFTEST FAIL — correct one-arg bind flagged");
    process.exit(1);
  }
  console.log("verify-vendor-accessible-company-ids-bind --selftest PASS");
}

if (process.argv.includes("--selftest")) selftest();
else live();
