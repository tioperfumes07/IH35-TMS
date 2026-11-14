#!/usr/bin/env node
/** verify-step 20174 — Factoring aging_basis URL SoT */
export default {
  name: "verify-factoring-aging-basis-url",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-aging-basis-url.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-aging-basis-url.mjs"]);
  },
};
