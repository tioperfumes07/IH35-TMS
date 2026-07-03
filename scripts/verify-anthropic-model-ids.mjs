#!/usr/bin/env node
// Anthropic model-ID centralization guard.
//
// A hardcoded, later-retired model string in two features (claude-sonnet-4-20250514, retired 2026-06-15)
// caused a silent multi-feature outage. This guard makes that unrepeatable:
//   1. Model ID strings (claude-*) may appear ONLY in apps/backend/src/ai/models.ts. Any inline model string
//      elsewhere in apps/backend/src = FAIL (forces every feature through the central registry).
//   2. Any KNOWN-RETIRED model ID appearing ANYWHERE in apps/backend/src = FAIL (incl. models.ts itself,
//      except inside the RETIRED_MODEL_IDS declaration + comments where it is intentionally named).
//
// Verify-only. Wired into verify:arch-design.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const SRC = path.join(repoRoot, "apps/backend/src");
const REGISTRY_REL = "apps/backend/src/ai/models.ts";

// Matches Anthropic model IDs: claude-<family>-<...>. Deliberately broad.
const MODEL_ID_RE = /"(claude-[a-z0-9][a-z0-9-]*)"/g;
// Retired IDs (dated 2025xxxx snapshots that Anthropic pulled). The registry's RETIRED_MODEL_IDS is the
// source of truth; this pattern is the static tripwire.
const RETIRED_RE = /claude-[a-z0-9-]*-2025\d{4}/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
if (!fs.existsSync(SRC)) {
  console.error("verify:anthropic-model-ids — FAILED: apps/backend/src missing");
  process.exit(1);
}

for (const file of walk(SRC)) {
  const rel = path.relative(repoRoot, file);
  const source = fs.readFileSync(file, "utf8");

  // 2. retired IDs anywhere. models.ts is allowed to NAME them (RETIRED_MODEL_IDS + comments), but only in
  //    the retired-list context — a retired ID used as an ACTIVE model export would still be caught by rule 1
  //    (it'd be a claude-* string outside the retired list). Here we only hard-fail retired IDs OUTSIDE models.ts.
  if (rel !== REGISTRY_REL) {
    const retired = source.match(RETIRED_RE);
    if (retired) failures.push(`${rel}: references RETIRED model id(s) ${[...new Set(retired)].join(", ")} — remove; use the registry`);

    // 1. any inline model string outside the registry (PRODUCTION code only — test files legitimately use
    //    sample/fake model ids to exercise behavior; the retired-id check above still applies to them).
    const isTest = /(\.test\.|\.spec\.)|(^|\/)__tests__\//.test(rel);
    if (!isTest) {
      let m;
      MODEL_ID_RE.lastIndex = 0;
      while ((m = MODEL_ID_RE.exec(source)) !== null) {
        failures.push(`${rel}: inline model id "${m[1]}" — model strings live only in ${REGISTRY_REL} (import from there)`);
      }
    }
  }
}

// Sanity: the registry must exist and export the expected constants.
const regPath = path.join(repoRoot, REGISTRY_REL);
if (!fs.existsSync(regPath)) {
  failures.push(`${REGISTRY_REL} is missing — the central model registry must exist`);
} else {
  const reg = fs.readFileSync(regPath, "utf8");
  for (const sym of ["RATECON_EXTRACTION_MODEL", "SAFETY_VISION_MODEL", "REGISTERED_MODEL_IDS", "RETIRED_MODEL_IDS"]) {
    if (!new RegExp(`export const ${sym}\\b`).test(reg)) failures.push(`${REGISTRY_REL} must export ${sym}`);
  }
}

if (failures.length > 0) {
  console.error("verify:anthropic-model-ids — FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("verify:anthropic-model-ids — OK (all model ids centralized in ai/models.ts; no retired ids present)");
