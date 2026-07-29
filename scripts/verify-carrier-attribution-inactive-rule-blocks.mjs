#!/usr/bin/env node
/**
 * LST-F24b — an INACTIVE lease-assignment rule must actually block.
 *
 * The defect this exists to prevent, found live on 2026-07-29: the USMCA rule in
 * config/samsara-carrier-attribution.json read `"active": false` — and still returned the USMCA
 * operating_company_id on every ingest.
 *
 * resolveLeaseCompanyId() in scripts/ingest-samsara-to-mdata-units.mjs treats `active_from` as an
 * override that RE-ENABLES a rule once the date passes:
 *
 *     const isActive = rule.active !== false;
 *     if (!isActive) {
 *       const activeFrom = ...;
 *       if (!activeFrom) return null;                 // blocked
 *       if (nowDate < activeFromDate) return null;    // blocked until the date
 *     }
 *     return rule.operating_company_id;               // <-- falls through once the date passes
 *
 * So `active: false` + a PAST `active_from` is not "off", it is "on". The stale 2026-07-01 date
 * meant the next Samsara ingest would have leased units to USMCA — an entity that has not begun
 * operating and has no plates or IRP. A flag that reads OFF to a human and behaves ON is the exact
 * class of silent defect the hardline forbids.
 *
 * The rule: if `active` is false, `active_from` must be ABSENT or STRICTLY IN THE FUTURE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CONFIG = join(ROOT, "config", "samsara-carrier-attribution.json");

/** Mirrors resolveLeaseCompanyId()'s gate exactly. Returns true when the rule would still fire. */
export function inactiveRuleStillFires(rule, nowDate) {
  if (rule?.active !== false) return false; // not an inactive rule; not this guard's business
  const activeFrom = String(rule.active_from ?? "").trim();
  if (!activeFrom) return false; // no date -> genuinely blocked
  const activeFromDate = new Date(`${activeFrom}T00:00:00.000Z`);
  if (Number.isNaN(activeFromDate.getTime())) return false; // unparseable -> blocked
  return nowDate >= activeFromDate; // date reached -> rule fires despite active:false
}

function selftest() {
  const now = new Date("2026-07-29T00:00:00.000Z");
  const cases = [
    { name: "active:false + PAST active_from -> caught", rule: { active: false, active_from: "2026-07-01" }, want: true },
    { name: "active:false + FUTURE active_from -> allowed", rule: { active: false, active_from: "2026-12-01" }, want: false },
    { name: "active:false + no active_from -> allowed (genuinely off)", rule: { active: false }, want: false },
    { name: "active:true -> not this guard's business", rule: { active: true, active_from: "2020-01-01" }, want: false },
    { name: "active absent (defaults on) -> not flagged", rule: {}, want: false },
    { name: "active:false + unparseable date -> allowed", rule: { active: false, active_from: "nonsense" }, want: false },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = inactiveRuleStillFires(c.rule, now);
    if (got !== c.want) {
      console.error(`  selftest FAIL — ${c.name}: expected ${c.want}, got ${got}`);
      bad += 1;
    } else {
      console.log(`  selftest OK — ${c.name}`);
    }
  }
  if (bad) {
    console.error(`verify-carrier-attribution-inactive-rule-blocks SELFTEST FAILED — ${bad} case(s)`);
    process.exit(1);
  }
  console.log(`verify-carrier-attribution-inactive-rule-blocks SELFTEST OK — ${cases.length}/${cases.length}`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (err) {
  console.error(`verify:carrier-attribution-inactive-rule-blocks FAIL — cannot read/parse ${CONFIG}: ${err.message}`);
  process.exit(1);
}

const rules = Array.isArray(config.lease_assignment_rules) ? config.lease_assignment_rules : null;
if (!rules || rules.length === 0) {
  console.error("verify:carrier-attribution-inactive-rule-blocks FAIL — lease_assignment_rules missing or empty; refusing to report green");
  process.exit(1);
}

const now = new Date();
const offenders = rules.filter((r) => inactiveRuleStillFires(r, now));

if (offenders.length > 0) {
  console.error(
    `verify:carrier-attribution-inactive-rule-blocks FAIL — ${offenders.length} rule(s) are marked ` +
      `"active": false but STILL RESOLVE, because active_from has already passed:`
  );
  for (const r of offenders) {
    console.error(`  tag "${r.samsara_tag}" -> ${r.operating_company_id} (active_from ${r.active_from})`);
  }
  console.error(
    "\nresolveLeaseCompanyId() treats a reached active_from as an override that re-enables the rule.\n" +
      "A rule that reads OFF and behaves ON will lease units to an entity that is not operating.\n" +
      "Fix: REMOVE active_from (then active:false genuinely blocks), or set it to a real future date.\n" +
      "To turn a rule on, set active:true — do not rely on a past date."
  );
  process.exit(1);
}

const inactive = rules.filter((r) => r?.active === false).length;
console.log(
  `verify:carrier-attribution-inactive-rule-blocks OK — ${rules.length} rule(s), ${inactive} inactive, ` +
    `none silently re-enabled by a past active_from`
);
