// ROUND 326 queue item 9 (G-01) — document-expense ingestion engine: per-line, catalog map by id, savepoint,
// source_settlement_ref, owner-run, dry run by default, never the bank. Import-safe (no DB).
import { run } from "../verify-document-expense-ingestion.mjs";

export default {
  name: "document-expense-ingestion",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("document-expense-ingestion FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
