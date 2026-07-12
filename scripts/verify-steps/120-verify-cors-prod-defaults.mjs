// 0243-h1-2 — CORS prod-defaults regression guard. Fails if the shared CORS config drops a prod origin,
// stops failing loud in production, or if index.ts reintroduces its own divergent localhost default.
import { run } from "../verify-cors-prod-defaults.mjs";

export default {
  name: "cors-prod-defaults",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("cors-prod-defaults FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
