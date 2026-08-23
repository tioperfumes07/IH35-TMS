#!/usr/bin/env node
/**
 * ACCT-F5983 — `home.vendor_merges` (FactoringHome.tsx, /factoring/vendor-merges) is Required
 * `vendor` in docs/specs/scoreboard/modules/factoring.required.json. The backend
 * (data-infra/data-infra.service.ts, LINK-F5171/LINK-F5183) already resolves
 * from_qbo_vendor_id/to_qbo_vendor_id -> the real internal mdata.vendors row via
 * mdata.vendors.qbo_vendor_id and returns from_vendor_id/from_vendor_name/to_vendor_id/
 * to_vendor_name -- but FactoringHome.tsx's VENDOR_MERGE_COLUMNS never used those already-resolved
 * fields, rendering the raw QBO id string as plain text instead. The forward-link data existed;
 * only the render was theater (memo text where a real EntityLink should be).
 *
 * Fixed by rendering EntityLinkOrTombstone when an internal vendor match exists, honestly falling
 * back to the raw QBO id text (not a bare "-") when it doesn't -- the id itself is real data, not
 * unresolved.
 */
import fs from "node:fs";

const LABEL = "verify-vendor-merges-resolved-vendor-link";
const F = { page: "apps/frontend/src/pages/factoring/FactoringHome.tsx" };
const checks = [
  [
    "page",
    /row\.from_vendor_id \? \(\s*<EntityLinkOrTombstone kind="vendor" id={row\.from_vendor_id} name={row\.from_vendor_name}/,
    "From-vendor column renders a real EntityLink when an internal vendor match exists",
  ],
  [
    "page",
    /row\.to_vendor_id \? \(\s*<EntityLinkOrTombstone kind="vendor" id={row\.to_vendor_id} name={row\.to_vendor_name}/,
    "To-vendor column renders a real EntityLink when an internal vendor match exists",
  ],
  [
    "page",
    /\) : \(\s*row\.from_qbo_vendor_id\s*\)/,
    "From-vendor column honestly falls back to the raw QBO id text (not a bare dash) when unresolved",
  ],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted ACCT-F5983 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — Driver Vendor Merges columns use the already-resolved internal vendor link, not raw QBO-id text theater`);
