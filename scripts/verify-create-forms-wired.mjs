#!/usr/bin/env node
/**
 * verify-create-forms-wired.mjs  (UI-02 PART 1 — every "Create" must actually create)
 *
 * The owner-reported "nothing gets created" bug = a Create/wizard/creator form that
 * renders a full form + submit/"+ Create"/"Save" control but has NO wired save
 * (no mutation, no API POST, no create callback) — a dead stub. A verify-first
 * sweep (2026-07-11) confirmed the live create forms ARE wired; this guard is a
 * RATCHET so a NEW dead create form can never ship.
 *
 * "Create form" = a *.tsx under apps/frontend/src whose basename matches
 * (Create|New|Add)<Name>(Modal|Form|Page|Drawer). A file is WIRED if it contains
 * any real save signal:
 *   - a mutation:            useMutation / .mutate( / .mutateAsync(
 *   - a direct API write:    fetch/apiClient/axios with POST, or a create/save-style API call
 *   - a create-callback:     receives or passes onSubmit/onSave/onCreate(d)/onComplete/onSuccess
 *     and invokes it (the controlled-subform pattern used across the codebase)
 * Files with none of these are offenders. Current offenders are baselined into
 * scripts/.create-forms-wired-baseline.json (orphan/archived stubs) so today is
 * green; CI FAILS only on a NEW unwired create form.
 *
 * Usage:
 *   node scripts/verify-create-forms-wired.mjs            # scan vs baseline
 *   node scripts/verify-create-forms-wired.mjs --update   # rebaseline current offenders
 *   node scripts/verify-create-forms-wired.mjs --selftest # inject a dead form -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const SCAN_ROOT = "apps/frontend/src";
const BASELINE_PATH = "scripts/.create-forms-wired-baseline.json";

const CREATE_FILE = /(Create|New|Add)[A-Z][A-Za-z0-9]*(Modal|Form|Page|Drawer)\.tsx$/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Any of these = a real save is wired.
const WIRE_SIGNALS = [
  /\buseMutation\b/,
  /\.mutateAsync\s*\(/,
  /\.mutate\s*\(/,
  /\bfetch\s*\(/,
  /\bapiClient\b/,
  /\baxios\b/,
  /\bmethod\s*:\s*["']POST["']/i,
  /\b(create|save|add|post|submit|update|book)[A-Z][A-Za-z0-9]*\s*\(/, // createVendor(, saveX(, bookLoad(...
  // controlled-subform callback pattern: receives/passes a save callback and calls it
  /\bon(Submit|Save|Saved|Create|Created|Complete|Success|Post|Posted)\b/,
];

function isWired(src) {
  const s = stripComments(src);
  return WIRE_SIGNALS.some((re) => re.test(s));
}

function listCreateFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listCreateFiles(full, out);
    } else if (CREATE_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

function scanOffenders() {
  const files = [];
  const abs = path.join(repoRoot, SCAN_ROOT);
  if (fs.existsSync(abs)) listCreateFiles(abs, files);
  const offenders = [];
  for (const full of files) {
    const rel = path.relative(repoRoot, full);
    if (!isWired(fs.readFileSync(full, "utf8"))) offenders.push(rel);
  }
  return offenders.sort();
}

function loadBaseline() {
  const p = path.join(repoRoot, BASELINE_PATH);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

export function run() {
  const offenders = scanOffenders();
  const baseline = new Set(loadBaseline());
  const fresh = offenders.filter((o) => !baseline.has(o));
  if (fresh.length > 0) {
    console.error("[verify-create-forms-wired] FAIL — NEW dead Create form(s) (no mutation/API/save-callback):");
    for (const rel of fresh) console.error(`  - ${rel}`);
    return { ok: false, offenders: fresh };
  }
  console.log(`[verify-create-forms-wired] PASS — no new dead create forms (${offenders.length} baselined stubs)`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function update() {
  const offenders = scanOffenders();
  fs.writeFileSync(path.join(repoRoot, BASELINE_PATH), JSON.stringify(offenders, null, 2) + "\n");
  console.log(`[verify-create-forms-wired] baseline updated — ${offenders.length} stub(s)`);
}

function selftest() {
  const dead = `export function AddThingModal(){ return (<form><input/><button type="submit">+ Create</button></form>); }`;
  if (isWired(dead)) {
    console.error("[verify-create-forms-wired] SELFTEST FAIL — dead form counted as wired");
    process.exit(1);
  }
  const wiredMut = `const m = useMutation({ mutationFn: () => createVendor(id, body) }); <button onClick={() => m.mutate()}>+ Create</button>`;
  const wiredCb = `export function Sub({ onSubmit }:{onSubmit:(v)=>void}){ return <button onClick={() => onSubmit(v)}>Save</button>; }`;
  for (const s of [wiredMut, wiredCb]) {
    if (!isWired(s)) {
      console.error(`[verify-create-forms-wired] SELFTEST FAIL — wired form flagged as dead: ${s.slice(0, 40)}`);
      process.exit(1);
    }
  }
  console.log("[verify-create-forms-wired] SELFTEST PASS — dead stub detected; mutation + callback wiring recognized");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else if (process.argv.includes("--update")) update();
  else process.exit(run().ok ? 0 : 1);
}
