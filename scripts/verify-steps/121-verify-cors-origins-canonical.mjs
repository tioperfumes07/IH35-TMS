// fix/cors-origins-canonical — canonical CORS origin-list guard. Fails if the versioned default drops a
// known real prod origin (app/driver/api .ih35dispatch.com) or if a wildcard origin is ever introduced.
import { run } from "../verify-cors-origins-canonical.mjs";

export default {
  name: "cors-origins-canonical",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("cors-origins-canonical FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
