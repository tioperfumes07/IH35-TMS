// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not hand-edit.
// Produced by scripts/gen-class-scoreboard.mjs from docs/audit/wave-queue.json.
// Source of truth = the wave queue. The board renders truth; it cannot manufacture it.
//
// A green (CC) cell is the QUEUE'S claim that a class is drained — it is NOT independent proof.
// `guardMissing` flags a class claiming drained whose named guard file does not exist; that is an
// existence check only and never asserts the guard passes.
// ─────────────────────────────────────────────────────────────────────────────

export type ClassCellCode = "CC" | "BB" | "NN" | "XX";
export type ClassCellTone = "green" | "amber" | "grey" | "red";
export interface ClassRow {
  id: string;
  lane: string;
  layer: string;
  status: string;
  code: ClassCellCode;
  tone: ClassCellTone;
  label: string;
  instances: number;
  modules: number;
  guard: string | null;
  guardMissing: boolean;
  guardNearMatch: string | null;
  liveDefect: boolean;
}
export interface ClassScoreboard {
  meta: { generatedAt: string; source: string };
  summary: { total: number; drained: number; building: number; notStarted: number; liveDefect: number; drainedWithoutGuard: number };
  rows: ClassRow[];
}

export const CLASS_SCOREBOARD: ClassScoreboard = {
  "meta": {
    "generatedAt": "2026-08-12T19:24:22.530Z",
    "source": "docs/audit/wave-queue.json"
  },
  "summary": {
    "total": 31,
    "drained": 27,
    "building": 0,
    "notStarted": 4,
    "liveDefect": 4,
    "drainedWithoutGuard": 1
  },
  "rows": [
    {
      "id": "CLS-BANK-MATCH-DENSITY",
      "lane": "money",
      "layer": "C",
      "status": "open",
      "code": "NN",
      "tone": "grey",
      "label": "not started",
      "instances": 5,
      "modules": 1,
      "guard": "scripts/verify-silent-success-posting-output.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": true
    },
    {
      "id": "CLS-CALENDAR",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 2,
      "guard": "scripts/verify-invoice-send-date-cast.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-CATEGORY-MAP-COHERENCE",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 3,
      "modules": 3,
      "guard": "scripts/verify-entity-expense-category-map-complete.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-01",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-01-book-invoice.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-02",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-02-driver-bill.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-03",
      "lane": "mechanical",
      "layer": "A",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-03-pod-capture.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-04",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 2,
      "guard": "scripts/verify-disp-wire-04-invoice-evidence-durable.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-05",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 2,
      "guard": "scripts/verify-disp-wire-05-revrec-latch.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-06",
      "lane": "money",
      "layer": "C",
      "status": "open",
      "code": "NN",
      "tone": "grey",
      "label": "not started",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-06-load-expense-link.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": true
    },
    {
      "id": "CLS-DISP-WIRE-07",
      "lane": "mechanical",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 3,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-07-departure-evidence.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-08",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 2,
      "guard": "scripts/verify-disp-wire-08-settlement-ping.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-09",
      "lane": "mechanical",
      "layer": "A",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-disp-wire-09-bol-generate.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISP-WIRE-10",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 2,
      "guard": "scripts/verify-disp-wire-10-cancel-economics.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DISPLAYID-UNSCOPED",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 5,
      "modules": 3,
      "guard": "scripts/verify-displayid-entity-scoped-lookups.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-DUAL-PATH",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 6,
      "modules": 1,
      "guard": "scripts/verify-qbo-canonical-recon.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-ECON-EMPTY",
      "lane": "money",
      "layer": "C",
      "status": "open",
      "code": "NN",
      "tone": "grey",
      "label": "not started",
      "instances": 16,
      "modules": 1,
      "guard": "scripts/verify-econ-empty-density.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": true
    },
    {
      "id": "CLS-FUEL-DOUBLE-POST",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 2,
      "guard": "scripts/verify-zero-count-completeness-discriminator.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-GL-DARK",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 4,
      "modules": 1,
      "guard": "scripts/verify-gl-posting-coverage.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-HOOKS-ORDER",
      "lane": "mechanical",
      "layer": "A",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-hooks-before-return.mjs",
      "guardMissing": false,
      "guardNearMatch": "scripts/verify-hooks-before-early-return.mjs",
      "liveDefect": false
    },
    {
      "id": "CLS-JOIN-ENTITY-UNSCOPED",
      "lane": "mechanical",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 3,
      "modules": 1,
      "guard": "scripts/verify-join-entity-scoped.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-LINKAGE-ONEWAY",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 9,
      "modules": 4,
      "guard": "scripts/verify-money-ops-fk-density.mjs",
      "guardMissing": true,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-MONEY-HOLD",
      "lane": "money",
      "layer": "C",
      "status": "open",
      "code": "NN",
      "tone": "grey",
      "label": "not started",
      "instances": 3,
      "modules": 3,
      "guard": "scripts/verify-money-hold-surfaces.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": true
    },
    {
      "id": "CLS-ORPHAN-SURFACE",
      "lane": "mechanical",
      "layer": "A",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 5,
      "modules": 3,
      "guard": "scripts/verify-orphan-surface-drill.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-RAW-UUID-INPUT",
      "lane": "mechanical",
      "layer": "D",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 1,
      "guard": "scripts/verify-picker-law-no-raw-uuid.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-REVERSE-LINKAGE-MISSING",
      "lane": "mechanical",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 7,
      "modules": 3,
      "guard": "scripts/verify-reverse-linkage-embedded.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-SCHEMA-DRIFT",
      "lane": "mechanical",
      "layer": "D",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 2,
      "guard": "scripts/verify-catalog-config-physical-columns.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-SILENT-CAP",
      "lane": "mechanical",
      "layer": "B",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 3,
      "modules": 3,
      "guard": "scripts/verify-no-silent-list-caps.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-SILENT-SUCCESS",
      "lane": "mechanical",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 1,
      "modules": 1,
      "guard": "scripts/verify-subledger-writes-post-to-gl.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-SUBLEDGER-GL-DARK",
      "lane": "money",
      "layer": "C",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 2,
      "modules": 1,
      "guard": "scripts/verify-subledger-writes-post-to-gl.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-UNIT-SCALE",
      "lane": "mechanical",
      "layer": "B",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 3,
      "modules": 2,
      "guard": "scripts/verify-cents-dollar-scale.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    },
    {
      "id": "CLS-UUID-LABEL",
      "lane": "mechanical",
      "layer": "D",
      "status": "drained",
      "code": "CC",
      "tone": "green",
      "label": "drained",
      "instances": 5,
      "modules": 3,
      "guard": "scripts/verify-no-uuid-label-rendering.mjs",
      "guardMissing": false,
      "guardNearMatch": null,
      "liveDefect": false
    }
  ]
};
