// 0243-g7-4 — e2e false-green regression guard. Fails if any Playwright spec asserts nothing
// (no expect(...)) and is not explicitly test.skip(true, ...).
import { run } from "../verify-e2e-specs-assert-or-skip.mjs";

export default {
  name: "e2e-specs-assert-or-skip",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("e2e-specs-assert-or-skip FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
