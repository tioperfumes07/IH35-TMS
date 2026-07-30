// BANK-F12 — Transfer → bank reverse (claim 1810).
import { run } from "../verify-transfer-bank-reverse-links.mjs";
export default {
  name: "transfer-bank-reverse-links",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("transfer-bank-reverse-links FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
