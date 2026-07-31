const SCRIPT = "scripts/verify-saf-f32-permits-deadline-honesty.mjs";
export default {
  name: "verify:saf-f32-permits-deadline-honesty",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
