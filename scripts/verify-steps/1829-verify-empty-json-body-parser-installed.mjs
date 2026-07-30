// Regression guard wired into verify:pre-commit. Fails if the empty-application/json-body tolerance
// (installEmptyJsonBodyParser) is missing from either Fastify app builder — the fix for the prod
// FST_ERR_CTP_EMPTY_JSON_BODY on categorization-rules/:id/apply-historical. Import-safe (no DB).
import { run } from "../verify-empty-json-body-parser-installed.mjs";

export default {
  name: "empty-json-body-parser-installed",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("empty-json-body-parser-installed FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
