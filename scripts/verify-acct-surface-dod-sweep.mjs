#!/usr/bin/env node
/**
 * ACCT-SURF-DOD-SWEEP — structural per-surface DoD matrix guard.
 *
 * Machine matrix: docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json
 * Manifest binding: docs/module-completion/accounting.json (ACCT-SURF-01…09)
 *
 * Asserts:
 *  - Every enumerated surface has a full TRANSP+USMCA × (DOD-A…E + VERIFY-1…8) cell row
 *  - Each surface binds to an ACCT-SURF-* item present in accounting.json
 *  - Matrix module_progress.M equals accounting.json items.length (M not frozen below live leaves)
 *  - No cell claims browser/live PASS (only UNVERIFIED or STRUCTURAL allowed in this sweep PR)
 *
 * Does NOT flip scoreboard statuses — browser click-through remains UNVERIFIED per Rule 23.
 *
 *   node scripts/verify-acct-surface-dod-sweep.mjs
 *   node scripts/verify-acct-surface-dod-sweep.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surface-dod-sweep";
const MATRIX_REL = "docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json";
const MANIFEST_REL = "docs/module-completion/accounting.json";

const ALLOWED_CELL_STATUSES = new Set(["UNVERIFIED", "STRUCTURAL"]);
const FORBIDDEN_CELL_STATUSES = new Set(["PASS", "FAIL"]);

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function contractErrors(matrix, manifest) {
  const errors = [];

  if (!matrix.enumerated_surfaces?.length) {
    errors.push("matrix missing enumerated_surfaces[]");
    return errors;
  }
  if (matrix.enumerated_surfaces.length < 14) {
    errors.push(`enumerated_surfaces must be 14+ (got ${matrix.enumerated_surfaces.length})`);
  }

  const layers = matrix.layers ?? [];
  const entities = matrix.entities ?? [];
  if (layers.length !== 13) {
    errors.push(`layers must be DOD-A…E + VERIFY-1…8 (13 total, got ${layers.length})`);
  }
  if (!entities.includes("TRANSP") || !entities.includes("USMCA")) {
    errors.push("entities must include TRANSP and USMCA");
  }

  const manifestItems = Array.isArray(manifest.items) ? manifest.items : [];
  const M = manifestItems.length;
  const surfItems = manifestItems.filter((it) => /^ACCT-SURF-\d+$/.test(it.id));
  const surfIds = new Set(surfItems.map((it) => it.id));

  if (matrix.module_progress?.M !== M) {
    errors.push(`matrix module_progress.M=${matrix.module_progress?.M} != accounting.json items.length=${M}`);
  }

  const surfaceById = new Map((matrix.surfaces ?? []).map((s) => [s.id, s]));
  for (const id of matrix.enumerated_surfaces) {
    if (!surfaceById.has(id)) {
      errors.push(`enumerated surface "${id}" missing from surfaces[]`);
    }
  }
  for (const s of matrix.surfaces ?? []) {
    if (!matrix.enumerated_surfaces.includes(s.id)) {
      errors.push(`surfaces[] entry "${s.id}" not listed in enumerated_surfaces`);
    }
    if (!s.manifest_item || !surfIds.has(s.manifest_item)) {
      errors.push(`${s.id}: manifest_item ${s.manifest_item ?? "?"} must be ACCT-SURF-* in accounting.json`);
    }
    if (!s.route) {
      errors.push(`${s.id}: missing route`);
    }
    for (const entity of entities) {
      const row = s.cells?.[entity];
      if (!row) {
        errors.push(`${s.id}: missing cells.${entity}`);
        continue;
      }
      for (const layer of layers) {
        const cell = row[layer];
        if (!cell?.status) {
          errors.push(`${s.id}.${entity}.${layer}: missing cell status`);
          continue;
        }
        if (FORBIDDEN_CELL_STATUSES.has(cell.status)) {
          errors.push(`${s.id}.${entity}.${layer}: forbidden cell status ${cell.status} (structural matrix only)`);
        }
        if (!ALLOWED_CELL_STATUSES.has(cell.status)) {
          errors.push(`${s.id}.${entity}.${layer}: invalid cell status ${cell.status}`);
        }
        if (cell.status === "STRUCTURAL" && !cell.evidence) {
          errors.push(`${s.id}.${entity}.${layer}: STRUCTURAL cell requires evidence`);
        }
        if (cell.status === "UNVERIFIED" && !cell.blocker) {
          errors.push(`${s.id}.${entity}.${layer}: UNVERIFIED cell requires blocker`);
        }
      }
    }
  }

  const boundSurf = new Set((matrix.surfaces ?? []).map((s) => s.manifest_item));
  for (const id of surfIds) {
    if (!boundSurf.has(id)) {
      errors.push(`accounting.json ${id} has no surface row in sweep matrix`);
    }
  }

  return errors;
}

function selftest() {
  const matrix = loadJson(MATRIX_REL);
  const manifest = loadJson(MANIFEST_REL);
  if (contractErrors(matrix, manifest).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(matrix, manifest).slice(0, 8));
    process.exit(1);
  }

  const missingSurface = {
    ...matrix,
    surfaces: matrix.surfaces.filter((s) => s.id !== "bill"),
  };
  if (!contractErrors(missingSurface, manifest).some((e) => e.includes('"bill"'))) {
    console.error(`${LABEL} --selftest FAIL did not catch missing bill surface`);
    process.exit(1);
  }

  const frozenM = {
    ...matrix,
    module_progress: { ...matrix.module_progress, M: matrix.module_progress.M - 1 },
  };
  if (!contractErrors(frozenM, manifest).some((e) => e.includes("module_progress.M"))) {
    console.error(`${LABEL} --selftest FAIL did not catch frozen M`);
    process.exit(1);
  }

  const passCell = JSON.parse(JSON.stringify(matrix));
  passCell.surfaces[0].cells.TRANSP["DOD-A"] = { status: "PASS", evidence: "fake" };
  if (!contractErrors(passCell, manifest).some((e) => e.includes("forbidden cell status PASS"))) {
    console.error(`${LABEL} --selftest FAIL did not catch PASS cell`);
    process.exit(1);
  }

  const unboundSurf = JSON.parse(JSON.stringify(matrix));
  unboundSurf.surfaces = unboundSurf.surfaces.filter((s) => s.manifest_item !== "ACCT-SURF-06");
  if (!contractErrors(unboundSurf, manifest).some((e) => e.includes("ACCT-SURF-06"))) {
    console.error(`${LABEL} --selftest FAIL did not catch unbound ACCT-SURF-06`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const matrix = loadJson(MATRIX_REL);
const manifest = loadJson(MANIFEST_REL);
const errors = contractErrors(matrix, manifest);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `${LABEL}: PASS — ${matrix.enumerated_surfaces.length} surfaces × ${matrix.entities.length} entities × ${matrix.layers.length} layers bound to accounting.json M=${manifest.items.length}; no browser PASS cells`
);
process.exit(0);
