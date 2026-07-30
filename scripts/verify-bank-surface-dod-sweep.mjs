#!/usr/bin/env node
/**
 * BANK-MODULE-DOD — per-surface DoD A–E + VERIFY 1–8 sweep matrix guard.
 *
 * Asserts:
 *   1. Machine matrix JSON exists and enumerates every required Banking surface.
 *   2. Each surface × entity × layer has a result cell (PASS / FAIL / UNVERIFIED / HOLD).
 *   3. Every surface manifest_id exists in docs/module-completion/banking.json.
 *   4. banking.json items.length === matrix.manifest_m (M cannot be frozen below live leaves).
 *   5. banking.json references the sweep matrix (sweep_matrix field).
 *   6. No manifest item illegally flipped FAIL→PASS by comparing against frozen baseline statuses.
 *
 * --selftest: hide a surface / freeze M → must FAIL; complete matrix → PASS.
 *
 *   node scripts/verify-bank-surface-dod-sweep.mjs
 *   node scripts/verify-bank-surface-dod-sweep.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-surface-dod-sweep";

const MATRIX_REL = "docs/trackers/BANK-MODULE-DOD-SWEEP-MATRIX-2026-07-25.json";
const BANKING_JSON = "docs/module-completion/banking.json";

/** Frozen baseline — guard rejects any FAIL/HOLD/UNVERIFIED→PASS flip in banking.json */
const FROZEN_MANIFEST_STATUS = {
  "BANK-ECON-01": "PASS",
  "BANK-ECON-02": "PASS",
  "BANK-ECON-03": "PASS",
  "BANK-ECON-04": "HOLD",
  "BANK-ECON-05": "PASS",
  "BANK-SURF-01": "PASS",
  "BANK-SURF-02": "PASS",
  "BANK-SURF-03": "PASS",
  "BANK-SURF-04": "HOLD",
  "BANK-SURF-05": "PASS",
  "BANK-LINK-01": "PASS",
  "BANK-CTRL-01": "PASS",
  "BANK-GATE-01": "PASS",
};

const CELL_STATUSES = new Set(["PASS", "FAIL", "UNVERIFIED", "HOLD"]);

export function loadMatrix(root = ROOT) {
  const p = path.join(root, MATRIX_REL);
  if (!fs.existsSync(p)) throw new Error(`${MATRIX_REL} missing`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function loadBankingJson(root = ROOT) {
  const p = path.join(root, BANKING_JSON);
  if (!fs.existsSync(p)) throw new Error(`${BANKING_JSON} missing`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function contractErrors(matrix, banking, { skipFlipCheck = false } = {}) {
  const failures = [];

  if (matrix.block_id !== "BANK-MODULE-DOD") {
    failures.push("matrix.block_id must be BANK-MODULE-DOD");
  }

  const surfaces = Array.isArray(matrix.surfaces) ? matrix.surfaces : [];
  if (surfaces.length < 8) {
    failures.push(`matrix must enumerate ≥8 surfaces (have ${surfaces.length})`);
  }

  const entities = matrix.entities || [];
  const layers = matrix.layers || [];
  if (entities.length < 2 || !entities.includes("TRANSP") || !entities.includes("USMCA")) {
    failures.push("matrix.entities must include TRANSP and USMCA");
  }
  for (const l of ["DOD-A", "DOD-B", "DOD-C", "DOD-D", "DOD-E", "VERIFY-1", "VERIFY-8"]) {
    if (!layers.includes(l)) failures.push(`matrix.layers missing ${l}`);
  }

  const items = Array.isArray(banking.items) ? banking.items : [];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const manifestIds = new Set();

  for (const surf of surfaces) {
    if (!surf.id || !surf.manifest_ids?.length) {
      failures.push(`surface ${surf.id || "?"} must have manifest_ids[]`);
      continue;
    }
    for (const mid of surf.manifest_ids) {
      manifestIds.add(mid);
      if (!itemById.has(mid)) {
        failures.push(`surface ${surf.id}: manifest_id ${mid} missing from banking.json`);
      }
    }

    const cellBlock = matrix.cells?.[surf.id];
    if (!cellBlock) {
      failures.push(`matrix.cells missing block for surface ${surf.id}`);
      continue;
    }
    for (const entity of entities) {
      const row = cellBlock[entity];
      if (!row) {
        failures.push(`surface ${surf.id}: missing entity row ${entity}`);
        continue;
      }
      for (const layer of layers) {
        const cell = row[layer];
        if (!cell) {
          failures.push(`surface ${surf.id} × ${entity}: missing layer ${layer}`);
          continue;
        }
        if (!CELL_STATUSES.has(cell.status)) {
          failures.push(`surface ${surf.id} × ${entity} × ${layer}: illegal status ${cell.status}`);
        }
        if (!cell.evidence || typeof cell.evidence !== "string" || !cell.evidence.trim()) {
          failures.push(`surface ${surf.id} × ${entity} × ${layer}: evidence required`);
        }
      }
    }
  }

  const M = items.length;
  if (matrix.manifest_m !== M) {
    failures.push(`matrix.manifest_m (${matrix.manifest_m}) must equal banking.json items.length (${M})`);
  }

  if (!banking.sweep_matrix || !banking.sweep_matrix.includes("BANK-MODULE-DOD-SWEEP-MATRIX")) {
    failures.push("banking.json must set sweep_matrix to the DoD sweep matrix path");
  }

  // Every enumerated surface manifest id must be covered by at least one surface row
  for (const it of items) {
    if (it.id.startsWith("BANK-SURF-06") || manifestIds.has(it.id)) continue;
    // ECON/CTRL/GATE/LINK items may be cross-cutting — only SURF-06+ must appear if new leaf
    if (it.id === "BANK-SURF-06" && !manifestIds.has("BANK-SURF-06")) {
      failures.push("BANK-SURF-06 must be bound in matrix surfaces");
    }
  }
  if (!manifestIds.has("BANK-SURF-06")) {
    failures.push("Rules surface must bind BANK-SURF-06");
  }

  if (!skipFlipCheck) {
    for (const [id, frozen] of Object.entries(FROZEN_MANIFEST_STATUS)) {
      const it = itemById.get(id);
      if (!it) continue;
      if (frozen !== "PASS" && it.status === "PASS") {
        failures.push(`illegal FAIL/HOLD/UNVERIFIED→PASS flip on ${id} (was ${frozen}, now PASS)`);
      }
    }
  }

  return failures;
}

function selftest() {
  const matrix = loadMatrix();
  const banking = loadBankingJson();
  const good = contractErrors(matrix, banking);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good run:`, good.slice(0, 8));
    process.exit(1);
  }

  // Hide a surface
  const hideSurface = structuredClone(matrix);
  hideSurface.surfaces = hideSurface.surfaces.filter((s) => s.id !== "SURF-Rules");
  if (contractErrors(hideSurface, banking).length === 0) {
    console.error(`${LABEL} --selftest FAIL: hidden surface not flagged`);
    process.exit(1);
  }

  // Freeze M below live leaves
  const freezeM = structuredClone(matrix);
  freezeM.manifest_m = 10;
  if (contractErrors(freezeM, banking).length === 0) {
    console.error(`${LABEL} --selftest FAIL: frozen M not flagged`);
    process.exit(1);
  }

  // Illegal HOLD→PASS flip (use an item still frozen non-PASS)
  const flipBanking = structuredClone(banking);
  const econ04 = flipBanking.items.find((it) => it.id === "BANK-ECON-04");
  if (econ04) econ04.status = "PASS";
  if (contractErrors(matrix, flipBanking).length === 0) {
    console.error(`${LABEL} --selftest FAIL: HOLD→PASS flip not flagged`);
    process.exit(1);
  }

  // Missing cell
  const missCell = structuredClone(matrix);
  delete missCell.cells["SURF-Bank-feed"].TRANSP["DOD-A"];
  if (contractErrors(missCell, banking).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing cell not flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = contractErrors(loadMatrix(), loadBankingJson());
  if (failures.length) {
    console.error(`${LABEL} FAIL:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (BANK-MODULE-DOD matrix bound to banking.json)`);
}
