const SCRIPT = "scripts/verify-saf-f27-no-safety-rel-abs-twins.mjs";

export default {
  name: "verify:saf-f27-no-safety-rel-abs-twins",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
