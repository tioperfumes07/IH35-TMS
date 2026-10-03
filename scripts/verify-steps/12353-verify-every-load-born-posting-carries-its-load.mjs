// ROUND 363-CC1-A (LAW 363.2): every posting INSERT stamps load_id through accounting.posting_source_load_id() (or a
// stated "NULL by design"). Import-safe static half; the live half (every posting since 202615350500 carries exactly
// the load its source names) runs in the money gate.
import { run } from "../verify-every-load-born-posting-carries-its-load.mjs";

export default {
  name: "every-load-born-posting-carries-its-load",
  run: async () => {
    const { failures } = run();
    if (failures.length) {
      throw new Error("every-load-born-posting-carries-its-load FAIL:\n  " + failures.join("\n  "));
    }
  },
};
