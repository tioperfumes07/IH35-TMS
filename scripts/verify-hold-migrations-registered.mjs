#!/usr/bin/env node
// verify-hold-migrations-registered.mjs
// Financial-safety guard (2026-07-03). A "DO NOT RUN ON PROD" migration is committed to main but must
// NEVER be applied by preDeploy `db:migrate` — it runs only on a Neon branch (Jorge's hand) and is
// ledger-backfilled so prod skips it. The latent risk: if such a migration silently loses its marker
// (edit/rename) it becomes a normal pending migration and FIRES destructively on the next prod deploy.
//
// This guard enforces BIDIRECTIONAL parity between the "DO NOT RUN ON PROD" marker and the registry
// db/migrations/.held-migrations.json:
//   (1) every migration whose header carries the marker MUST be registered, and
//   (2) every registered file MUST still carry the marker and exist.
// So a held migration can never drift out of held-state unnoticed, and a new one can't be added untracked.
//
// 2026-07-25 GUARD split: the registry carries TWO arrays — `held` (genuinely unapplied) and
// `applied_held` (marker still present on disk, but confirmed already applied on prod). Both are
// "registered" for marker-parity purposes: a file's applied/unapplied STATE is orthogonal to whether
// it still needs to be tracked so it can never silently fire on prod. Only
// scripts/verify-held-registry-ledger-parity.mjs cares which of the two arrays a file sits in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hold-migrations-registered";
const MIG_DIR = path.join(ROOT, "db/migrations");
const REG_PATH = path.join(MIG_DIR, ".held-migrations.json");
const MARKER = /DO NOT RUN ON PROD|never run on prod|runs? on a neon branch/i;

const errs = [];
let registry;
try { registry = JSON.parse(fs.readFileSync(REG_PATH, "utf8")); }
catch { console.error(`[${LABEL}] FAILED — missing/invalid ${path.relative(ROOT, REG_PATH)}`); process.exit(1); }
const registered = new Set(
  [...(registry.held || []), ...(registry.applied_held || [])].map((h) => h.file)
);

// (1) every marked migration is registered
const markedOnDisk = new Set();
for (const f of fs.readdirSync(MIG_DIR)) {
  if (!f.endsWith(".sql")) continue;
  const head = fs.readFileSync(path.join(MIG_DIR, f), "utf8").slice(0, 1200);
  if (MARKER.test(head)) {
    markedOnDisk.add(f);
    if (!registered.has(f)) errs.push(`${f} carries a DO-NOT-RUN marker but is NOT in .held-migrations.json (register it — a held migration must be tracked so it can't silently fire on prod)`);
  }
}
// (2) every registered file still exists AND still carries the marker
for (const f of registered) {
  const fp = path.join(MIG_DIR, f);
  if (!fs.existsSync(fp)) { errs.push(`${f} is registered as held but does not exist on disk`); continue; }
  if (!markedOnDisk.has(f)) errs.push(`${f} is registered as held but LOST its 'DO NOT RUN ON PROD' marker — restore the marker or it becomes a normal pending migration that fires on the next prod deploy`);
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${markedOnDisk.size} held migrations, all registered + marker-intact.`);
