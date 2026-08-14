#!/usr/bin/env node
/**
 * HONEST-BUILT-LAUNCH-LAW — picker_law @matrix-built / feed claims must not paint
 * more than MATCH_CAP leaves in one shot (prefix-family theater).
 *
 * Run: node scripts/verify-picker-law-built-match-cap.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-picker-law-built-match-cap";
const MATCH_CAP = 40;
const MATRIX_BUILT_JSON_RE = /@matrix-built\s+(\{[\s\S]*?\})/g;

function loadLeaves() {
  const leaves = [];
  const dir = path.join(ROOT, "docs/specs/scoreboard/modules");
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".required.json")) continue;
    const mod = name.replace(/\.required\.json$/, "");
    const j = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const leaf of j.leaves || []) {
      if (!leaf || typeof leaf !== "object") continue;
      const id = leaf.id || leaf.leaf;
      if (!id) continue;
      leaves.push({ mod, id, required: leaf.required || [] });
    }
  }
  return leaves;
}

function collectPickerClaims() {
  const claims = [];
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/wire-sprint-built.json"), "utf8"));
  for (const raw of feed.entries || []) {
    if (!(raw.cols || []).includes("picker_law")) continue;
    claims.push({ file: "docs/specs/scoreboard/wire-sprint-built.json", task: raw.task, leafRe: raw.leafRe || "", modules: raw.modules || [] });
  }
  for (const name of fs.readdirSync(path.join(ROOT, "scripts"))) {
    if (!name.startsWith("verify-") || !name.endsWith(".mjs")) continue;
    if (name === "verify-picker-law-built-match-cap.mjs") continue;
    const full = fs.readFileSync(path.join(ROOT, "scripts", name), "utf8");
    const line2 = full.split("\n", 2)[1] || "";
    // Also scan first 15 lines for multi-tag files like lst-picker-config-driven
    const head = full.split("\n").slice(0, 20).join("\n");
    for (const m of head.matchAll(MATRIX_BUILT_JSON_RE)) {
      try {
        const tag = JSON.parse(m[1]);
        if (!(tag.cols || []).includes("picker_law")) continue;
        claims.push({ file: `scripts/${name}`, task: tag.task, leafRe: tag.leafRe || "", modules: tag.modules || [] });
      } catch {
        /* ignore */
      }
    }
  }
  return claims;
}

export function audit(claims = collectPickerClaims(), leaves = loadLeaves()) {
  const failures = [];
  for (const c of claims) {
    let cre;
    try {
      cre = new RegExp(c.leafRe);
    } catch {
      failures.push(`${c.file} (${c.task}): invalid leafRe ${JSON.stringify(c.leafRe)}`);
      continue;
    }
    const mods = new Set(c.modules || []);
    let n = 0;
    for (const leaf of leaves) {
      if (mods.size && !mods.has(leaf.mod)) continue;
      const req = leaf.required;
      const owes =
        Array.isArray(req) ? req.includes("picker_law") : req && typeof req === "object" ? Boolean(req.picker_law) : false;
      if (!owes) continue;
      if (cre.test(leaf.id)) n += 1;
    }
    if (n > MATCH_CAP) {
      failures.push(
        `${c.file} (${c.task}): picker_law leafRe matches ${n} Required leaves (cap ${MATCH_CAP}) — narrow or drop Box-3 credit`,
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const leaves = [
    { mod: "lists", id: "catalog.a", required: ["picker_law"] },
    { mod: "lists", id: "catalog.b", required: ["picker_law"] },
  ];
  for (let i = 0; i < 50; i++) leaves.push({ mod: "lists", id: `catalog.x${i}`, required: ["picker_law"] });
  const bad = audit([{ file: "fixture", task: "T", leafRe: "^catalog\\.", modules: ["lists"] }], leaves);
  if (!bad.length) {
    console.error(`${LABEL} SELFTEST FAIL — over-cap claim not caught`);
    process.exit(1);
  }
  const good = audit([{ file: "fixture", task: "T", leafRe: "^catalog\\.a$", modules: ["lists"] }], leaves);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — exact leaf rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — no picker_law Built claim exceeds ${MATCH_CAP} Required leaves`);
