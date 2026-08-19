#!/usr/bin/env node
/**
 * verify-wave-card-format.mjs — STRICT method enforcement (IH35-TMS).
 *
 * A wave card is valid ONLY if it is a real CLASS card (CLS-* + root cause + lane +
 * layer + modules + instances + completeness + guard + drain_proof + status).
 * Scope: docs/audit/wave-queue.json ONLY (WORM ledger untouched).
 *
 *   node scripts/verify-wave-card-format.mjs
 *   node scripts/verify-wave-card-format.mjs --selftest
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const QUEUE = join(ROOT, "docs/audit/wave-queue.json");
const LABEL = "verify-wave-card-format";
const SELFTEST = process.argv.includes("--selftest");

const LAYERS = new Set(["A", "B", "C", "D", "E", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
const LANES = new Set(["money", "mechanical"]);
const ENTITIES = new Set(["TRANSP", "USMCA", "TRK", "ALL"]);
const STATUS = new Set(["open", "draining", "drained"]);

export function validateWaveQueue(data) {
  const errs = [];
  if (!data || !Array.isArray(data.waves)) {
    return [`queue must be { "waves": [ ... ] }`];
  }
  const seen = new Set();
  data.waves.forEach((w, i) => {
    const tag = w && w.id ? w.id : `waves[${i}]`;
    const bad = (m) => errs.push(`${tag}: ${m}`);
    if (!w || typeof w !== "object") return bad("not an object");
    if (typeof w.id !== "string" || !/^CLS-[A-Z0-9-]+$/.test(w.id)) bad("id must match CLS-<UPPER-KEBAB>");
    if (w.id && seen.has(w.id)) bad("duplicate id");
    if (w.id) seen.add(w.id);
    if (typeof w.root_cause !== "string" || w.root_cause.trim().length < 8) bad("root_cause missing/too short");
    if (!LANES.has(w.lane)) bad(`lane must be money|mechanical (got ${w.lane})`);
    if (!LAYERS.has(w.layer)) bad(`layer must be A-E or V1-V8 (got ${w.layer})`);
    if (!Array.isArray(w.modules) || w.modules.length < 1) bad("modules[] must list >=1 module");
    if (!Array.isArray(w.instances) || w.instances.length < 1) bad("instances[] must have >=1 proven instance");
    else
      w.instances.forEach((ins, j) => {
        if (!ins || typeof ins.path !== "string" || ins.path.trim().length < 3) bad(`instances[${j}].path missing`);
        if (!ins || !ENTITIES.has(ins.entity)) bad(`instances[${j}].entity must be TRANSP|USMCA|TRK|ALL`);
      });
    if (typeof w.completeness !== "string" || w.completeness.trim().length < 8) {
      bad("completeness discriminator missing");
    }
    if (typeof w.guard !== "string" || !/^scripts\/verify-.*\.mjs$/.test(w.guard)) {
      bad("guard must be a scripts/verify-*.mjs path");
    }
    if (!STATUS.has(w.status)) bad(`status must be open|draining|drained (got ${w.status})`);
    const dp = w.drain_proof;
    if (!dp || typeof dp !== "object") bad("drain_proof missing");
    else {
      if (typeof dp.guard_green !== "boolean") bad("drain_proof.guard_green must be boolean");
      if (typeof dp.money_critical !== "boolean") bad("drain_proof.money_critical must be boolean");
      if (typeof dp.guard_sample !== "string") bad("drain_proof.guard_sample must be a string");
      // A money-lane wave that was reclassified with an honest "not actually a defect" disposition
      // (e.g. N/A-PRE-OPERATIONAL — imported history is not a defect, owner ruling
      // FINDING-LOAD-LINKAGE-SCOPE-RULING) legitimately carries money_critical=false: forcing
      // money_critical=true on a correctly-dispositioned non-defect would itself be a false claim
      // of active risk. The exception requires BOTH an explicit N/A-prefixed disposition AND a
      // non-trivial guard_sample explaining the reclassification — a bare money_critical=false with
      // no honest disposition still fails, same as before.
      const honestlyReclassified = typeof dp.disposition === "string" && /^N\/A/i.test(dp.disposition.trim());
      if (w.lane === "money" || dp.money_critical === true) {
        if (dp.money_critical !== true && !honestlyReclassified) {
          bad("money lane requires drain_proof.money_critical=true (or an honest N/A-* disposition)");
        }
        if (!dp.guard_sample || dp.guard_sample.trim().length < 3) {
          bad("money/false-green: drain_proof.guard_sample must name a money-bearing instance");
        }
      }
      if (w.status === "drained") {
        if (dp.guard_green !== true) bad("status=drained requires drain_proof.guard_green=true");
        if (!dp.guard_sample || dp.guard_sample.trim().length < 3) {
          bad("status=drained requires a non-empty guard_sample");
        }
      }
    }
  });
  return errs;
}

function goodCard(overrides = {}) {
  return {
    id: "CLS-EXAMPLE-MECHANICAL",
    root_cause: "Example shared root cause for selftest",
    lane: "mechanical",
    layer: "B",
    modules: ["safety"],
    instances: [{ path: "apps/frontend/src/pages/safety/X.tsx", entity: "TRANSP" }],
    completeness: "visible==n_live_tup on catalogs.x as ih35_app; n_tup_del=0",
    guard: "scripts/verify-example.mjs",
    drain_proof: { guard_green: false, guard_sample: "", money_critical: false },
    status: "open",
    ...overrides,
  };
}

if (SELFTEST) {
  const clean = validateWaveQueue({ waves: [goodCard()] });
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean card rejected:`, clean);
    process.exit(1);
  }
  const malformed = validateWaveQueue({
    waves: [{ id: "not-a-class", root_cause: "x", lane: "mechanical", layer: "B" }],
  });
  if (!malformed.length) {
    console.error(`${LABEL} SELFTEST FAIL — malformed card not caught`);
    process.exit(1);
  }
  const moneyBad = validateWaveQueue({
    waves: [
      goodCard({
        id: "CLS-ECON-EMPTY",
        lane: "money",
        layer: "D",
        drain_proof: { guard_green: false, guard_sample: "", money_critical: false },
      }),
    ],
  });
  if (!moneyBad.some((e) => /money_critical|guard_sample/i.test(e))) {
    console.error(`${LABEL} SELFTEST FAIL — money card without critical sample not caught`);
    process.exit(1);
  }
  // Positive: an honestly-reclassified money card (N/A-* disposition, real guard_sample) must NOT
  // be forced to claim money_critical=true — this is the exact shape of the live
  // CLS-LINKAGE-ONEWAY wave (imported-history-is-not-a-defect, owner-ruled N/A-PRE-OPERATIONAL).
  const moneyHonestNA = validateWaveQueue({
    waves: [
      goodCard({
        id: "CLS-EXAMPLE-NA",
        lane: "money",
        layer: "D",
        drain_proof: {
          guard_green: true,
          guard_sample: "Reclassified per owner ruling — imported history, not a defect.",
          money_critical: false,
          disposition: "N/A-PRE-OPERATIONAL",
        },
      }),
    ],
  });
  if (moneyHonestNA.length) {
    console.error(`${LABEL} SELFTEST FAIL — honest N/A-disposition money card wrongly rejected:`, moneyHonestNA);
    process.exit(1);
  }
  // Negative: money_critical=false WITHOUT an honest N/A-* disposition must still fail, even with
  // a real guard_sample — the exception is narrow, not a blanket weakening.
  const moneyFalseNoDisposition = validateWaveQueue({
    waves: [
      goodCard({
        id: "CLS-EXAMPLE-NO-DISPOSITION",
        lane: "money",
        layer: "D",
        drain_proof: {
          guard_green: true,
          guard_sample: "Some real reasoning but no honest disposition field.",
          money_critical: false,
        },
      }),
    ],
  });
  if (!moneyFalseNoDisposition.some((e) => /money_critical/i.test(e))) {
    console.error(`${LABEL} SELFTEST FAIL — money_critical=false with no honest disposition escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

if (!existsSync(QUEUE)) {
  console.log(`${LABEL}: docs/audit/wave-queue.json not present yet — nothing to validate (pass).`);
  process.exit(0);
}

let data;
try {
  data = JSON.parse(readFileSync(QUEUE, "utf8"));
} catch (e) {
  console.error(`${LABEL} FAIL: ${QUEUE} is not valid JSON: ${e.message}`);
  process.exit(1);
}

const errs = validateWaveQueue(data);
if (errs.length) {
  console.error(`${LABEL} FAIL: ${errs.length} problem(s):`);
  for (const e of errs) console.error("  - " + e);
  process.exit(1);
}
console.log(`${LABEL}: OK — ${data.waves.length} wave card(s) valid.`);
process.exit(0);
