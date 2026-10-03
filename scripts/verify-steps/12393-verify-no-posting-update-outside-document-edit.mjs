// ROUND 363-CC1-D: no writer moves a posted journal_entry_postings line in place — only bookkeeping columns and
// fill-once links are ever SET; the reclassify engine posts a reclassification entry. Import-safe static half; the
// live half (the database trigger is installed and refusing) runs in the money gate.
import { run } from "../verify-no-posting-update-outside-document-edit.mjs";

export default {
  name: "no-posting-update-outside-document-edit",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("no-posting-update-outside-document-edit FAIL:\n  " + failures.join("\n  "));
  },
};
