#!/usr/bin/env node
/**
 * GAP-65 CI guard — verify Owner Today's Attention aggregator correctness.
 *
 * Checks:
 *   1. aggregator.service.ts exports computeTodaysAttention
 *   2. routes.ts exports registerOwnerTodaysAttentionRoutes
 *   3. todays-attention-worker.ts exports initialize + stop
 *   4. Owner-only RBAC: route files contain role check
 *   5. Dismiss flow: route handles dismiss endpoint
 *   6. Migration 0405 exists
 *   7. TodaysAttentionTop5 and AttentionItemCard frontend components exist
 *   8. OwnerHome.tsx imports TodaysAttentionTop5
 *   9. manifest.tsx routes Owner to OwnerHome
 *
 * EXIT 0 = all checks pass
 * EXIT 1 = one or more checks failed
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const LABEL = "verify-owner-todays-attention";

let passed = 0;
let failed = 0;

function check(description, fn) {
  try {
    const result = fn();
    if (result === false) {
      console.error(`  ✗ FAIL  ${description}`);
      failed++;
    } else {
      console.log(`  ✓ PASS  ${description}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ✗ FAIL  ${description} — ${err.message}`);
    failed++;
  }
}

function fileContains(relPath, ...needles) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`File not found: ${relPath}`);
  const src = readFileSync(abs, "utf8");
  for (const needle of needles) {
    if (!src.includes(needle)) throw new Error(`Missing "${needle}" in ${relPath}`);
  }
  return true;
}

function fileExists(relPath) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`File not found: ${relPath}`);
  return true;
}

console.log(`\n[${LABEL}] starting checks...\n`);

// ─── Backend ──────────────────────────────────────────────────────────────────

check(
  "aggregator.service.ts exports computeTodaysAttention",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/aggregator.service.ts",
    "export async function computeTodaysAttention"
  )
);

check(
  "aggregator service has 10 source functions",
  () => {
    const src = readFileSync(
      resolve(ROOT, "apps/backend/src/owner/todays-attention/aggregator.service.ts"),
      "utf8"
    );
    const matches = src.match(/^async function source/gm);
    if (!matches || matches.length < 10) {
      throw new Error(`Expected ≥10 source functions, found ${matches?.length ?? 0}`);
    }
    return true;
  }
);

check(
  "routes.ts exports registerOwnerTodaysAttentionRoutes",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/routes.ts",
    "export async function registerOwnerTodaysAttentionRoutes"
  )
);

check(
  "routes.ts enforces Owner/Administrator RBAC",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/routes.ts",
    "Owner",
    "Administrator",
    "forbidden"
  )
);

check(
  "routes.ts implements dismiss endpoint",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/routes.ts",
    "dismiss",
    "dismissed_by"
  )
);

check(
  "dismiss audits the action",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/routes.ts",
    "audit.audit_events",
    "dismiss"
  )
);

check(
  "todays-attention-worker.ts exports initializeTodaysAttentionWorker",
  () => fileContains(
    "apps/backend/src/jobs/todays-attention-worker.ts",
    "export function initializeTodaysAttentionWorker"
  )
);

check(
  "worker exports stopTodaysAttentionWorker",
  () => fileContains(
    "apps/backend/src/jobs/todays-attention-worker.ts",
    "export function stopTodaysAttentionWorker"
  )
);

check(
  "worker runs every 15 minutes",
  () => fileContains(
    "apps/backend/src/jobs/todays-attention-worker.ts",
    "15 * 60 * 1000"
  )
);

check(
  "index.ts registers owner attention routes",
  () => fileContains(
    "apps/backend/src/index.ts",
    "registerOwnerTodaysAttentionRoutes",
    "initializeTodaysAttentionWorker",
    "stopTodaysAttentionWorker"
  )
);

// ─── Database ─────────────────────────────────────────────────────────────────

check(
  "migration 0405_owner_todays_attention_snapshot.sql exists",
  () => fileExists("db/migrations/0405_owner_todays_attention_snapshot.sql")
);

check(
  "migration creates owner.todays_attention_snapshot with RLS",
  () => fileContains(
    "db/migrations/0405_owner_todays_attention_snapshot.sql",
    "owner.todays_attention_snapshot",
    "ENABLE ROW LEVEL SECURITY",
    "operating_company_id",
    "dismissed"
  )
);

// ─── Frontend ─────────────────────────────────────────────────────────────────

check(
  "TodaysAttentionTop5.tsx exists",
  () => fileExists("apps/frontend/src/components/home/TodaysAttentionTop5.tsx")
);

check(
  "AttentionItemCard.tsx exists",
  () => fileExists("apps/frontend/src/components/home/AttentionItemCard.tsx")
);

check(
  "TodaysAttentionTop5 uses fetchOwnerTodaysAttention + dismissOwnerAttentionItem",
  () => fileContains(
    "apps/frontend/src/components/home/TodaysAttentionTop5.tsx",
    "fetchOwnerTodaysAttention",
    "dismissOwnerAttentionItem"
  )
);

check(
  "OwnerHome.tsx exists",
  () => fileExists("apps/frontend/src/pages/home/OwnerHome.tsx")
);

check(
  "OwnerHome.tsx imports and renders TodaysAttentionTop5",
  () => fileContains(
    "apps/frontend/src/pages/home/OwnerHome.tsx",
    "TodaysAttentionTop5",
    "operatingCompanyId"
  )
);

check(
  "home.ts exports fetchOwnerTodaysAttention + dismissOwnerAttentionItem",
  () => fileContains(
    "apps/frontend/src/api/home.ts",
    "export async function fetchOwnerTodaysAttention",
    "export async function dismissOwnerAttentionItem"
  )
);

check(
  "manifest.tsx routes Owner to OwnerHome",
  () => fileContains(
    "apps/frontend/src/routes/manifest.tsx",
    "OwnerHome",
    "role === \"Owner\""
  )
);

// ─── Tests ────────────────────────────────────────────────────────────────────

check(
  "aggregator unit tests exist",
  () => fileExists("apps/backend/src/owner/todays-attention/__tests__/aggregator.test.ts")
);

check(
  "tests cover ranking, deduplication, and RLS patterns",
  () => fileContains(
    "apps/backend/src/owner/todays-attention/__tests__/aggregator.test.ts",
    "sorted by score",
    "deduplicates",
    "RLS"
  )
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n[${LABEL}] ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
