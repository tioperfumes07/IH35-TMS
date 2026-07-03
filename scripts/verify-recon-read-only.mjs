#!/usr/bin/env node
// verify-recon-read-only.mjs — RECON-01 hard control. The reconciliation engine is READ-ONLY: it may write
// ONLY accounting.recon_runs / accounting.recon_exceptions (its own findings) and call events.log_event. It
// must NEVER post to the ledger or mutate any financial table — reconciliation flags divergence for a human,
// it never auto-fixes. This guard fails if the engine module writes anything outside its own two tables.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = path.join(ROOT, "apps/backend/src/accounting/recon/recon-engine.service.ts");

let src = "";
try { src = fs.readFileSync(ENGINE, "utf8"); } catch { console.error("recon-read-only: engine module missing"); process.exit(1); }

const errs = [];
// Find every INSERT/UPDATE/DELETE target in the engine SQL. Only the two recon tables (and events.log_event) allowed.
const WRITE_RE = /\b(insert\s+into|update|delete\s+from)\s+([a-z_]+\.[a-z_]+)/gi;
const ALLOWED = new Set(["accounting.recon_runs", "accounting.recon_exceptions"]);
let m;
while ((m = WRITE_RE.exec(src)) !== null) {
  const target = m[2].toLowerCase();
  if (!ALLOWED.has(target)) errs.push(`writes ${m[1].toUpperCase()} ${target} — engine may only write accounting.recon_runs/recon_exceptions`);
}
// No GL-posting markers may appear in the engine (defense-in-depth against a future edit adding a post).
for (const marker of [/journal_entry_postings/i, /INSERT\s+INTO\s+accounting\.journal/i, /postJournalEntry|buildBalancedJe|postBalancedJe/i, /payment_applications/i]) {
  if (marker.test(src)) errs.push(`GL-posting marker present (${marker}) — the recon engine must never post to the ledger`);
}

// The route surface must be GET-only (surfacing findings; resolution is a separate action, not a bulk route).
let routes = "";
try { routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/recon/recon.routes.ts"), "utf8"); } catch { /* optional until 3/n */ }
if (routes) {
  const writeRoute = routes.match(/app\.(post|put|delete|patch)\s*\(/i);
  if (writeRoute) errs.push(`recon.routes.ts declares a write route (${writeRoute[1]}) — the read surface must be GET-only`);
  if (!/process\.env\.TMS_QBO_RECON_ENABLED/.test(routes)) errs.push("recon.routes.ts must gate on TMS_QBO_RECON_ENABLED (404 when OFF)");
}

if (errs.length) {
  console.error("verify:recon-read-only — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("[recon-read-only] OK — engine writes only recon_runs/recon_exceptions; no ledger posting.");
