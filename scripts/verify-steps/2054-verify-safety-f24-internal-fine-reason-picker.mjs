// SAF-F24 Internal Fines reason picker inline create (Cursor even claim 2054).
import { collectSafetyF24Problems } from "../verify-safety-f24-internal-fine-reason-picker.mjs";

export default {
  name: "safety-f24-internal-fine-reason-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-f24-internal-fine-reason-picker.mjs", "--selftest"]);
    const problems = collectSafetyF24Problems();
    if (problems.length) {
      throw new Error(
        "safety-f24-internal-fine-reason-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
