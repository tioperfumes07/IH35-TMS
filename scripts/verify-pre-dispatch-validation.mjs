#!/usr/bin/env node
/**
 * GAP-14: Pre-Dispatch Validation — CI architecture guard.
 *
 * Verifies:
 *   1. Route is registered in the backend (POST /api/v1/dispatch/validation/pre-dispatch)
 *   2. Route file is imported in index.ts
 *   3. PreDispatchValidationPanel is rendered in BookLoadModalV4
 *   4. Book button blocking logic is enforced (disabled when blockers exist)
 *   5. Manifest declares no financial writes
 *
 * Exit 0 = all checks pass.
 * Exit 1 = one or more checks failed (prints exact failure).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

const failures = [];

function check(label, condition, hint) {
  if (!condition) {
    failures.push({ label, hint });
    console.error(`  FAIL  ${label}`);
    if (hint) console.error(`        Hint: ${hint}`);
  } else {
    console.log(`  PASS  ${label}`);
  }
}

console.log("\n[GAP-14] verify-pre-dispatch-validation\n");

// ── 1. Route file exists ──────────────────────────────────────────────────────
const routeSource = read(
  "apps/backend/src/dispatch/validation/pre-dispatch.routes.ts"
);
check(
  "Route file exists",
  routeSource !== null,
  "Create apps/backend/src/dispatch/validation/pre-dispatch.routes.ts"
);

// ── 2. Route registers POST /api/v1/dispatch/validation/pre-dispatch ──────────
check(
  "Route registers POST /api/v1/dispatch/validation/pre-dispatch",
  routeSource?.includes("/api/v1/dispatch/validation/pre-dispatch") && routeSource?.includes("app.post"),
  "Route must use app.post('/api/v1/dispatch/validation/pre-dispatch', ...)"
);

// ── 3. Route requires auth ────────────────────────────────────────────────────
check(
  "Route enforces authentication (requireAuth)",
  routeSource?.includes("requireAuth"),
  "Add requireAuth(req, reply) guard inside the route handler"
);

// ── 4. index.ts imports and registers the route ───────────────────────────────
const indexSource = read("apps/backend/src/index.ts");
check(
  "index.ts imports registerPreDispatchValidationRoutes",
  indexSource?.includes("registerPreDispatchValidationRoutes"),
  "Add import { registerPreDispatchValidationRoutes } ... in index.ts"
);
check(
  "index.ts calls registerPreDispatchValidationRoutes(app)",
  indexSource?.includes("registerPreDispatchValidationRoutes(app)"),
  "Add await registerPreDispatchValidationRoutes(app) in index.ts"
);

// ── 5. Validator service exists ───────────────────────────────────────────────
const serviceSource = read(
  "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts"
);
check(
  "Validator service file exists",
  serviceSource !== null,
  "Create apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts"
);

// ── 6. Validator is read-only (no financial writes) ───────────────────────────
const upperService = (serviceSource ?? "").toUpperCase();
check(
  "Validator has no INSERT INTO (read-only)",
  !/\bINSERT\s+INTO\b/.test(upperService),
  "Validator must not write to the DB. Remove all INSERT INTO statements."
);
check(
  "Validator has no DELETE FROM (read-only)",
  !/\bDELETE\s+FROM\b/.test(upperService),
  "Validator must not write to the DB. Remove all DELETE FROM statements."
);

// ── 7. Required rule IDs present in service ───────────────────────────────────
const requiredRules = [
  "WF-CDL-EXPIRED",
  "WF-038-DRIVER-INACTIVE",
  "WF-050-DVIR-MAJOR",
  "WF-HOS-VIOLATION",
  "WF-MED-CARD-EXPIRING",
  "GAP-14-FMCSA-STALE",
  "GAP-14-DRIVER-DEBT",
];
for (const rule of requiredRules) {
  check(
    `Service defines rule_id "${rule}"`,
    serviceSource?.includes(rule),
    `Add rule with id "${rule}" to pre-dispatch-validator.service.ts`
  );
}

// ── 8. Locked design decisions enforced ──────────────────────────────────────
check(
  "Debt threshold is $500 (50000 cents)",
  serviceSource?.includes("DEBT_WARN_THRESHOLD_CENTS = 50_000") ||
    serviceSource?.includes("DEBT_WARN_THRESHOLD_CENTS=50_000"),
  "DEBT_WARN_THRESHOLD_CENTS must be 50_000 (= $500.00)"
);
check(
  "FMCSA stale threshold is 24 hours",
  serviceSource?.includes("FMCSA_STALE_HOURS = 24"),
  "FMCSA_STALE_HOURS must be 24"
);
check(
  "Medical card warning window is 30 days",
  serviceSource?.includes("MEDICAL_CARD_WARN_DAYS = 30"),
  "MEDICAL_CARD_WARN_DAYS must be 30"
);

// ── 9. PreDispatchValidationPanel rendered in BookLoadModalV4 ─────────────────
const modalSource = read(
  "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"
);
check(
  "BookLoadModalV4 imports PreDispatchValidationPanel",
  modalSource?.includes("PreDispatchValidationPanel"),
  "Import and render PreDispatchValidationPanel in BookLoadModalV4.tsx Section D"
);

// ── 10. Book button blocking logic ────────────────────────────────────────────
check(
  "Book button disabled when blockers exist (preDispatchHasBlockers)",
  modalSource?.includes("preDispatchHasBlockers"),
  "Wire preDispatchHasBlockers to disable the Book + dispatch button"
);

// ── 11. Manifest exists and declares no financial writes ──────────────────────
const manifestSource = read(
  ".block-ready/GAP-14-PRE-DISPATCH-VALIDATION.json"
);
check(
  "Manifest file exists",
  manifestSource !== null,
  "Create .block-ready/GAP-14-PRE-DISPATCH-VALIDATION.json"
);
try {
  const manifest = JSON.parse(manifestSource ?? "{}");
  check(
    "Manifest declares financial_writes: false",
    manifest.financial_writes === false,
    "Set financial_writes: false in the manifest"
  );
} catch {
  check("Manifest is valid JSON", false, "Fix JSON syntax in manifest file");
}

// ── 12. Tests exist ──────────────────────────────────────────────────────────
const testSource = read(
  "apps/backend/src/dispatch/validation/__tests__/pre-dispatch.test.ts"
);
check(
  "Test file exists",
  testSource !== null,
  "Create apps/backend/src/dispatch/validation/__tests__/pre-dispatch.test.ts"
);
check(
  "Tests cover block vs warn semantics",
  testSource?.includes("block") && testSource?.includes("warn"),
  "Add tests for block and warn severity semantics"
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("");
if (failures.length === 0) {
  console.log(`GAP-14 verify PASSED — all ${12 + requiredRules.length} checks green.\n`);
  process.exit(0);
} else {
  console.error(
    `GAP-14 verify FAILED — ${failures.length} check(s) failed (see above).\n`
  );
  process.exit(1);
}
