#!/usr/bin/env node
/**
 * Matrix Option A ribbon — mutually exclusive tier tally must sum to required.
 * Mirrors apps/backend/src/program/matrix-metrics-tally.ts (keep in sync).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-metrics-tally";
const SELFTEST = process.argv.includes("--selftest");
const TALLY_TS = path.join(ROOT, "apps/backend/src/program/matrix-metrics-tally.ts");
const MATRIX_SVC = path.join(ROOT, "apps/backend/src/program/module-matrix.service.ts");
const SYSTEM_VIEW = path.join(ROOT, "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx");

export function emptyTierBucket() {
  return {
    requiredCells: 0,
    liveCells: 0,
    builtOnlyCells: 0,
    probeOnlyCells: 0,
    auditedOnlyCells: 0,
    unauditedCells: 0,
  };
}

export function matrixPct(numerator, denominator) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function classifyMatrixCellTier(input) {
  if (!input.required) return "na";
  if (input.live) return "live";
  if (input.built) return "built";
  if (input.probeReason) return "probe";
  if (input.audited) return "audited";
  return "unaudited";
}

export function accumulateTierBucket(bucket, tier) {
  if (tier === "na") return;
  bucket.requiredCells += 1;
  switch (tier) {
    case "live":
      bucket.liveCells += 1;
      break;
    case "built":
      bucket.builtOnlyCells += 1;
      break;
    case "probe":
      bucket.probeOnlyCells += 1;
      break;
    case "audited":
      bucket.auditedOnlyCells += 1;
      break;
    default:
      bucket.unauditedCells += 1;
  }
}

export function finalizeTierMetrics(bucket) {
  const { requiredCells } = bucket;
  const livePct = matrixPct(bucket.liveCells, requiredCells);
  return {
    ...bucket,
    builtCells: bucket.builtOnlyCells + bucket.liveCells,
    auditedCells: bucket.auditedOnlyCells + bucket.probeOnlyCells,
    buildQueue: requiredCells - bucket.liveCells,
    requiredPct: requiredCells === 0 ? 0 : 100,
    auditedOnlyPct: matrixPct(bucket.auditedOnlyCells, requiredCells),
    probeOnlyPct: matrixPct(bucket.probeOnlyCells, requiredCells),
    builtOnlyPct: matrixPct(bucket.builtOnlyCells, requiredCells),
    livePct,
    certifiedPct: livePct,
    modulePct: livePct,
  };
}

export function assertTierTallyConsistent(bucket, label = "matrix") {
  const sum =
    bucket.liveCells +
    bucket.builtOnlyCells +
    bucket.probeOnlyCells +
    bucket.auditedOnlyCells +
    bucket.unauditedCells;
  if (sum !== bucket.requiredCells) {
    return [
      `${label} tier tally mismatch: ${sum} !== required ${bucket.requiredCells}`,
    ];
  }
  return [];
}

export function simulateBoard(cells) {
  const bucket = emptyTierBucket();
  for (const cell of cells) {
    const tier = classifyMatrixCellTier(cell);
    accumulateTierBucket(bucket, tier);
  }
  return finalizeTierMetrics(bucket);
}

export function exactSystemTrackerProblems(source) {
  const problems = [];
  if (!/const live = sys\.liveCells;/.test(source)) {
    problems.push("system tracker must use exact sys.liveCells, never reconstruct Live from rounded boxAbl percentages");
  }
  if (!/const builtCum = sys\.builtCells;/.test(source)) {
    problems.push("system tracker must use exact sys.builtCells, never reconstruct Built from rounded boxAbl percentages");
  }
  if (/Math\.round\(\(sys\.boxAbl\.(?:livePct|builtPct) \/ 100\) \* req\)/.test(source)) {
    problems.push("system tracker exact Built/Live counts must not be reconstructed from rounded percentages");
  }
  return problems;
}

function repoProblems() {
  const problems = [];
  if (!fs.existsSync(TALLY_TS)) problems.push(`MISSING ${TALLY_TS}`);
  if (!fs.existsSync(MATRIX_SVC)) problems.push(`MISSING ${MATRIX_SVC}`);
  else {
    const svc = fs.readFileSync(MATRIX_SVC, "utf8");
    if (!svc.includes("matrix-metrics-tally")) {
      problems.push("module-matrix.service.ts must import matrix-metrics-tally");
    }
    if (!svc.includes("groupRollups")) {
      problems.push("module-matrix.service.ts must expose groupRollups on payload");
    }
    if (!/SystemModuleMatrixPayload[\s\S]*groupRollups:\s*MatrixGroupRollup/.test(svc)) {
      problems.push("buildSystemModuleMatrix payload must include system groupRollups (parity with module boards)");
    }
    if (!svc.includes("assertTierTallyConsistent")) {
      problems.push("module-matrix.service.ts must assert tier tally before respond");
    }
    if (!svc.includes("classifyMatrixCellTier")) {
      problems.push("module-matrix.service.ts must classify cells with classifyMatrixCellTier");
    }
    if (!svc.includes("closedCells")) {
      problems.push("module-matrix.service.ts must expose closedCells (explicit leaf:col, not Box 4 fan-out)");
    }
    if (!svc.includes("FULLY_WIRED_MATRIX_ITEMS")) {
      problems.push("module-matrix.service.ts must roll up Fully-Wired 1–12 from Built/closed");
    }
    if (!/clickedCells/.test(svc)) {
      problems.push("module-matrix.service.ts must expose clickedCells (Chrome click, not Box 4)");
    }
    if (!/frozenOps/.test(svc) || !/readyAbl/.test(svc) || !/isOpsReadyColumn/.test(svc)) {
      problems.push("module-matrix.service.ts must expose frozen ops READY (non-money, USMCA Clicked)");
    }
  }
  if (!fs.existsSync(SYSTEM_VIEW)) problems.push(`MISSING ${SYSTEM_VIEW}`);
  else {
    const view = fs.readFileSync(SYSTEM_VIEW, "utf8");
    problems.push(...exactSystemTrackerProblems(view));
    if (!/Clicked/.test(view) || !/Named/.test(view) || !/Modals/.test(view) || !/READY/.test(view) || !/Miss C/.test(view)) {
      problems.push("ModuleMatrixSystemView must keep atoms and add Named + Leaves + Modals + Clicked + Frozen + Miss C + READY");
    }
  }
  return problems;
}

if (SELFTEST) {
  const m = simulateBoard([
    { required: true, live: false, built: false, probeReason: "x", audited: true },
    { required: true, live: false, built: true, audited: true },
    { required: true, live: true, built: true, audited: true },
    { required: true, live: false, built: false, audited: true },
    { required: true, live: false, built: false, audited: false },
  ]);
  if (m.requiredCells !== 5) {
    console.error(`${LABEL} selftest: expected 5 required got ${m.requiredCells}`);
    process.exit(1);
  }
  if (m.liveCells !== 1 || m.builtOnlyCells !== 1 || m.probeOnlyCells !== 1 || m.auditedOnlyCells !== 1) {
    console.error(`${LABEL} selftest: tier cell counts wrong`, m);
    process.exit(1);
  }
  if (m.certifiedPct !== m.livePct || m.certifiedPct !== 20) {
    console.error(`${LABEL} selftest: certified must equal livePct`, m);
    process.exit(1);
  }
  const bad = emptyTierBucket();
  bad.requiredCells = 3;
  bad.liveCells = 2;
  if (assertTierTallyConsistent(bad).length === 0) {
    console.error(`${LABEL} selftest: tally mismatch should fail`);
    process.exit(1);
  }
  const systemView = fs.readFileSync(SYSTEM_VIEW, "utf8");
  const plantedRoundedReconstruction = systemView.replace(
    "const live = sys.liveCells;",
    "const live = Math.round((sys.boxAbl.livePct / 100) * req);",
  );
  if (!exactSystemTrackerProblems(plantedRoundedReconstruction).some((p) => p.includes("exact sys.liveCells"))) {
    console.error(`${LABEL} selftest: rounded-percent tracker mutation escaped`);
    process.exit(1);
  }
  const repo = repoProblems();
  if (repo.length) {
    console.error(`${LABEL} selftest repo wiring:`, repo);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const repo = repoProblems();
if (repo.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of repo) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Option A tier tally wired in matrix API`);
process.exit(0);
