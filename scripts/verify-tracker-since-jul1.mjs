#!/usr/bin/env node
/**
 * GUARD (FIX B): the "Since Jul 1" tracker view must derive each block's creation date from GIT (the first
 * commit that added its .block-ready file), generated in CI + served from R2 with a committed fallback —
 * NEVER an invented created_at. Locks the wiring so it can't silently drop back to guessing.
 *
 *  - gen-block-created-dates.mjs exists and derives dates via `git log --diff-filter=A`.
 *  - program-board-sync.yml runs the generator + uploads it (tracker:sync:r2 handles created-dates).
 *  - the service computes since_jul1 from created_at and reads created-dates from R2 (committed fallback).
 *
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const GEN = path.join(root, "scripts/gen-block-created-dates.mjs");
const SVC = path.join(root, "apps/backend/src/program/program-tracker.service.ts");
const WF = path.join(root, ".github/workflows/program-board-sync.yml");
const UPLOAD = path.join(root, "scripts/sync-tracker-r2.mjs");

function assertAll({ gen, svc, wf, upload }) {
  const errors = [];
  if (!/--diff-filter=A/.test(gen)) errors.push("gen-block-created-dates.mjs: must derive add-date via git --diff-filter=A (never invent created_at)");
  if (!/since_jul1/.test(svc)) errors.push("service: no since_jul1 rollup");
  if (!/created_at:/.test(svc)) errors.push("service: rows do not carry created_at");
  if (!/getObjectTextIfExists\([^)]*block-created-dates|R2_CREATED_DATES_KEY/.test(svc)) errors.push("service: created-dates not read from R2 (with committed fallback)");
  if (!/gen-block-created-dates\.mjs/.test(wf)) errors.push("workflow: does not regenerate created-dates in CI");
  if (!/block-created-dates\.json/.test(upload)) errors.push("sync-tracker-r2.mjs: does not upload created-dates to R2");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    gen: 'execFileSync("git",["log","--diff-filter=A","--follow"])',
    svc: 'created_at: createdDates[b.id] ?? null,\nconst R2_CREATED_DATES_KEY="program-tracker/block-created-dates.json";\nsince_jul1: (()=>{})()',
    wf: "node scripts/gen-block-created-dates.mjs",
    upload: 'Key:"program-tracker/block-created-dates.json"',
  };
  const bad = { gen: "new Date()", svc: "no rollup here", wf: "reconcile only", upload: "single upload" };
  if (assertAll(good).length !== 0) { console.error("SELFTEST FAIL: good flagged", assertAll(good)); process.exit(1); }
  if (assertAll(bad).length < 5) { console.error("SELFTEST FAIL: bad not caught", assertAll(bad)); process.exit(1); }
  console.log("verify-tracker-since-jul1 selftest OK");
  process.exit(0);
}

for (const p of [GEN, SVC, WF, UPLOAD]) if (!fs.existsSync(p)) { console.error(`GUARD FAIL: missing ${p}`); process.exit(1); }
const errors = assertAll({ gen: fs.readFileSync(GEN, "utf8"), svc: fs.readFileSync(SVC, "utf8"), wf: fs.readFileSync(WF, "utf8"), upload: fs.readFileSync(UPLOAD, "utf8") });
if (errors.length) { console.error("GUARD FAIL — Since-Jul-1 view wiring incomplete:"); for (const e of errors) console.error("  - " + e); process.exit(1); }
console.log("verify-tracker-since-jul1 OK — created dates git-derived, CI-generated, R2-served, since_jul1 computed");
