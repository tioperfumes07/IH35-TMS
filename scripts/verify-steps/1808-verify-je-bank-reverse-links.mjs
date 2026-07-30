// ACCT-F18 — JE → bank reverse (claim 1808).
import { run } from "../verify-je-bank-reverse-links.mjs";
export default {
  name: "je-bank-reverse-links",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("je-bank-reverse-links FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
