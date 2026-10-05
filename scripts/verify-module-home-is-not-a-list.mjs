#!/usr/bin/env node
/**
 * PR3 — module home is not a bare list (owner 2026-10-05).
 * A module root renders: sentence-case title · KPI strip · tab strip. Never all-caps title alone
 * with a roster as the only content.
 * Run: node scripts/verify-module-home-is-not-a-list.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const HOMES = [
  {
    name: "Fleet home",
    file: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    must: [
      /title="Fleet"/,
      /<KpiStrip/,
      /<NavyPageSubNav/,
      /data-testid="fleet-kpi-strip"/,
      /data-testid="fleet-module-tabs"/,
      /data-testid="fleet-flt-f428-banner"/,
      /data-module-home="fleet"/,
    ],
    mustNot: [/title="FLEET"/, /title=\{"FLEET"\}/],
  },
];

export function audit(read) {
  const fails = [];
  for (const h of HOMES) {
    const src = read(h.file);
    for (const re of h.must) if (!re.test(src)) fails.push(`${h.name}: missing ${re}`);
    for (const re of h.mustNot ?? []) if (re.test(src)) fails.push(`${h.name}: regressed ${re}`);
  }
  return fails;
}

const read = (f) => readFileSync(f, "utf8");

if (process.argv.includes("--selftest")) {
  const good = read(HOMES[0].file);
  if (audit((f) => (f === HOMES[0].file ? good : "")).length) {
    console.error("selftest FAIL: live Fleet home must pass");
    process.exit(1);
  }
  const capped = good.replace('title="Fleet"', 'title="FLEET"');
  if (!audit((f) => (f === HOMES[0].file ? capped : "")).some((m) => /FLEET/.test(m))) {
    console.error("selftest FAIL: all-caps FLEET was not caught");
    process.exit(1);
  }
  const noKpi = good.replace(/<KpiStrip[\s\S]*?<\/KpiStrip>/, "");
  if (!audit((f) => (f === HOMES[0].file ? noKpi : "")).some((m) => /KpiStrip/.test(m))) {
    console.error("selftest FAIL: missing KpiStrip was not caught");
    process.exit(1);
  }
  console.log("verify-module-home-is-not-a-list SELFTEST OK — 3/3");
  process.exit(0);
}

const fails = audit(read);
if (fails.length) {
  console.error(`verify-module-home-is-not-a-list: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`verify-module-home-is-not-a-list: OK — ${HOMES.length} module home(s)`);
