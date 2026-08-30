#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/mdata/drivers.routes.ts",
  api: "apps/frontend/src/api/mdata.ts",
  types: "apps/frontend/src/types/api.ts",
  create: "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
  profile: "apps/frontend/src/pages/DriverDetail.tsx",
};
const REQUIRED = {
  route: [
    "referred_by_driver_id: z.string().uuid().optional()",
    "referral_source: z.string().trim().max(160).optional()",
    'return { error: "referring_driver_not_found" as const }',
    "AND operating_company_id = $2::uuid",
    "SET referred_by_driver_id = $3::uuid",
    'b.referred_by_driver_id === parsedParams.data.id',
    'app.get("/api/v1/mdata/drivers/:id/referrals"',
    "AND referred_by_driver_id = $2::uuid",
    "referral_reward_settlement_id::text",
    "AS referred_by_driver_name",
  ],
  api: ["listDriverReferrals", "DriverReferralRow", "/referrals?${qs.toString()}"],
  types: ["referred_by_driver_id: string | null", "referred_by_driver_name?: string | null", "referral_source: string | null"],
  create: [
    'kind="driver"',
    'allowCreate={false}',
    'dataTestId="driver-create-referrer"',
    "referred_by_driver_id: parsed.referred_by_driver_id || undefined",
    "referral_source: parsed.referral_source || undefined",
  ],
  profile: [
    'data-testid="driver-referral-lifecycle"',
    'dataTestId="driver-profile-referrer"',
    'kind="driver"',
    "listDriverReferrals",
    "Couldn't load referrals — Retry",
    "No referred drivers.",
    "Reward paid",
  ],
};
function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  return missing;
}
const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  let count = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) for (const token of tokens) {
    const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
    if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
    count += 1;
  }
  console.log(`verify-driver-referral-forward-reverse-lifecycle --selftest PASS ${count}/${count}`);
  process.exit(0);
}
const missing = verify(sources);
if (missing.length) {
  console.error(`verify-driver-referral-forward-reverse-lifecycle FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-driver-referral-forward-reverse-lifecycle PASS — scoped picker/write, forward referrer, and reverse referrals wired");
