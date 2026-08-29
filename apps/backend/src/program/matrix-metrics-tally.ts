/**
 * Matrix scoreboard tier math — mutually exclusive buckets, one denominator (required cells).
 * Option A ribbon (2026-08-11): Required · Audited · Probe · Built · Live · Certified.
 */

export type MatrixCellTier = "na" | "live" | "built" | "probe" | "audited" | "unaudited";

export type MatrixTierBucket = {
  requiredCells: number;
  liveCells: number;
  builtOnlyCells: number;
  probeOnlyCells: number;
  auditedOnlyCells: number;
  unauditedCells: number;
};

export type MatrixTierMetrics = MatrixTierBucket & {
  /** Cells at Built tier or higher (built-only + live) — queue / legacy */
  builtCells: number;
  /** @deprecated alias — audited-only + probe-only (below built) */
  auditedCells: number;
  buildQueue: number;
  requiredPct: number;
  auditedOnlyPct: number;
  probeOnlyPct: number;
  builtOnlyPct: number;
  livePct: number;
  certifiedPct: number;
  /** @deprecated alias for livePct */
  modulePct: number;
};

export type MatrixGroupRollup = MatrixTierMetrics & {
  group: string;
  label: string;
};

export function emptyTierBucket(): MatrixTierBucket {
  return {
    requiredCells: 0,
    liveCells: 0,
    builtOnlyCells: 0,
    probeOnlyCells: 0,
    auditedOnlyCells: 0,
    unauditedCells: 0,
  };
}

export function matrixPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/** Mutually exclusive tier — highest wins. Probe never counts as Built. */
export function classifyMatrixCellTier(input: {
  required: boolean;
  live: boolean;
  built: boolean;
  probeReason?: string;
  audited: boolean;
}): MatrixCellTier {
  if (!input.required) return "na";
  if (input.live) return "live";
  if (input.built) return "built";
  if (input.probeReason) return "probe";
  if (input.audited) return "audited";
  return "unaudited";
}

/** T-03: empty Box 3 vs empty Box 4 — work queue, not a scoreboard. */
export type MatrixEmptyWhy = "not_built" | "built_unproven";
export type MatrixQueueKind = "fix" | "errand";

export function cellEmptyWhy(input: {
  required: boolean;
  built: boolean;
  live: boolean;
}): MatrixEmptyWhy | undefined {
  if (!input.required) return undefined;
  if (input.live) return undefined;
  if (input.built) return "built_unproven";
  return "not_built";
}

export function cellQueueKind(why: MatrixEmptyWhy | undefined): MatrixQueueKind | undefined {
  if (why === "not_built") return "fix";
  if (why === "built_unproven") return "errand";
  return undefined;
}

export function accumulateTierBucket(bucket: MatrixTierBucket, tier: MatrixCellTier): void {
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

export function finalizeTierMetrics(bucket: MatrixTierBucket): MatrixTierMetrics {
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

export function assertTierTallyConsistent(bucket: MatrixTierBucket, label = "matrix"): void {
  const sum =
    bucket.liveCells +
    bucket.builtOnlyCells +
    bucket.probeOnlyCells +
    bucket.auditedOnlyCells +
    bucket.unauditedCells;
  if (sum !== bucket.requiredCells) {
    throw new Error(
      `${label} tier tally mismatch: live+built+probe+audited+unaudited=${sum} !== required=${bucket.requiredCells}`,
    );
  }
}

const GROUP_LABELS: Record<string, string> = {
  linkage: "Linkage",
  money: "Money / GL",
  chrome: "Picker + QBO chrome",
  wiring: "Connectivity + reverse",
  process: "Process / scenario probe",
  economics: "ECON C25–C31",
  verifier: "PROOF V1–V6",
  other: "Other",
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

export function mergeTierBuckets(into: MatrixTierBucket, from: MatrixTierBucket): void {
  into.requiredCells += from.requiredCells;
  into.liveCells += from.liveCells;
  into.builtOnlyCells += from.builtOnlyCells;
  into.probeOnlyCells += from.probeOnlyCells;
  into.auditedOnlyCells += from.auditedOnlyCells;
  into.unauditedCells += from.unauditedCells;
}

export function sortGroupRollups(rollups: MatrixGroupRollup[]): MatrixGroupRollup[] {
  const order = ["linkage", "money", "chrome", "wiring", "process", "economics", "verifier", "other"];
  return [...rollups].sort((a, b) => {
    const ai = order.indexOf(a.group);
    const bi = order.indexOf(b.group);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/** Fully-Wired 1–12 as extra All-modules columns (same 4-box). 1–11 Built on mapped cols; 4th box = Clicked on those cols; 12 = Clicked on every Required cell. */
export type FullyWiredItemSpec = {
  id: string;
  label: string;
  /** Match Required-map column ids (OR groups). Empty + allRequired = every owed cell. */
  cols?: readonly string[];
  groups?: readonly string[];
  allRequired?: boolean;
  /** Item 12 — Clicked Live; never credit Box 4 keyword fan-out. */
  closedAllowlist?: boolean;
  /** process group excluding scenario.* probes */
  processNonScenario?: boolean;
};

export const FULLY_WIRED_MATRIX_ITEMS: readonly FullyWiredItemSpec[] = [
  { id: "fw1_place", label: "1 Place", cols: ["connectivity"] },
  { id: "fw2_canonical", label: "2 Canonical", cols: ["connectivity", "picker_law"] },
  { id: "fw3_money", label: "3 Money", groups: ["money"] },
  {
    id: "fw4_fwd",
    label: "4 Fwd",
    cols: [
      "driver",
      "customer",
      "vendor",
      "unit",
      "trailer",
      "load",
      "claim",
      "work_order",
      "accident",
      "policy",
      "settlement",
      "legal_matter",
      "invoice",
      "bank",
    ],
  },
  { id: "fw5_rev", label: "5 Rev", cols: ["reverse_link"] },
  { id: "fw6_matrix", label: "6 Matrix", allRequired: true },
  { id: "fw7_surface", label: "7 Surface", cols: ["qbo_chrome", "picker_law"] },
  { id: "fw8_chrome", label: "8 Chrome", cols: ["qbo_chrome"] },
  { id: "fw9_pickers", label: "9 Pickers", cols: ["picker_law"] },
  { id: "fw10_rls", label: "10 RLS", processNonScenario: true },
  { id: "fw11_guard", label: "11 Guard", allRequired: true },
  { id: "fw12_live", label: "12 Clicked", closedAllowlist: true, allRequired: true },
];

export function fullyWiredColumnMatches(
  spec: FullyWiredItemSpec,
  colId: string,
  group: string,
): boolean {
  if (spec.closedAllowlist || spec.allRequired) return true;
  if (spec.processNonScenario) {
    return group === "process" && !colId.startsWith("scenario.");
  }
  if (spec.groups?.includes(group)) return true;
  if (spec.cols?.includes(colId)) return true;
  return false;
}
