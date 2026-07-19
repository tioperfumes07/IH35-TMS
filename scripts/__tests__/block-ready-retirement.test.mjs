/**
 * Behavioral tests for .block-ready retirement detection.
 * Proves the five confirmed live hyphen-defect IDs remain active, and that
 * true _DUP / _SUPERSEDED / explicit status retirement still excludes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRMED_LIVE_HYPHEN_DEFECT_IDS,
  isRetiredBlockFile,
} from "../lib/block-ready-retirement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BR_DIR = path.join(ROOT, ".block-ready");

describe("block-ready retirement — live hyphen defect IDs", () => {
  test("exactly five confirmed live IDs are catalogued", () => {
    assert.equal(CONFIRMED_LIVE_HYPHEN_DEFECT_IDS.length, 5);
  });

  for (const id of CONFIRMED_LIVE_HYPHEN_DEFECT_IDS) {
    test(`${id} is never retired by filename alone (fixture status PARTIAL)`, () => {
      assert.equal(isRetiredBlockFile(`${id}.json`, { status: "PARTIAL" }), false);
      assert.equal(isRetiredBlockFile(id, { status: "PENDING" }), false);
    });

    test(`${id} remains active when reading the live .block-ready manifest`, () => {
      const file = `${id}.json`;
      const full = path.join(BR_DIR, file);
      assert.ok(fs.existsSync(full), `missing registry file ${file}`);
      const json = JSON.parse(fs.readFileSync(full, "utf8"));
      assert.equal(isRetiredBlockFile(file, json), false, `${id} must stay live`);
      assert.notEqual(String(json.status ?? "").toLowerCase(), "superseded");
      assert.equal(json.superseded_by, undefined);
      assert.equal(json.duplicate_of, undefined);
    });
  }
});

describe("block-ready retirement — explicit markers still exclude", () => {
  test("_DUP / _SUPERSEDED / _STALE / _LIKELY-STALE / _DUPLICATE filename markers retire", () => {
    for (const name of [
      "example_DUP.json",
      "example_DUPLICATE.json",
      "example_STALE.json",
      "example_LIKELY-STALE.json",
      "example_SUPERSEDED.json",
    ]) {
      assert.equal(isRetiredBlockFile(name, { status: "BUILD" }), true, name);
    }
  });

  test("hyphen descriptive -stale / -duplicate tails do NOT retire", () => {
    assert.equal(isRetiredBlockFile("defect-about-mirror-stale.json", { status: "PARTIAL" }), false);
    assert.equal(isRetiredBlockFile("defect-about-row-duplicate.json", { status: "PENDING" }), false);
  });

  test("explicit status retirement still works", () => {
    for (const status of ["superseded", "duplicate", "dup", "stale", "SUPERSEDED"]) {
      assert.equal(isRetiredBlockFile("live-looking-id.json", { status }), true, status);
    }
  });

  test("explicit superseded_by / duplicate_of still retire", () => {
    assert.equal(isRetiredBlockFile("x.json", { superseded_by: "canonical-id" }), true);
    assert.equal(isRetiredBlockFile("x.json", { duplicate_of: "canonical-id" }), true);
  });

  test("real underscore-retired registry files on disk are excluded", () => {
    const samples = [
      "0008-g4-vendor-namespace-canonical_DUP.json",
      "0008-a-gl-flags-settlement-lease-off_SUPERSEDED.json",
      "0010-f11-jep-duplicate-idempotency-gro_STALE.json",
    ];
    for (const file of samples) {
      const full = path.join(BR_DIR, file);
      assert.ok(fs.existsSync(full), file);
      const json = JSON.parse(fs.readFileSync(full, "utf8"));
      assert.equal(isRetiredBlockFile(file, json), true, file);
    }
  });
});

describe("block-ready retirement — reconcile active set includes the five live IDs", () => {
  test("filtering .block-ready with isRetiredBlockFile keeps all five live IDs", () => {
    const activeIds = new Set();
    for (const file of fs.readdirSync(BR_DIR)) {
      if (!file.endsWith(".json")) continue;
      let json;
      try {
        json = JSON.parse(fs.readFileSync(path.join(BR_DIR, file), "utf8"));
      } catch {
        continue;
      }
      if (isRetiredBlockFile(file, json)) continue;
      const id = json.block_id || file.replace(/\.json$/i, "");
      activeIds.add(String(id));
    }
    for (const id of CONFIRMED_LIVE_HYPHEN_DEFECT_IDS) {
      assert.ok(activeIds.has(id), `active set missing live id ${id}`);
    }
  });
});
