#!/usr/bin/env node
/**
 * verify-no-false-green-certify.mjs — STRICT method enforcement (IH35-TMS).
 *
 * A module with complete:true may NOT certify while any wave in docs/audit/wave-queue.json
 * that lists that module is still open|draining.
 *
 * Manifest shape (verified): docs/module-completion/<module>.json → { module, complete }.
 *
 *   node scripts/verify-no-false-green-certify.mjs
 *   node scripts/verify-no-false-green-certify.mjs --selftest
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MC_DIR = join(ROOT, "docs/module-completion");
const QUEUE = join(ROOT, "docs/audit/wave-queue.json");
const LABEL = "verify-no-false-green-certify";
const SELFTEST = process.argv.includes("--selftest");

export function assertNoFalseGreen(queuePath, mcDir) {
  const errs = [];
  if (!existsSync(queuePath) || !existsSync(mcDir)) return errs;
  let queue;
  try {
    queue = JSON.parse(readFileSync(queuePath, "utf8"));
  } catch (e) {
    return [`${queuePath} invalid JSON: ${e.message}`];
  }
  const waves = Array.isArray(queue.waves) ? queue.waves : [];
  const openByModule = new Map();
  for (const w of waves) {
    if (w.status === "drained") continue;
    for (const m of w.modules || []) {
      if (!openByModule.has(m)) openByModule.set(m, []);
      openByModule.get(m).push(w.id);
    }
  }
  for (const f of readdirSync(mcDir)) {
    if (!f.endsWith(".json")) continue;
    // Skip non-module manifests (SCHEMA etc.)
    if (f === "SCHEMA.json" || f.startsWith("_")) continue;
    let mc;
    try {
      mc = JSON.parse(readFileSync(join(mcDir, f), "utf8"));
    } catch {
      continue;
    }
    if (!mc || typeof mc !== "object" || !("complete" in mc)) continue;
    const moduleName = typeof mc.module === "string" ? mc.module : f.replace(/\.json$/, "");
    const certified = mc.complete === true;
    if (!certified) continue;
    const openClasses = openByModule.get(moduleName) || [];
    if (openClasses.length) {
      errs.push(
        `module "${moduleName}" is complete:true but shared classes still open: ${openClasses.join(", ")}`,
      );
    }
  }
  return errs;
}

if (SELFTEST) {
  const dir = mkdtempSync(join(tmpdir(), "ih35-false-green-"));
  try {
    const q = join(dir, "wave-queue.json");
    const mc = join(dir, "module-completion");
    mkdirSync(mc, { recursive: true });
    writeFileSync(
      q,
      JSON.stringify({
        waves: [
          {
            id: "CLS-TEST-OPEN",
            root_cause: "planted open class for selftest",
            lane: "mechanical",
            layer: "B",
            modules: ["accounting"],
            instances: [{ path: "apps/x.tsx", entity: "TRANSP" }],
            completeness: "planted",
            guard: "scripts/verify-x.mjs",
            drain_proof: { guard_green: false, guard_sample: "", money_critical: false },
            status: "open",
          },
        ],
      }),
    );
    writeFileSync(join(mc, "accounting.json"), JSON.stringify({ module: "accounting", complete: true, items: [] }));
    const planted = assertNoFalseGreen(q, mc);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL — false-green not caught`);
      process.exit(1);
    }
    writeFileSync(join(mc, "accounting.json"), JSON.stringify({ module: "accounting", complete: false, items: [] }));
    const clean = assertNoFalseGreen(q, mc);
    if (clean.length) {
      console.error(`${LABEL} SELFTEST FAIL — incomplete module flagged:`, clean);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS`);
    process.exit(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (!existsSync(QUEUE) || !existsSync(MC_DIR)) {
  console.log(`${LABEL}: queue or module-completion dir absent — nothing to check (pass).`);
  process.exit(0);
}

const errs = assertNoFalseGreen(QUEUE, MC_DIR);
if (errs.length) {
  console.error(`${LABEL} FAIL: ${errs.length} false-green certification(s):`);
  for (const e of errs) console.error("  - " + e);
  process.exit(1);
}
console.log(`${LABEL}: OK — no module certified while a shared class it touches is open.`);
process.exit(0);
