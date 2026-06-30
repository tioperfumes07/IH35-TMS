// QA-sweep: the maintenance "Convert to Damage" route is no longer a 501 stub — it now creates a
// real safety.incidents damage report. This standalone static check mirrors the CI-wired vitest
// guard (apps/backend/src/maintenance/__tests__/triage-convert-to-damage.guard.test.ts) so the
// implementation can't silently regress to a not-implemented stub. Run: `npx tsx scripts/test-maintenance-damage-stub.ts`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../apps/backend/src/maintenance/triage.routes.ts"), "utf8");

const failures: string[] = [];
if (source.includes("damage_conversion_not_implemented")) {
  failures.push("convert-to-damage still returns the 501 'damage_conversion_not_implemented' stub");
}
if (!source.includes("INSERT INTO safety.incidents")) {
  failures.push("convert-to-damage no longer inserts into safety.incidents");
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("OK: convert-to-damage is implemented (creates safety.incidents damage report)");
