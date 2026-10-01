#!/usr/bin/env node
/**
 * ROUND 313 E-32: Samsara driver documents land in docs.files linked to load + stop + unit + driver, idempotent per
 * photo, filed as POD (never relabelled BOL -- the BOL category drives auto-invoicing, a money-lane rule).
 */
import { readFileSync } from "node:fs";
const svc = readFileSync("apps/backend/src/integrations/samsara/documents/samsara-documents.service.ts", "utf8");
const idx = readFileSync("apps/backend/src/index.ts", "utf8");
const link = readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8");
const mig = readFileSync("db/migrations/202615191000_engine_system_actor_and_stop_file_links.sql", "utf8");
const checks = [
  [/r2Key = `samsara\/documents\/\$\{docId\}\/\$\{i \+ 1\}`/.test(svc) && /SELECT 1 FROM docs\.files WHERE r2_key = \$1/.test(svc), "idempotent per document photo (r2_key)"],
  [/\["load", stop\?\.load_id/.test(svc) && /\["load_stop", stop\?\.stop_id/.test(svc) && /\["unit", unitId\]/.test(svc) && /\["driver", driverId\]/.test(svc), "links load + stop + unit + driver"],
  [/code = 'pod'/.test(svc) && !/code = 'bol'/.test(svc), "filed as POD, never as BOL"],
  [/ih35Stop/.test(svc), "stop resolved from the E-31 route stop externalIds.ih35Stop"],
  [/'load_stop'::text/.test(mig), "file_links accepts load_stop"],
  [/initializeSamsaraDocumentsCron\(app\)/.test(idx), "hourly documents cron registered"],
  [/documents: await q\(/.test(link), "load + unit reverse links list documents"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-samsara-documents-engine: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-samsara-documents-engine: OK (${checks.length})`);
