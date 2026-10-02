#!/usr/bin/env node
/**
 * ROUND 326 item 3: one driver profile that is the whole driver.
 *   static -- GET /api/v1/drivers/:id/whole-profile serves all 17 blocks (pay basis · settlements + lines · advances ·
 *             escrow · deductions · reimbursements · fuel · units + trailers · loads · safety · drug & alcohol ·
 *             medical card · CDL · insurance · documents · HOS · Samsara) and the driver page renders every one;
 *   live   -- runs the real service (scripts/lib/print-driver-profiles.ts) for every active USMCA driver: every block
 *             must return a value or a NAMED reason (0 malformed), and the number of drivers whose block is empty
 *             may only shrink against scripts/verify-driver-profile-linkage.baseline.json (linkage only grows).
 * Fails closed without DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const ROOT = process.cwd();
const svc = readFileSync("apps/backend/src/mdata/canonical/driver-profile.service.ts", "utf8");
const ui = readFileSync("apps/frontend/src/components/driver-profile/DriverWholeProfile.tsx", "utf8");
const routes = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.routes.ts", "utf8");
const page = readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");
const BLOCKS = ["pay_basis", "settlements", "advances", "escrow", "deductions", "reimbursements", "fuel", "equipment", "loads",
  "safety", "drug_alcohol", "medical_card", "cdl", "insurance", "documents", "hos", "samsara"];
const fails = [];
if (!/"\/api\/v1\/drivers\/:id\/whole-profile"/.test(routes)) fails.push("route GET /api/v1/drivers/:id/whole-profile is not registered");
for (const b of BLOCKS) {
  if (!new RegExp(`\\b${b}: block\\(`).test(svc)) fails.push(`service must return block ${b} as block(value, reason)`);
  if (!ui.includes(`testId="driver-profile-${b.replace(/_/g, "-")}"`)) fails.push(`UI must render block ${b} (driver-profile-${b.replace(/_/g, "-")})`);
}
if (!/<DriverWholeProfile /.test(page)) fails.push("DriverDetail must mount DriverWholeProfile");
if (/coming soon|placeholder panel/i.test(ui)) fails.push("profile UI must not carry placeholder panels");
const baseline = JSON.parse(readFileSync("scripts/verify-driver-profile-linkage.baseline.json", "utf8"));
if (!process.env.DATABASE_URL) { console.error("verify-driver-profile-linkage: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const rows = JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/lib/print-driver-profiles.ts"), baseline.operating_company_id],
  { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 1 << 24 }));
const empty = Object.fromEntries(BLOCKS.map((b) => [b, 0]));
for (const r of rows) for (const b of BLOCKS) {
  if (r.blocks[b] === "malformed") fails.push(`${r.name}: block ${b} returned neither a value nor a named reason`);
  if (r.blocks[b] === "reason") empty[b]++;
}
console.log(`drivers checked: ${rows.length}`);
for (const b of BLOCKS) {
  const allowed = baseline.empty_block_drivers[b] ?? 0;
  console.log(`  ${b.padEnd(15)} value ${rows.length - empty[b]}  named-reason ${empty[b]} (baseline ${allowed})`);
  if (empty[b] > allowed) fails.push(`block ${b}: ${empty[b]} drivers empty > baseline ${allowed} (linkage went backwards)`);
}
if (fails.length) { console.error("verify-driver-profile-linkage: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-driver-profile-linkage: OK");
