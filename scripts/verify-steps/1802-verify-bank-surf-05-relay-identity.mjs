// BANK-SURF-05 — Relay wallet identity via CoA system_purpose (claim 1802).
import { run } from "../verify-bank-surf-05-relay-identity.mjs";
export default {
  name: "bank-surf-05-relay-identity",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-surf-05-relay-identity FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
