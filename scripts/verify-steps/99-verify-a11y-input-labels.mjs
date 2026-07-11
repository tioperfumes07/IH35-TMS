// 0243-g8-4 wired into verify:pre-commit. Fails when a NEW native <input>/<textarea> with a placeholder
// but no accessible name is added (forward-only ratchet). Import-safe.
import { run } from "../verify-a11y-input-labels.mjs";

export default {
  name: "a11y-input-labels",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("a11y-input-labels FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
