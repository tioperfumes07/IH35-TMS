// P2-BILLLINE-LOADID wired into verify:pre-commit. Fails if the bill_lines.load_id FK->mdata.loads
// migration is weakened/removed/repointed. Import-safe.
import { run } from "../verify-bill-lines-load-id.mjs";
export default {
  name: "bill-lines-load-id",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("bill-lines-load-id FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
  },
};
