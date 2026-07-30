#!/usr/bin/env node
/**
 * 1832 — ACCT close: categorization-rules routes mounted + escrow abandon trigger text-cast.
 * Blocks: (1) registerCategorizationRulesRoutes orphaning again (apply-historical 404),
 *         (2) migration 202610290000 missing (22P02 on every load status update).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function fail(msg) {
  console.error(`FAIL 1832: ${msg}`);
  process.exit(1);
}

function selftest() {
  const index = readFileSync(join(ROOT, "apps/backend/src/index.ts"), "utf8");
  if (!index.includes("registerCategorizationRulesRoutes")) {
    throw new Error("selftest: expected registerCategorizationRulesRoutes import/call in index.ts");
  }
  const mig = join(ROOT, "db/migrations/202610290000_disp01_escrow_abandon_trigger_text_cast.sql");
  if (!existsSync(mig)) throw new Error("selftest: migration file missing");
  const sql = readFileSync(mig, "utf8");
  if (!sql.includes("NEW.status::text")) throw new Error("selftest: expected ::text cast in migration");
  console.log("PASS 1832 --selftest");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const index = readFileSync(join(ROOT, "apps/backend/src/index.ts"), "utf8");
  if (!/import\s*\{\s*registerCategorizationRulesRoutes\s*\}/.test(index)) {
    fail("apps/backend/src/index.ts must import registerCategorizationRulesRoutes");
  }
  if (!/await\s+registerCategorizationRulesRoutes\s*\(\s*app\s*\)/.test(index)) {
    fail("apps/backend/src/index.ts must await registerCategorizationRulesRoutes(app)");
  }

  const orphan = readFileSync(join(ROOT, "scripts/verify-no-orphan-routes.mjs"), "utf8");
  if (/\[\s*"registerCategorizationRulesRoutes"\s*,/.test(orphan)) {
    fail("registerCategorizationRulesRoutes must NOT be on verify-no-orphan-routes ALLOWLIST once mounted");
  }

  const migPath = join(ROOT, "db/migrations/202610290000_disp01_escrow_abandon_trigger_text_cast.sql");
  if (!existsSync(migPath)) fail("missing db/migrations/202610290000_disp01_escrow_abandon_trigger_text_cast.sql");
  const sql = readFileSync(migPath, "utf8");
  if (!sql.includes("NEW.status::text NOT IN")) {
    fail("migration must compare NEW.status::text (not bare enum literals)");
  }
  if (!sql.includes("trg_auto_propose_escrow_on_abandon")) {
    fail("migration must recreate trg_auto_propose_escrow_on_abandon");
  }

  console.log("PASS 1832: categorization-rules mounted + DISP-01 escrow trigger text-cast migration present");
}

main();
