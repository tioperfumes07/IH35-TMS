import { run } from "../verify-factoring-subledger-je-fk.mjs";
export default {
  name: "factoring-subledger-je-fk",
  run: async () => {
    const f = run();
    if (f.length) throw new Error("factoring-subledger-je-fk FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
  },
};
