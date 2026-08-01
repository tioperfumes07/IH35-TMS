const SCRIPT = "scripts/verify-wave-h2-ops-fk-null-rates.mjs";
export default {
  name: "verify:wave-h2-ops-fk-null-rates",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
