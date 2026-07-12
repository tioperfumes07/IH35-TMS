// 0519-ri1(a) — orphan-FK inventory ratchet. Fails if a NEW migration introduces an `*_id`/`*_uuid`
// column with no inline REFERENCES that is not already baselined. Adding the real FK constraints is
// owner-gated schema work (db-integrity-hardening-0519); this is the non-financial inventory half.
import { run } from "../verify-orphan-fk-inventory.mjs";

export default {
  name: "orphan-fk-inventory",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error(
        "orphan-fk-inventory FAIL (add a FK, or baseline via UPDATE_ORPHAN_FK_BASELINE=1):\n  " +
          failures.map((f) => "✗ " + f).join("\n  "),
      );
    }
  },
};
