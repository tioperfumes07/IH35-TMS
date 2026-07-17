// 0441-mod8-auto-match-button-dead — Auto-Match Suggestions must reach auto_matched_candidates worklist.
import { run } from "../verify-bank-automatch-button-wired.mjs";
export default {
  name: "bank-automatch-button-wired",
  run: async () => {
    const f = run();
    if (f.length) throw new Error("bank-automatch-button-wired FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
  },
};
