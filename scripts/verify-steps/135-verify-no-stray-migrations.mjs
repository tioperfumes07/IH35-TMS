// GOVERNANCE (FINAL-DEEP-DB-AUDIT §7b) wired into verify:pre-commit. Fails if a NEW migration .sql is added
// outside db/migrations/ (a second, runner-invisible source = prod schema drift). Import-safe (no DB).
import { run } from "../verify-no-stray-migrations.mjs";

export default {
  name: "no-stray-migrations",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-stray-migrations FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
