const SCRIPT = "scripts/verify-saf-f28-safety-events-filter-pickers.mjs";
export default {
  name: "verify:saf-f28-safety-events-filter-pickers",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
