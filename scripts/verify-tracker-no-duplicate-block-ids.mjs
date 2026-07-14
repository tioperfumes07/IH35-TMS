#!/usr/bin/env node
/**
 * TRACKER guard — the program tracker must count UNIQUE registered blocks, never raw files.
 *
 * The Program Tracker (apps/backend/src/program/program-tracker.service.ts) counts the LIVE
 * `.block-ready/*.json` registry for its headline "Registered" total, and scripts/reconcile-block-status.mjs
 * rolls the same registry into the built-vs-pending report. If two ACTIVE registry files carry the SAME
 * `block_id`, every total silently over-counts (the owner can't trust the number). This guard locks the
 * dedup invariant so it can't regress:
 *
 *   FAIL if two NON-retired `.block-ready/*.json` files share the same `block_id`.
 *
 * A file is RETIRED (exempt — it is allowed to share a block_id with its canonical twin) when it is marked
 * DUP / DUPLICATE / STALE / LIKELY-STALE / SUPERSEDED, by EITHER:
 *   • its filename suffix  (e.g. `..._SUPERSEDED.json`, `..._DUP.json`), OR
 *   • a `status` field of superseded/duplicate/dup/stale, OR
 *   • an explicit `superseded_by` / `duplicate_of` field.
 * Retirement is ADDITIVE (§7) — duplicates are ARCHIVED (status:"superseded"), never deleted. The tracker +
 * reconciler exclude retired files from every count, so the header equals unique registered blocks.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tracker-no-duplicate-block-ids";
const DIR = ".block-ready";

const RETIRE_FILENAME = /[_-](DUP|DUPLICATE|STALE|LIKELY-STALE|SUPERSEDED)$/i;
const RETIRE_STATUS = /^(superseded|duplicate|dup|stale)$/i;

/** A registry file is RETIRED (exempt from the unique-block_id invariant) when its filename suffix OR a
 *  status/superseded_by/duplicate_of field marks it DUP/STALE/SUPERSEDED. Mirrors the exclusion the tracker
 *  service + reconciler apply, so guard, header, and report can never disagree. */
export function isRetired(name, json) {
  const base = String(name).replace(/\.json$/i, "");
  if (RETIRE_FILENAME.test(base)) return true;
  const j = json ?? {};
  if (typeof j.status === "string" && RETIRE_STATUS.test(j.status.trim())) return true;
  if (j.superseded_by != null || j.duplicate_of != null) return true;
  return false;
}

/** The block_id a registry file registers under (upper-cased), falling back to the filename when absent. */
export function blockIdOf(name, json) {
  const j = json ?? {};
  const raw = j.block_id ?? j.block ?? String(name).replace(/\.json$/i, "");
  return String(raw).trim().toUpperCase();
}

/** files: [{ name, json }]. Returns an array of human-readable errors (empty = pass). */
export function assertGuard({ files }) {
  const errors = [];
  const activeByBlockId = new Map(); // block_id -> [filenames]
  for (const { name, json } of files) {
    if (isRetired(name, json)) continue; // retired duplicates are allowed to share
    const id = blockIdOf(name, json);
    if (!activeByBlockId.has(id)) activeByBlockId.set(id, []);
    activeByBlockId.get(id).push(name);
  }
  for (const [id, names] of activeByBlockId) {
    if (names.length > 1) {
      errors.push(
        `duplicate block_id "${id}" shared by ${names.length} ACTIVE files: ${names.sort().join(", ")} — ` +
          `retire all but one (add "status":"superseded" + "superseded_by") so the tracker counts it once`
      );
    }
  }
  return errors;
}

function readRegistryFiles() {
  const dir = path.join(ROOT, DIR);
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      json = {}; // unparseable file falls back to filename-derived block_id (still checked)
    }
    out.push({ name, json });
  }
  return out;
}

function selftest() {
  const cases = [
    {
      n: "all unique → 0",
      files: [
        { name: "GAP-10.json", json: { block_id: "GAP-10" } },
        { name: "GAP-11.json", json: { block_id: "GAP-11" } },
      ],
      want: 0,
    },
    {
      n: "two active files share block_id → fail",
      files: [
        { name: "GAP-37.json", json: { block_id: "GAP-37" } },
        { name: "FEATURE-GAP-37-EQUIPMENT-TRANSFER.json", json: { block_id: "GAP-37" } },
      ],
      min: 1,
    },
    {
      n: "duplicate retired via status field → 0",
      files: [
        { name: "GAP-37.json", json: { block_id: "GAP-37", status: "superseded", superseded_by: "FEATURE-GAP-37.json" } },
        { name: "FEATURE-GAP-37-EQUIPMENT-TRANSFER.json", json: { block_id: "GAP-37" } },
      ],
      want: 0,
    },
    {
      n: "duplicate retired via filename suffix → 0",
      files: [
        { name: "0010-f5-bank-txn-uncategorized_DUP.json", json: { block_id: "0010-F5-BANK-TXN-UNCATEGORIZED" } },
        { name: "0010-f5-bank-txn-uncategorized.json", json: { block_id: "0010-F5-BANK-TXN-UNCATEGORIZED" } },
      ],
      want: 0,
    },
    {
      n: "case-insensitive block_id collision → fail",
      files: [
        { name: "a.json", json: { block_id: "gap-99" } },
        { name: "b.json", json: { block_id: "GAP-99" } },
      ],
      min: 1,
    },
    {
      n: "block_id absent → derived from filename, unique → 0",
      files: [
        { name: "X-ONE.json", json: {} },
        { name: "X-TWO.json", json: {} },
      ],
      want: 0,
    },
    {
      n: "BOTH duplicates retired (fully archived) → 0",
      files: [
        { name: "old_STALE.json", json: { block_id: "OLD" } },
        { name: "old_SUPERSEDED.json", json: { block_id: "OLD" } },
      ],
      want: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ files: c.files }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const files = readRegistryFiles();
const errors = assertGuard({ files });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} duplicate block_id(s) among active .block-ready files:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
const active = files.filter((f) => !isRetired(f.name, f.json)).length;
console.log(
  `[${LABEL}] OK — ${files.length} .block-ready files, ${active} active, ` +
    `${files.length - active} retired (dup/stale/superseded); every active block_id is unique.`
);
