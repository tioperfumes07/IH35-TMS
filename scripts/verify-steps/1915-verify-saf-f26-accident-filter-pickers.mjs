const SCRIPT = "scripts/verify-saf-f26-accident-filter-pickers.mjs";
export default {
  name: "verify:saf-f26-accident-filter-pickers",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
