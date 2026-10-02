// ROUND 326 queue item 8 (G-09) — signed-PDF categories resolve to catalogs.items BY ID through the one Lead map.
// Import-safe (no DB).
import { run } from "../verify-settlement-pdf-item-map.mjs";

export default {
  name: "settlement-pdf-item-map",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("settlement-pdf-item-map FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
