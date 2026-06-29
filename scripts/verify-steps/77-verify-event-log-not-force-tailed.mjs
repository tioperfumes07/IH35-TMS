import fs from "node:fs";
import path from "node:path";

// RLS Block B regression lock: the FORCE-TAIL migration must NEVER force events.event_log (a
// SECURITY DEFINER write target — forcing it without the GUC fix breaks events.log_event) nor the 8
// genuinely-global reference/lib tables. This guard fails if the force-tail migration drops any of
// these from its EXCLUDE set, or if ANY migration literally `ALTER TABLE events.event_log FORCE`s it
// (Part 2 will force event_log via a separate, GUC-reconciled, explicitly-named migration — when that
// lands, update this guard deliberately).
const MUST_EXCLUDE = [
  "events.event_log",
  "reference.cbp_wait_times_cache",
  "reference.cdl_endorsements",
  "reference.cdl_restrictions",
  "reference.employment_statuses",
  "reference.license_classes",
  "reference.medical_card_statuses",
  "reference.oem_parts",
  "lib.feature_flags",
];

export default {
  name: "verify-event-log-not-force-tailed",
  run: async () => {
    const dir = path.resolve("db/migrations");
    const forceTail = fs
      .readdirSync(dir)
      .filter((f) => /rls_force_tail/i.test(f) && f.endsWith(".sql"))
      .map((f) => ({ f, src: fs.readFileSync(path.join(dir, f), "utf8") }));

    const fails = [];
    if (!forceTail.length) {
      // nothing to check yet (migration not present) — pass quietly
      console.log("verify-event-log-not-force-tailed OK — no force-tail migration present.");
      return;
    }
    for (const { f, src } of forceTail) {
      for (const rel of MUST_EXCLUDE) {
        if (!src.includes(`'${rel}'`)) fails.push(`${f}: missing '${rel}' from the EXCLUDE set.`);
      }
    }

    // No migration may literally force events.event_log (until the deliberate Part-2 migration).
    const allSql = fs
      .readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .map((x) => fs.readFileSync(path.join(dir, x), "utf8"))
      .join("\n");
    if (/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?events\.event_log\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(allSql)) {
      fails.push("a migration literally FORCEs events.event_log — that is Part 2 and must be a separate, GUC-reconciled, named migration (update this guard deliberately when it lands).");
    }

    if (fails.length) {
      console.error("verify-event-log-not-force-tailed FAILED:");
      for (const x of fails) console.error("  " + x);
      process.exit(1);
    }
    console.log("verify-event-log-not-force-tailed OK — event_log + 8 global tables excluded from force-tail; no literal event_log FORCE.");
  },
};
