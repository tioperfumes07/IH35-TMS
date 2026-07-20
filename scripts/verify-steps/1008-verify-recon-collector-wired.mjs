// D-#1 RECON-COLLECTOR. Fails when the QBO remote-count collector cron is un-wired, narrowed to a
// subset of entity types, or flipped to opt-in. Import-safe; throws so the suite goes red.
import { run } from "../verify-recon-collector-wired.mjs";

export default {
  name: "recon-collector-wired",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("recon-collector-wired FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
