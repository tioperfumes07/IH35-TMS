#!/usr/bin/env node
/**
 * LIABILITY-SURFACES-BUILT — tag proven liability / reserve / escrow surfaces as
 * @matrix-built so Priority-10 Wave C does not count already-wired leaves as gaps.
 *
 * Proven (FE + API already live — no new GL math):
 *   - accounting escrow (EscrowPage accounts + postings)
 *   - settlements settlements.detail (LiabilityBreakdownModal)
 *
 * DOES NOT tag held phantom-view leaves (recourse_pipeline / submit / batches) or
 * cash_advances / pre_settlements — those stay OPEN for CC-1 money lane.
 *
 * LINK-F5187-CLUSTER-A-CORRECTION (2026-08-15, CC-1): this guard used to also claim
 * factoring home.reserve_tracker / reserves.dashboard as liability-built, "proven" by
 * ReserveTracker.tsx / ReserveDashboard.tsx calling getReserveBalances() -- but that is a
 * data-fetch function name, not proof of an EntityLink. Verified live 2026-08-15: neither
 * file contains any EntityLink kind="liability" (only kind="factor"). Both are reserve-
 * balance rollup views (categorical aggregate across many reserve movements), not a single
 * owning liability record -- same false-required class as the already-dropped gl_je/ap_bill
 * flags on their sibling rollups this session. docs/specs/scoreboard/modules/
 * factoring.required.json already correctly dropped liability from both leaves (LINK-F5187
 * cluster A, PR #6976, honesty_audit['liability_2026_08_15_cluster_a'] -- which itself
 * supersedes this guard's original honesty_audit['liability_surfaces_built_2026_08_12']
 * claim) -- this guard's own MUST_KEEP + file checks were the stale side of that drift and
 * are removed here to match.
 *
 * @matrix-built {"modules":["accounting"],"cols":["liability"],"leafRe":"^escrow$","task":"WAVE-C-liability-escrow","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["liability"],"leafRe":"^settlements\\.detail$","task":"WAVE-C-liability-settlement-detail","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-liability-surfaces-built.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liability-surfaces-built";

const MUST_KEEP = {
  accounting: {
    escrow: ["liability"],
  },
  settlements: {
    "settlements.detail": ["liability"],
  },
};

const FILES = [
  "apps/frontend/src/pages/accounting/EscrowPage.tsx",
  "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  "apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx",
];

function loadMod(mod) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"),
  );
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function checkKeep(doc, leafCols, mod) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [id, cols] of Object.entries(leafCols)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`${mod} missing KEEP ${id}`);
      continue;
    }
    for (const c of cols) {
      if (!(leaf.required || []).includes(c)) out.push(`${mod}.${id} must KEEP require ${c}`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const doc = loadMod("accounting");
  const clone = structuredClone(doc);
  const leaf = clone.leaves.find((l) => l.id === "escrow");
  if (!leaf) fail("selftest: escrow missing");
  leaf.required = (leaf.required || []).filter((c) => c !== "liability");
  const bad = checkKeep(clone, MUST_KEEP.accounting, "accounting");
  if (!bad.length) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];
for (const [mod, leafCols] of Object.entries(MUST_KEEP)) {
  failures.push(...checkKeep(loadMod(mod), leafCols, mod));
}

for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) failures.push(`missing ${rel}`);
}

const escrow = fs.readFileSync(path.join(ROOT, FILES[0]), "utf8");
const detail = fs.readFileSync(path.join(ROOT, FILES[1]), "utf8");

if (!/listEscrow|escrow/.test(escrow)) failures.push("EscrowPage must load escrow accounts");
if (!/LiabilityBreakdownModal/.test(detail)) failures.push("SettlementDetail must mount LiabilityBreakdownModal");

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — escrow + settlements.detail liability surfaces tagged built`,
);
