// FIX-06 — inline "+ Create" coverage ratchet, wired into the verify-steps chain.
// Fails when a NEW plain <select>/<SelectCombobox> selecting an accounting entity
// (vendor/customer/category-account/item/product-service) appears on an accounting create/edit form
// with no inline "+ Add new" (forward-only ratchet vs a committed baseline). Import-safe.
import { run } from "../verify-referenceselect-coverage-ratchet.mjs";

export default {
  name: "referenceselect-coverage-ratchet",
  run: async () => {
    const { ok, novel } = run();
    if (!ok) {
      throw new Error(
        "referenceselect-coverage-ratchet FAIL — NEW accounting-entity dropdown must use ReferenceSelect:\n  " +
          novel.map((f) => "✗ " + f).join("\n  ")
      );
    }
  },
};
