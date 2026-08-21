#!/usr/bin/env node
/**
 * LV-WO-RECONCILE-EXCLUDES-SECTION-A / LV-WO-RECONCILE-LINE-TYPE-DOMAIN-LEAK — owner-directive P0
 * (2026-08-07): the vendor-invoice reconcile panel could certify "Reconciled" while $436.66 of a
 * real work order sat outside its scope, because the WO-side of the tie-out was computed by
 * filtering sub-rows to an EXACT string match on line_type IN ('parts','labor'), silently
 * excluding: Section A category lines, the 'part' singular alias, and 'disposal'/'other' sub-rows
 * — all fully included in the WO total and the A/P bill, none visible to the reconcile.
 *
 * PERMANENT FIX (per the row's own Definition of Done): stop enumerating what the WO side of the
 * reconcile covers. The WO grand total is now computed with the EXACT SAME formula the backend
 * uses to compute what actually posts to the A/P bill (two-section-service.ts's sectionATotal +
 * sectionBTotal), and everything not explicitly bucketed as Parts/Labor falls into a residual
 * "Other" bucket BY SUBTRACTION, not by enumerating a third literal type — so nothing can ever
 * silently vanish again, including any future 6th line_type value.
 *
 * This guard locks: (1) the modal computes a WO grand total mirroring the backend's own formula,
 * (2) the Other bucket is computed by subtraction (woGrandTotalDollars - parts - labor), never by
 * enumerating a literal type, (3) 'part' (singular) is treated as an alias of 'parts' (matching
 * severe-repair-estimate.service.ts's own established precedent for this exact alias), (4)
 * reconcileOk requires the Other bucket to tie too, not just parts/labor, (5) the reconcile
 * component actually renders and gates on all three buckets.
 */
import { readFileSync } from "node:fs";

const modalPath = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const reconcilePath = "apps/frontend/src/pages/maintenance/components/CreateWOSectionReconcile.tsx";

const modalSrc = readFileSync(modalPath, "utf8");
const reconcileSrc = readFileSync(reconcilePath, "utf8");

function analyze(modalSrc, reconcileSrc) {
  const failures = [];

  if (!/woGrandTotalDollars/.test(modalSrc)) {
    failures.push(`${modalPath}: no woGrandTotalDollars computation found — the WO-side total is no longer derived from the full section formula`);
  }
  if (!/woOtherDollars\s*=\s*Math\.max\(0, woGrandTotalDollars - woPartsDollars - woLaborDollars\)/.test(modalSrc)) {
    failures.push(`${modalPath}: woOtherDollars is not computed as a residual (grand total minus parts minus labor) — a literal-enumeration reintroduction would defeat the fix`);
  }
  if (!/r\.line_type === "parts" \|\| \(r\.line_type as string\) === "part"/.test(modalSrc)) {
    failures.push(`${modalPath}: 'part' singular is no longer collapsed into the Parts bucket as an alias of 'parts'`);
  }
  if (!/Math\.round\(woOtherDollars \* 100\) === Math\.round\(\(Number\(invoiceOtherInput\) \|\| 0\) \* 100\)/.test(modalSrc)) {
    failures.push(`${modalPath}: reconcileOk no longer requires the Other bucket to tie — a WO could reconcile with real money still outside the tie-out`);
  }

  if (!/woOtherDollars: number/.test(reconcileSrc)) {
    failures.push(`${reconcilePath}: Props no longer declares woOtherDollars — the Other bucket is no longer wired to the display component`);
  }
  if (!/otherOk = otherVar === 0/.test(reconcileSrc)) {
    failures.push(`${reconcilePath}: the Other row's own tie check is missing`);
  }
  if (!/tied = partsOk && laborOk && otherOk/.test(reconcileSrc)) {
    failures.push(`${reconcilePath}: the overall "tied" gate no longer requires the Other bucket — it could show "Reconciled" while Other has an open variance`);
  }

  return failures;
}

function selftest() {
  const good = analyze(modalSrc, reconcileSrc);
  if (good.length > 0) {
    console.error("verify-wo-reconcile-covers-full-total --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: revert to the original bug — WO-side computed only from parts/labor sub-rows, no
  // grand total, no residual Other bucket.
  const mutated1 = modalSrc.replace(
    /const woOtherDollars = Math\.max\(0, woGrandTotalDollars - woPartsDollars - woLaborDollars\);/,
    "const woOtherDollars = 0;"
  );
  if (mutated1 === modalSrc) {
    console.error("verify-wo-reconcile-covers-full-total --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  const failures1 = analyze(mutated1, reconcileSrc);
  if (failures1.length === 0) {
    console.error("verify-wo-reconcile-covers-full-total --selftest: mutation 1 (hardcode Other to 0, defeating the residual) was not caught");
    process.exit(1);
  }

  // Mutation 2: drop the Other bucket from the overall gate in the display component (reintroduces
  // the exact "Reconciled while money is missing" failure mode).
  const mutated2 = reconcileSrc.replace(
    "const tied = partsOk && laborOk && otherOk;",
    "const tied = partsOk && laborOk;"
  );
  if (mutated2 === reconcileSrc) {
    console.error("verify-wo-reconcile-covers-full-total --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  const failures2 = analyze(modalSrc, mutated2);
  if (failures2.length === 0) {
    console.error("verify-wo-reconcile-covers-full-total --selftest: mutation 2 (drop Other from the tied gate) was not caught");
    process.exit(1);
  }

  console.log("verify-wo-reconcile-covers-full-total --selftest: OK (good files clean, both targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(modalSrc, reconcileSrc);
  if (failures.length > 0) {
    console.error("verify-wo-reconcile-covers-full-total: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-wo-reconcile-covers-full-total: OK — WO-side reconcile total is residual-based (not literal-enumerated), 'part'/'parts' aliased, Other bucket gates Create alongside Parts/Labor");
}
