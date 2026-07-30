// TOOL — MODULE_COMPLETION_AUTOGEN husky lock (claim 1806).
import { run } from "../verify-module-completion-autogen-precommit.mjs";
export default {
  name: "module-completion-autogen-precommit",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("module-completion-autogen-precommit FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
