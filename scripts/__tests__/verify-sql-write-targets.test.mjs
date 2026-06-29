import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CODER-28A: the known-debt ratchet must be SHRINK-ONLY + self-cleaning — a stale allowlist entry
// (one whose phantom write no longer exists in the code) must FAIL the guard so it gets removed.
// These tests drive the real script via fixture overrides (model JSON + debt file + scan dir), so no
// DB is needed; the fixture model is treated as the authoritative LIVE model.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.resolve(root, "scripts/verify-sql-write-targets.mjs");

function runGuard({ model, debt, scanFiles }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-guard-"));
  const modelPath = path.join(dir, "model.json");
  const debtPath = path.join(dir, "debt.json");
  const scanDir = path.join(dir, "src");
  fs.mkdirSync(scanDir, { recursive: true });
  fs.writeFileSync(modelPath, JSON.stringify(model));
  fs.writeFileSync(debtPath, JSON.stringify({ debt }));
  for (const [name, contents] of Object.entries(scanFiles)) fs.writeFileSync(path.join(scanDir, name), contents);
  const run = spawnSync("node", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "",
      DATABASE_DIRECT_URL: "",
      WRITE_TARGETS_MODEL_JSON: modelPath,
      WRITE_TARGETS_DEBT_FILE: debtPath,
      WRITE_TARGETS_SCAN_DIR: scanDir,
    },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return run;
}

test("FAILS on a stale known-debt entry (code no longer makes the phantom write)", () => {
  const run = runGuard({
    model: { "qa.t": ["id", "realcol"] },
    debt: ['src/x.ts: INSERT INTO qa.t — column "gone" does not exist'], // no code writes "gone" anymore
    scanFiles: { "x.ts": "export const q = `INSERT INTO qa.t (id, realcol) VALUES ($1,$2)`;\n" },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /STALE known-debt/);
});

test("PASSES when the allowlist is empty and all writes are real", () => {
  const run = runGuard({
    model: { "qa.t": ["id", "realcol"] },
    debt: [],
    scanFiles: { "x.ts": "export const q = `INSERT INTO qa.t (id, realcol) VALUES ($1,$2)`;\n" },
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("FAILS on a NEW phantom write not in the allowlist", () => {
  const run = runGuard({
    model: { "qa.t": ["id", "realcol"] },
    debt: [],
    scanFiles: { "x.ts": "export const q = `INSERT INTO qa.t (id, nosuchcol) VALUES ($1,$2)`;\n" },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /NEW phantom/);
});
