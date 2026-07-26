// 1487-verify-held-set-covers-every-section — EVERY registry section is in the prod-skip set.
//
// WHY: .held-migrations.json is the set db:migrate consults to REFUSE a migration on prod. It is now
// multi-section — `held` (not yet applied), `applied_held` (already applied by hand), `superseded` (must
// never be applied). All three mean the same thing to the runner; they differ only in WHY.
//
// The incident this pins: when `superseded` was introduced on 2026-07-25, both loaders unioned a HARDCODED
// [held, applied_held]. 202607790000 moved into the new section and silently left the skip set — becoming an
// ordinary pending migration armed to fire on the next prod deploy. That migration creates a "Cost of
// Labor-Mexico Drivers" account which ALREADY exists for all three entities, so the deploy would have
// duplicated the CoA. Adding a section to a JSON file must never be able to arm a migration.
//
// The assertion is per-section and behavioural: for every array section in the registry it drives the real
// shouldSkipHeldOnProd() decision. A new section added next month is covered on the day it appears, with no
// edit here — the failure mode was a hardcoded list, so the guard must not contain one either.
import fs from "node:fs";
import path from "node:path";
import { loadHeldSet, shouldSkipHeldOnProd } from "../lib/held-migrations.mjs";

const REGISTRY = "db/migrations/.held-migrations.json";

export function sectionsOf(registryPath = REGISTRY) {
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return Object.entries(parsed)
    .filter(([, v]) => Array.isArray(v))
    .map(([name, entries]) => [name, entries.map((e) => e?.file).filter(Boolean)]);
}

export default {
  name: "verify:held-set-covers-every-section",
  run() {
    const dir = path.resolve("db/migrations");
    const heldSet = loadHeldSet(dir);
    const sections = sectionsOf();
    const problems = [];
    let total = 0;

    for (const [name, files] of sections) {
      total += files.length;
      for (const file of files) {
        if (!shouldSkipHeldOnProd({ file, heldSet, isProd: true, allowHeldProdMigrate: false })) {
          problems.push(
            `${file} is registered under "${name}" but shouldSkipHeldOnProd() returned FALSE for a PROD ` +
              `target — db:migrate would EXECUTE it on the next prod deploy. Every registry section is a ` +
              `skip section; the loaders must union sections dynamically, not by name.`,
          );
        }
      }
    }
    if (heldSet.size !== total) {
      problems.push(`loadHeldSet has ${heldSet.size} files but the registry lists ${total} across ${sections.length} section(s).`);
    }
    // Inverse arm: an unregistered migration must still apply, so "skip everything" cannot pass this guard.
    if (shouldSkipHeldOnProd({ file: "0001_init.sql", heldSet, isProd: true, allowHeldProdMigrate: false })) {
      problems.push("an UNREGISTERED migration was skipped on prod — the held control is over-matching.");
    }

    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:held-set-covers-every-section FAIL — ${problems.length} problem(s)`);
    }
    console.log(
      `verify:held-set-covers-every-section OK — ${total} files across ${sections.length} section(s) ` +
        `(${sections.map(([n, f]) => `${n}=${f.length}`).join(", ")}) all refused on prod; unregistered files still apply.`,
    );
    return 0;
  },
};
