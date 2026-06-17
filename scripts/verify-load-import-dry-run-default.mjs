#!/usr/bin/env node
// Guard: the AW load import is DRY-RUN by default and cannot write prod data without an explicit
// --commit flag AND credentials. Mirrors the existing create path (POST /api/v1/dispatch/loads),
// never a parallel INSERT. Also locks the two honored gaps (13378 zero-rate, 77225 blank AW id)
// and per-entity TRANSP scope.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-load-import-dry-run-default: ${m}`);
  process.exit(1);
};

const script = read("scripts/aw-load-import/import-aw-loads.mjs");

// 1. Dry-run is the default; commit is opt-in.
if (!/const COMMIT = args\.has\("--commit"\)/.test(script)) fail("--commit must be an explicit opt-in flag");
if (!/if \(!COMMIT\)[\s\S]{0,200}process\.exit\(0\)/.test(script)) fail("default path must exit cleanly WITHOUT writing");
if (!script.includes("DRY RUN complete. Nothing written")) fail("default path must declare it wrote nothing");

// 2. Commit requires BOTH creds, else refuses.
if (!/if \(!baseUrl \|\| !token\)[\s\S]{0,160}process\.exit\(2\)/.test(script)) fail("commit must refuse without IMPORT_BASE_URL + IMPORT_SESSION_TOKEN");

// 3. Mirrors the existing create path; no parallel INSERT.
if (!script.includes("/api/v1/dispatch/loads")) fail("must target the existing POST /api/v1/dispatch/loads create path");
// Real SQL insert = uppercase INTO + table + opening paren (prose mentioning "insert" won't match).
if (/INSERT\s+INTO\s+mdata\.\w+\s*\(/.test(script)) fail("must NOT open a parallel INSERT into mdata.* — use bookLoad");

// 4. Dataset integrity: 11 loads, TRANSP, honored gaps.
const ds = JSON.parse(read("scripts/aw-load-import/aw-open-loads-2026-06-17.json"));
if (ds.operating_company_id !== "91e0bf0a-133f-4ce8-a734-2586cfa66d96") fail("dataset must be scoped to TRANSP");
if (!Array.isArray(ds.loads) || ds.loads.length !== 11) fail(`expected 11 loads, found ${ds.loads?.length}`);
const zero = ds.loads.filter((l) => l.rate_cents === 0);
if (zero.length !== 1 || zero[0].aw_load_number !== "13378") fail("13378 must be the single zero-rate load (no invented number)");
if (!zero[0].flags.includes("no_rate_in_aw")) fail("13378 must carry the no_rate_in_aw flag");
const pending = ds.loads.filter((l) => !l.aw_load_number);
if (pending.length !== 1 || pending[0].wo_number !== "77225") fail("77225 must be the single blank-AW-id load, keyed on WO");
if (!pending[0].flags.includes("confirm_aw_load_id_before_commit")) fail("77225 must be flagged to confirm AW id before commit");

console.log("PASS verify-load-import-dry-run-default");
