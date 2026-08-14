#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/driver-safety/DriverSafetyProfilePage.tsx", "utf8");
function failures(value = source) {
  return [
    ["ApiError import", value.includes('import { ApiError } from "../../../api/client"')],
    ["HTTP status preserved", value.includes("status={query.error instanceof ApiError ? query.error.status : 0}")],
    ["retry retained", value.includes("onRetry={() => void query.refetch()}")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const planted = source.replace("status={query.error instanceof ApiError ? query.error.status : 0}", "");
  if (!failures(planted).includes("HTTP status preserved")) process.exit(1);
  console.log("verify-safety-profile-error-contract selftest PASS — status mutation red");
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-safety-profile-error-contract FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-profile-error-contract PASS — HTTP/non-HTTP status remains explicit");
