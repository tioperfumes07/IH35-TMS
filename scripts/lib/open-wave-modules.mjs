/**
 * Shared: which modules are listed on non-drained wave cards in docs/audit/wave-queue.json.
 * Used by verify-module-completion + verify-no-false-green-certify so they cannot disagree.
 *
 * Open for the Rule 24 complete-pin = status !== "drained" AND pins_complete !== false.
 * Owner 2026-08-24: HOLD / empty-TMS-expected / N/A-PRE-OPERATIONAL / ops-backlog
 * cards must not freeze complete:false on an all-PASS checklist. Set pins_complete:false
 * on those cards. They stay open for the class; they do not lie about module complete.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
export const DEFAULT_WAVE_QUEUE = join(ROOT, "docs/audit/wave-queue.json");

/**
 * @param {string} [queuePath]
 * @returns {Map<string, string[]>} moduleName → wave ids still open|draining
 */
export function openWavesByModule(queuePath = DEFAULT_WAVE_QUEUE) {
  const map = new Map();
  if (!existsSync(queuePath)) return map;
  let queue;
  try {
    queue = JSON.parse(readFileSync(queuePath, "utf8"));
  } catch {
    return map;
  }
  const waves = Array.isArray(queue?.waves) ? queue.waves : [];
  for (const w of waves) {
    if (!w || w.status === "drained") continue;
    if (w.pins_complete === false) continue;
    const id = typeof w.id === "string" ? w.id : "";
    if (!id) continue;
    for (const m of w.modules || []) {
      if (typeof m !== "string" || !m) continue;
      if (!map.has(m)) map.set(m, []);
      map.get(m).push(id);
    }
  }
  return map;
}

/** @param {string} moduleName @param {string} [queuePath] */
export function openWaveIdsForModule(moduleName, queuePath = DEFAULT_WAVE_QUEUE) {
  if (!moduleName) return [];
  return openWavesByModule(queuePath).get(moduleName) || [];
}
