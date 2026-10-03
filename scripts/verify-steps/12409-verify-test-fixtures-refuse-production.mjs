// ROUND 390.1: a test fixture can never write production — every fixture and self-connecting DB test refuses the
// production endpoint / Neon branch, with the constants mirrored from the shared prod-target libraries.
import { run } from "../verify-test-fixtures-refuse-production.mjs";

export default {
  name: "test-fixtures-refuse-production",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("test-fixtures-refuse-production FAIL:\n  " + problems.join("\n  "));
  },
};
