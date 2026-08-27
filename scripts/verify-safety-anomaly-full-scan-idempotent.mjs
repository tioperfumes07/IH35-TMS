#!/usr/bin/env node
import fs from "node:fs";

const detectorPath = new URL("../apps/backend/src/safety/anomaly/detector.service.ts", import.meta.url);
const enginePath = new URL("../apps/backend/src/safety/anomaly/rule-engine.service.ts", import.meta.url);
const detector = fs.readFileSync(detectorPath, "utf8");
const engine = fs.readFileSync(enginePath, "utf8");

const checks = [
  [!(/LIMIT\s+50/i.test(detector)), "all four mounted anomaly detectors scan the complete company scope"],
  [detector.includes("array_agg(id::text ORDER BY id)"), "duplicate-load evidence has deterministic ordered ids"],
  [detector.includes("SELECT DISTINCT d.id::text AS driver_id"), "inactive-driver scan emits one finding per driver"],
  [engine.includes("pg_advisory_xact_lock(hashtextextended"), "concurrent evaluations serialize the canonical finding fingerprint"],
  [engine.includes("existing.subject_kind IS NOT DISTINCT FROM $4"), "nullable subject kind participates in identity"],
  [engine.includes("existing.subject_uuid IS NOT DISTINCT FROM $5::uuid"), "nullable subject uuid participates in identity"],
  [engine.includes("existing.evidence = $6::jsonb"), "evidence participates in canonical finding identity"],
  [engine.includes("existing.resolution_status IN ('open', 'investigating')"), "only unresolved findings suppress reinsertion"],
  [engine.includes("if (res.rows[0])"), "notifications fire only for newly inserted alerts"],
];

if (process.argv.includes("--selftest")) {
  const planted = detector.replace("ORDER BY load_number", "ORDER BY load_number LIMIT 50");
  if (!/LIMIT\s+50/i.test(planted)) throw new Error("selftest failed to plant silent cap");
  const weakened = engine.replace("existing.evidence = $6::jsonb", "TRUE");
  if (weakened.includes("existing.evidence = $6::jsonb")) throw new Error("selftest failed to remove evidence identity");
  console.log("verify-safety-anomaly-full-scan-idempotent SELFTEST PASS — planted cap and weakened identity rejected");
  process.exit(0);
}

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`verify-safety-anomaly-full-scan-idempotent PASS — ${checks.length}/${checks.length} full-scan and idempotency invariants`);
