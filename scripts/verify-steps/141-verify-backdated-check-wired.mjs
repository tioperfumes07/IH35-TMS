// 0441-mod8-backdated-check-dead — Create backdated check must open categorize flow, not toast stub.
import { run } from "../verify-backdated-check-wired.mjs";
export default {
  name: "backdated-check-wired",
  run: async () => {
    const f = run();
    if (f.length) throw new Error("backdated-check-wired FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
  },
};
