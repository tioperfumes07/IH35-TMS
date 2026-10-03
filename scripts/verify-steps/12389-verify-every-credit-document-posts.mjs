// ROUND 373.4: credit memos and manual vendor credits post on create (in-transaction) and reverse on void, through the
// canonical engine. Import-safe static half; the live half (no account-naming credit without its posting) runs in the
// money gate.
import { run } from "../verify-every-credit-document-posts.mjs";

export default {
  name: "every-credit-document-posts",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("every-credit-document-posts FAIL:\n  " + failures.join("\n  "));
  },
};
