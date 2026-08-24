#!/usr/bin/env node
/**
 * verify-maintenance-damage-register-visible-label.mjs (MAINT-DMG-F6314)
 *
 * Root cause: `apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx`'s
 * "Report #" column rendered `entityLabel(null, String(row.id), "Damage")` — literally passing
 * `null` as the name, which per `entityLabel`'s own contract ALWAYS produces "Damage — not
 * visible" whenever an id is present. Live-reproduced on `/maintenance/damage-reports`: a real,
 * fully-visible damage report (unit T120, real description, real status) showed
 * "Damage — not visible" as its Report # for every row — not an edge case, a guaranteed-always
 * bug, since `safety.incidents` has no display/sequence number and the id is always present.
 * `entityLabel`'s "not visible" fallback is for an UNRESOLVED cross-entity join — wrong semantics
 * for a row already fully in hand.
 *
 * Fix: swap to `visibleDocumentLabel(null, row.id, "Damage")` — the established helper for the
 * "no real display id, but the row IS visible" class (same null-name pattern already used in
 * ManualJEListPage.tsx) — falls back to the bare noun "Damage" instead of the tombstone sentence.
 *
 * Usage:
 *   node scripts/verify-maintenance-damage-register-visible-label.mjs            # scan
 *   node scripts/verify-maintenance-damage-register-visible-label.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx";

const NOT_VISIBLE_CALL_RE = /entityLabel\(null,\s*String\(row\.id\),\s*"Damage"\)/;
const VISIBLE_LABEL_CALL_RE = /visibleDocumentLabel\(null,\s*String\(row\.id\),\s*"Damage"\)/;
const IMPORTS_HELPER_RE = /import\s*\{[^}]*\bvisibleDocumentLabel\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/lib\/entity-label["']/;

export function checkDamageRegisterVisibleLabel(src) {
  const offenders = [];
  if (!IMPORTS_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import visibleDocumentLabel from ../../../lib/entity-label — MAINT-DMG-F6314 regression.`);
  }
  if (NOT_VISIBLE_CALL_RE.test(src)) {
    offenders.push(`${FILE}: the Report # column still calls entityLabel(null, row.id, "Damage") — every real damage report will render "Damage — not visible" again.`);
  }
  if (!VISIBLE_LABEL_CALL_RE.test(src)) {
    offenders.push(`${FILE}: the Report # column is not wired to visibleDocumentLabel(null, row.id, "Damage").`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkDamageRegisterVisibleLabel(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    import { entityLabel } from "../../../lib/entity-label";
    const columns = [
      {
        key: "id",
        label: "Report #",
        render: (row) => (row.id ? entityLabel(null, String(row.id), "Damage") : "—"),
      },
    ];
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkDamageRegisterVisibleLabel(buggy);
  const fixedOffenders = checkDamageRegisterVisibleLabel(fixed);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-maintenance-damage-register-visible-label selftest OK");
    process.exit(0);
  }
  console.error("verify-maintenance-damage-register-visible-label selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-maintenance-damage-register-visible-label FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-maintenance-damage-register-visible-label OK — the Damage Register's Report # column uses visibleDocumentLabel(), never entityLabel's not-visible tombstone",
  );
}
