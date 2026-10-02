// Lead ROUND 339 order 1 — nothing posts to a deactivated / non-postable account. Import-safe (no DB).
import { run } from "../verify-no-posting-to-dead-account.mjs";

export default {
  name: "no-posting-to-dead-account",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-posting-to-dead-account FAIL:\n  " + failures.join("\n  "));
    }
  },
};
