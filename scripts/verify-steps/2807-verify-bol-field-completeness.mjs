const SCRIPT = "scripts/verify-bol-field-completeness.mjs";
export default {
  name: "verify:bol-field-completeness",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
